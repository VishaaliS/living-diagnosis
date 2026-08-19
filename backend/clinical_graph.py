import os
import re
import json
import difflib
from datetime import datetime
from typing import TypedDict, List, Optional

import pandas as pd
from openai import AzureOpenAI
from langgraph.graph import StateGraph, END

# ─────────────────────────────────────────────────────────────────
# 0. CONFIG & SHARED RESOURCES
# ─────────────────────────────────────────────────────────────────

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
AZURE_OPENAI_EMBEDDING_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")  # not set yet — fallback active

AZURE_CONFIGURED = bool(AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY)

client: Optional[AzureOpenAI] = None
if AZURE_CONFIGURED:
    client = AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_API_VERSION,
    )

CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "guideline_changes.csv")
registry_df = pd.read_csv(CSV_PATH)
registry_df["keywords_for_matching"] = registry_df["keywords_for_matching"].fillna("")

GUIDELINE_MATCH_THRESHOLD = 0.95  # kept exactly as specified — do not change
DISCLAIMER = ("This is not a diagnosis. Please consult a licensed mental "
              "health professional to discuss these findings.")


def normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


# ─────────────────────────────────────────────────────────────────
# 1. DEFINE THE STATE (Memory passed between agents)
# ─────────────────────────────────────────────────────────────────
class ClinicalState(TypedDict):
    raw_notes: str
    redacted_notes: str
    extracted_diagnosis: Optional[str]
    extracted_year: Optional[str]
    extracted_symptoms: List[str]
    guideline_matched: bool
    guideline_penalty: float
    semantic_drift_score: float
    time_penalty: float
    freshness_score: int
    patient_explanation: str
    crisis_flag: bool


# ─────────────────────────────────────────────────────────────────
# 2. DEFINE AGENT NODES
# ─────────────────────────────────────────────────────────────────

def redactor_agent(state: ClinicalState) -> dict:
    """
    LLM Agent 0: Privacy & Anonymization.
    Scrubs PII before any clinical processing happens.
    """
    raw_notes = state["raw_notes"]
    
    if not AZURE_CONFIGURED or client is None:
        return {"redacted_notes": raw_notes}
        
    system_prompt = """You are a strict medical data anonymizer. 
    Read the provided clinical notes and replace any Personally Identifiable Information (PII) 
    including patient names, doctor names, phone numbers, addresses, and ID numbers with '[REDACTED]'. 
    Do not change any clinical symptoms, medical history, or diagnoses. 
    Output ONLY the anonymized text."""
    
    try:
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": raw_notes}
            ],
            temperature=0, 
        )
        return {"redacted_notes": response.choices[0].message.content.strip()}
    except Exception as e:
        print(f"⚠️ redactor_agent failed: {e}")
        return {"redacted_notes": raw_notes}


def extractor_agent(state: ClinicalState) -> dict:
    """
    LLM Agent 1: Structured Entity Parsing.
    Reads unstructured text and extracts diagnosis, year, and symptoms.
    """
    safe_notes = state.get("redacted_notes", state["raw_notes"])
    
    if not AZURE_CONFIGURED or client is None:
        return {
            "extracted_diagnosis": None,
            "extracted_year": None,
            "extracted_symptoms": [],
        }
        
    system_prompt = """You are a clinical information extraction assistant.
    Extract ONLY the following fields from the patient notes provided, and
    respond with STRICT JSON only, no commentary, matching this exact schema:
    {
      "diagnosis": string or null,
      "year": string or null (e.g. "2011"),
      "symptoms": array of strings
    }
    Do not diagnose. Do not infer information not present in the text.
    If a field is not mentioned, use null or an empty array."""
    
    try:
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": safe_notes},
            ],
            temperature=0,
        )
        parsed = json.loads(response.choices[0].message.content)
        return {
            "extracted_diagnosis": parsed.get("diagnosis"),
            "extracted_year": parsed.get("year"),
            "extracted_symptoms": parsed.get("symptoms", []),
        }
    except Exception as e:
        print(f"⚠️ extractor_agent failed: {e}")
        return {
            "extracted_diagnosis": None,
            "extracted_year": None,
            "extracted_symptoms": [],
        }

def extractor_agent(state: ClinicalState) -> dict:
    """
    LLM Agent 1: Structured Entity Parsing.
    Reads unstructured text and extracts diagnosis, year, and symptoms.
    """
    raw_notes = state["raw_notes"]

    if not AZURE_CONFIGURED or client is None:
        # Graceful degradation — graph continues, downstream agents
        # will see empty extraction and short-circuit accordingly.
        return {
            "extracted_diagnosis": None,
            "extracted_year": None,
            "extracted_symptoms": [],
        }

    system_prompt = """You are a clinical information extraction assistant.
Extract ONLY the following fields from the patient notes provided, and
respond with STRICT JSON only, no commentary, matching this exact schema:

{
  "diagnosis": string or null,
  "year": string or null (e.g. "2011"),
  "symptoms": array of strings
}

Do not diagnose. Do not infer information not present in the text.
If a field is not mentioned, use null or an empty array."""

    try:
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": raw_notes},
            ],
            temperature=0,
        )
        parsed = json.loads(response.choices[0].message.content)

        return {
            "extracted_diagnosis": parsed.get("diagnosis"),
            "extracted_year": parsed.get("year"),
            "extracted_symptoms": parsed.get("symptoms", []),
        }

    except Exception as e:
        print(f"⚠️ extractor_agent failed: {e}")
        return {
            "extracted_diagnosis": None,
            "extracted_year": None,
            "extracted_symptoms": [],
        }


def match_guideline(diagnosis: Optional[str]) -> dict:
    """Deterministic fuzzy match against guideline_changes.csv. 0.95 threshold."""
    if not diagnosis or registry_df.empty:
        return {"matched": False}

    norm_diagnosis = normalize(diagnosis)
    best_row = None
    best_score = 0.0

    for _, row in registry_df.iterrows():
        candidates = [normalize(row["old_label"])]
        candidates += [normalize(k) for k in str(row["keywords_for_matching"]).split(";") if k.strip()]

        for candidate in candidates:
            if not candidate:
                continue
            if candidate in norm_diagnosis or norm_diagnosis in candidate:
                score = 1.0
            else:
                score = difflib.SequenceMatcher(None, candidate, norm_diagnosis).ratio()

            if score > best_score:
                best_score = score
                best_row = row

    if best_row is not None and best_score >= GUIDELINE_MATCH_THRESHOLD:
        return {
            "matched": True,
            "entry_id": best_row["entry_id"],
            "old_label": best_row["old_label"],
            "new_label": best_row["new_label"],
            "change_type": best_row["change_type"],
            "change_summary": best_row["change_summary"],
            "severity_weight": float(best_row["severity_weight"]),
            "source_citation": best_row["source_citation"],
        }

    return {"matched": False}


def compute_semantic_drift(symptoms: List[str], guideline_match: dict) -> float:
    """
    Embedding-based cosine distance when AZURE_OPENAI_EMBEDDING_DEPLOYMENT
    is configured (e.g. text-embedding-3-large). Falls back to a difflib
    text-similarity heuristic otherwise — this fallback is currently ACTIVE
    since no embedding deployment exists in .env yet. Do not remove either path.
    """
    if not symptoms:
        return 0.0

    symptom_text = normalize(" ".join(symptoms))

    if guideline_match.get("matched") and guideline_match.get("entry_id"):
        row = registry_df[registry_df["entry_id"] == guideline_match["entry_id"]].iloc[0]
        reference_text = normalize(row["current_criteria_summary"])
    else:
        if registry_df.empty:
            return 0.0
        best_ratio = 0.0
        reference_text = ""
        for _, row in registry_df.iterrows():
            ref = normalize(row["current_criteria_summary"])
            ratio = difflib.SequenceMatcher(None, symptom_text, ref).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                reference_text = ref

    # --- Vector embedding path (auto-activates once deployment exists) ---
    if AZURE_OPENAI_EMBEDDING_DEPLOYMENT and client is not None:
        try:
            import numpy as np

            emb_response = client.embeddings.create(
                model=AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
                input=[symptom_text, reference_text],
            )
            vec_a = np.array(emb_response.data[0].embedding)
            vec_b = np.array(emb_response.data[1].embedding)
            cosine_sim = float(
                np.dot(vec_a, vec_b) / (np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
            )
            drift_score = 1.0 - cosine_sim
            return max(0.0, min(1.0, drift_score))
        except Exception as e:
            print(f"⚠️ Embedding call failed, falling back to heuristic: {e}")

    # --- Fallback heuristic path (currently active) ---
    similarity_ratio = difflib.SequenceMatcher(None, symptom_text, reference_text).ratio()
    drift_score = 1.0 - similarity_ratio
    return round(max(0.0, min(1.0, drift_score)), 2)


def researcher_agent(state: ClinicalState) -> dict:
    """
    Deterministic Tool Node: Clinical Guideline & Semantic Drift.
    Executes:
      - 0.95 fuzzy matching against guideline_changes.csv
      - Cosine distance embedding computation (or fallback heuristic)
      - Deterministic penalty math
    """
    diagnosis = state.get("extracted_diagnosis")
    symptoms = state.get("extracted_symptoms", [])
    year = state.get("extracted_year")

    if not diagnosis:
        return {
            "guideline_matched": False,
            "guideline_penalty": 0.0,
            "semantic_drift_score": 0.0,
            "time_penalty": 0.0,
            "freshness_score": 100,
        }

    guideline_match = match_guideline(diagnosis)
    semantic_drift_score = compute_semantic_drift(symptoms, guideline_match)

    guideline_matched = guideline_match.get("matched", False)
    guideline_penalty = 40 * guideline_match.get("severity_weight", 0) if guideline_matched else 0.0

    # extracted_year is a string (or None) per the state schema — parse safely
    current_year = datetime.now().year
    try:
        diagnosis_year = int(year) if year else None
    except (ValueError, TypeError):
        diagnosis_year = None
    years_since = (current_year - diagnosis_year) if diagnosis_year else 5
    time_penalty = 20 * min(years_since / 10, 1)

    freshness_score = 100 - guideline_penalty - (25 * semantic_drift_score) - time_penalty
    freshness_score = max(0, min(100, round(freshness_score)))

    return {
        "guideline_matched": guideline_matched,
        "guideline_penalty": round(guideline_penalty, 1),
        "semantic_drift_score": semantic_drift_score,
        "time_penalty": round(time_penalty, 1),
        "freshness_score": freshness_score,
    }


def communicator_agent(state: ClinicalState) -> dict:
    """
    LLM Agent 3: Patient Communication & Synthesis.
    Consumes the mathematical scores, guideline context, and drift metrics
    to generate an empathetic, constrained summary with a medical disclaimer.
    """
    score = state.get("freshness_score", 100)
    drift = state.get("semantic_drift_score", 0.0)
    matched = state.get("guideline_matched", False)
    diagnosis = state.get("extracted_diagnosis")
    year = state.get("extracted_year")

    if not AZURE_CONFIGURED or client is None:
        return {
            "patient_explanation": f"Freshness score calculated: {score}/100. "
                                    f"(AI explanation unavailable — Azure not configured.) {DISCLAIMER}"
        }

    system_prompt = f"""You are explaining a diagnostic freshness score to a
patient in plain, warm, non-alarming language. You must ONLY reference the
facts provided to you below. NEVER suggest what the correct diagnosis might
be. NEVER provide medical advice beyond recommending professional
consultation. Keep it to 3-4 sentences. Always end your response with
exactly this sentence: "{DISCLAIMER}"

Facts:
- Original diagnosis: {diagnosis}
- Diagnosis year: {year}
- Freshness score: {score}/100
- Guideline change detected: {matched}
- Semantic symptom drift score: {drift}
"""

    try:
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Please generate the explanation now."},
            ],
            temperature=0.3,
        )
        return {"patient_explanation": response.choices[0].message.content.strip()}

    except Exception as e:
        print(f"⚠️ communicator_agent failed: {e}")
        return {
            "patient_explanation": f"Freshness score calculated: {score}/100. {DISCLAIMER}"
        }


# ─────────────────────────────────────────────────────────────────
# 3. CONSTRUCT THE GRAPH & DEFINE EDGES
# ─────────────────────────────────────────────────────────────────

def build_clinical_graph():
    workflow = StateGraph(ClinicalState)
    
    # 1. Register all four nodes
    workflow.add_node("redactor", redactor_agent)
    workflow.add_node("extractor", extractor_agent)
    workflow.add_node("researcher", researcher_agent)
    workflow.add_node("communicator", communicator_agent)
    
    # 2. Set the flow pipeline
    workflow.set_entry_point("redactor")
    workflow.add_edge("redactor", "extractor")
    workflow.add_edge("extractor", "researcher")
    workflow.add_edge("researcher", "communicator")
    workflow.add_edge("communicator", END)
    
    return workflow.compile()


clinical_graph_app = build_clinical_graph()