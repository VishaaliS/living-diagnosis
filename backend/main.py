"""
Living Diagnosis — Backend Engine (main.py)
FastAPI server with Azure OpenAI integration.

Pipeline order (STRICT — do not reorder):
  1. Emergency Brake (pure Python regex, NO LLM, runs first, always)
  2. AI Extraction (Azure OpenAI chat completion, JSON mode)
  3. Guideline Matching (rule-based lookup against CSV registry)
  4. Semantic Drift Check (heuristic similarity, embedding-ready hook)
  5. Freshness Score Calculation (deterministic formula, pure Python)
  6. Human-Facing Explanation (Azure OpenAI chat completion, constrained)
"""

import os
import re
import json
import difflib
from datetime import datetime
from typing import Optional, List

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AzureOpenAI
from clinical_graph import clinical_graph_app
# ─────────────────────────────────────────────────────────────────
# ENVIRONMENT & AZURE CLIENT SETUP
# ─────────────────────────────────────────────────────────────────

load_dotenv()

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")

# Optional — only used if you later deploy an embedding model on Azure.
# If not set, the system automatically falls back to a text-similarity
# heuristic for semantic drift detection (see compute_semantic_drift()).
AZURE_OPENAI_EMBEDDING_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")

client: Optional[AzureOpenAI] = None
AZURE_CONFIGURED = bool(AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY)

if AZURE_CONFIGURED:
    client = AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_API_VERSION,
    )
else:
    print("⚠️  WARNING: Azure OpenAI credentials not found in .env — "
          "LLM-dependent steps (extraction, explanation) will fail gracefully. "
          "The Emergency Brake crisis check will still function normally.")

# ─────────────────────────────────────────────────────────────────
# FASTAPI APP SETUP
# ─────────────────────────────────────────────────────────────────

app = FastAPI(title="Living Diagnosis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────
# DATA LAYER — Guideline Change Registry
# ─────────────────────────────────────────────────────────────────

CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "guideline_changes.csv")

try:
    registry_df = pd.read_csv(CSV_PATH)
    registry_df["keywords_for_matching"] = registry_df["keywords_for_matching"].fillna("")
    print(f"✅ Loaded {len(registry_df)} rows from guideline_changes.csv")
except FileNotFoundError:
    registry_df = pd.DataFrame()
    print(f"⚠️  WARNING: {CSV_PATH} not found. Guideline matching will return no matches.")


# ─────────────────────────────────────────────────────────────────
# REQUEST / RESPONSE MODELS
# ─────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    patient_notes: str


class ExtractedData(BaseModel):
    diagnosis: Optional[str] = None
    diagnosis_date: Optional[str] = None
    diagnosis_year: Optional[int] = None
    framework: Optional[str] = None
    symptoms: List[str] = []
    medications: List[str] = []
    confidence: Optional[float] = None


class GuidelineMatch(BaseModel):
    matched: bool = False
    entry_id: Optional[str] = None
    old_label: Optional[str] = None
    new_label: Optional[str] = None
    change_type: Optional[str] = None
    change_summary: Optional[str] = None
    severity_weight: Optional[float] = None
    source_citation: Optional[str] = None


class AnalyzeResponse(BaseModel):
    crisis_triggered: bool
    crisis_message: Optional[str] = None
    extracted: Optional[ExtractedData] = None
    guideline_match: Optional[GuidelineMatch] = None
    semantic_drift_score: Optional[float] = None
    freshness_score: Optional[int] = None
    score_color: Optional[str] = None
    explanation: Optional[str] = None
    score_breakdown: Optional[dict] = None
    warnings: List[str] = []


# ─────────────────────────────────────────────────────────────────
# STEP 1 — EMERGENCY BRAKE
# Pure Python regex. ZERO LLM calls. ZERO dependency on Azure OpenAI.
# This function must run first, always, before any AI processing,
# and its decision can never be overridden downstream.
# It will work correctly even if Azure credentials are missing,
# invalid, or the Azure API is completely unreachable.
# ─────────────────────────────────────────────────────────────────

CRISIS_PATTERNS = [
    r"\b(suicid(e|al)|kill myself|end my life|self[- ]harm)\b",
    r"\b(no reason to (live|go on)|can'?t go on|want to die)\b",
    r"\bplan(ning)? to (hurt|harm|kill) (myself|me)\b",
    r"\b(cutting myself|hurting myself)\b",
]

CRISIS_MESSAGE = (
    "We noticed language in your notes that may indicate you're going "
    "through a crisis. You are not alone, and support is available right "
    "now: National Suicide Prevention Lifeline: 988 (US) | Crisis Text "
    "Line: Text HOME to 741741 | If you are in immediate danger, please "
    "call emergency services. This tool cannot provide crisis support — "
    "please reach out to one of the resources above or a trusted person "
    "immediately."
)


def check_crisis(text: str) -> dict:
    """
    Deterministic, non-LLM crisis language detector.
    Runs on raw text using only Python's built-in `re` module.
    This function has NO dependency on Azure OpenAI or any external
    API — it must remain this way. Never move this check after any
    LLM call, and never replace it with model-based judgment.
    """
    for pattern in CRISIS_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return {"crisis_flag": True, "trigger": pattern}
    return {"crisis_flag": False, "trigger": None}


# ─────────────────────────────────────────────────────────────────
# STEP 2 — AI EXTRACTION (Azure OpenAI, JSON mode)
# ─────────────────────────────────────────────────────────────────

def extract_clinical_data(text: str) -> ExtractedData:
    if not AZURE_CONFIGURED or client is None:
        raise RuntimeError("Azure OpenAI is not configured — cannot run extraction.")

    system_prompt = """You are a clinical information extraction assistant.
Extract ONLY the following fields from the patient notes provided, and
respond with STRICT JSON only, no commentary, matching this exact schema:

{
  "diagnosis": string or null,
  "diagnosis_date": string or null (e.g. "2011-06" or "2011"),
  "diagnosis_year": integer or null,
  "framework": string or null (e.g. "DSM-IV-TR", "DSM-5", "ICD-10", "ICD-11", "unstated"),
  "symptoms": array of strings,
  "medications": array of strings,
  "confidence": float between 0 and 1 representing your confidence in this extraction
}

Do not diagnose. Do not infer information not present in the text.
If a field is not mentioned, use null or an empty array."""

    response = client.chat.completions.create(
        model=AZURE_OPENAI_DEPLOYMENT,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        temperature=0,
    )

    raw = response.choices[0].message.content
    data = json.loads(raw)
    return ExtractedData(**data)


# ─────────────────────────────────────────────────────────────────
# STEP 3 — GUIDELINE MATCHING (rule-based, no LLM)
# ─────────────────────────────────────────────────────────────────

def normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def match_guideline(diagnosis: Optional[str]) -> GuidelineMatch:
    if not diagnosis or registry_df.empty:
        return GuidelineMatch(matched=False)

    norm_diagnosis = normalize(diagnosis)
    best_row = None
    best_score = 0.0

    for _, row in registry_df.iterrows():
        candidates = [normalize(row["old_label"])]
        candidates += [normalize(k) for k in str(row["keywords_for_matching"]).split(";") if k.strip()]

        for candidate in candidates:
            if not candidate:
                continue
            # Exact/substring match gets top priority
            if candidate in norm_diagnosis or norm_diagnosis in candidate:
                score = 1.0
            else:
                score = difflib.SequenceMatcher(None, candidate, norm_diagnosis).ratio()

            if score > best_score:
                best_score = score
                best_row = row

    # CHANGED: Threshold increased to 0.95 to avoid false positives on unrelated diagnoses
    if best_row is not None and best_score >= 0.95:
        return GuidelineMatch(
            matched=True,
            entry_id=best_row["entry_id"],
            old_label=best_row["old_label"],
            new_label=best_row["new_label"],
            change_type=best_row["change_type"],
            change_summary=best_row["change_summary"],
            severity_weight=float(best_row["severity_weight"]),
            source_citation=best_row["source_citation"],
        )

    return GuidelineMatch(matched=False)


# ─────────────────────────────────────────────────────────────────
# STEP 4 — SEMANTIC DRIFT CHECK
# Fallback heuristic (no embedding deployment configured).
# If AZURE_OPENAI_EMBEDDING_DEPLOYMENT is set in .env, this function
# will use real embeddings + cosine similarity instead.
# ─────────────────────────────────────────────────────────────────

def compute_semantic_drift(symptoms: List[str], guideline_match: GuidelineMatch) -> float:
    if not symptoms:
        return 0.0

    # CHANGED: If there is no guideline match, there is no drift. Return 0.0 immediately.
    if not guideline_match.matched:
        return 0.0

    symptom_text = normalize(" ".join(symptoms))

    # Determine which "current criteria" text to compare against
    if guideline_match.matched and guideline_match.entry_id:
        row = registry_df[registry_df["entry_id"] == guideline_match.entry_id].iloc[0]
        reference_text = normalize(row["current_criteria_summary"])

    # --- OPTIONAL: real embedding-based path (auto-used if configured) ---
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
            print(f"⚠️  Embedding call failed, falling back to heuristic: {e}")

    # --- Fallback heuristic path (default, no embedding deployment needed) ---
    similarity_ratio = difflib.SequenceMatcher(None, symptom_text, reference_text).ratio()
    drift_score = 1.0 - similarity_ratio
    return round(max(0.0, min(1.0, drift_score)), 2)
# ─────────────────────────────────────────────────────────────────
# STEP 5 — FRESHNESS SCORE CALCULATION (deterministic, pure Python)
# ─────────────────────────────────────────────────────────────────

def calculate_freshness_score(
    guideline_match: GuidelineMatch,
    semantic_drift_score: float,
    diagnosis_year: Optional[int],
) -> dict:
    current_year = datetime.now().year
    years_since = (current_year - diagnosis_year) if diagnosis_year else 5

    guideline_penalty = 40 * guideline_match.severity_weight if guideline_match.matched else 0
    drift_penalty = 25 * semantic_drift_score
    time_penalty = 20 * min(years_since / 10, 1)

    score = 100 - guideline_penalty - drift_penalty - time_penalty
    score = max(0, min(100, round(score)))

    if score > 70:
        color = "green"
    elif score >= 40:
        color = "yellow"
    else:
        color = "red"

    return {
        "freshness_score": score,
        "score_color": color,
        "breakdown": {
            "starting_score": 100,
            "guideline_penalty": round(guideline_penalty, 1),
            "drift_penalty": round(drift_penalty, 1),
            "time_penalty": round(time_penalty, 1),
            "years_since_diagnosis": years_since,
        },
    }


# ─────────────────────────────────────────────────────────────────
# STEP 6 — HUMAN-FACING EXPLANATION (Azure OpenAI, constrained)
# ─────────────────────────────────────────────────────────────────

DISCLAIMER = ("This is not a diagnosis. Please consult a licensed mental "
              "health professional to discuss these findings.")


def generate_explanation(
    extracted: ExtractedData,
    guideline_match: GuidelineMatch,
    semantic_drift_score: float,
    freshness_score: int,
) -> str:
    if not AZURE_CONFIGURED or client is None:
        raise RuntimeError("Azure OpenAI is not configured — cannot generate explanation.")

    system_prompt = f"""You are explaining a diagnostic freshness score to a
patient in plain, warm, non-alarming language. You must ONLY reference the
facts provided to you below. NEVER suggest what the correct diagnosis might
be. NEVER provide medical advice beyond recommending professional
consultation. Keep it to 3-4 sentences. Always end your response with
exactly this sentence: "{DISCLAIMER}"

Facts:
- Original diagnosis: {extracted.diagnosis}
- Diagnosis date: {extracted.diagnosis_date}
- Framework used: {extracted.framework}
- Freshness score: {freshness_score}/100
- Guideline change detected: {guideline_match.matched}
- Guideline change summary: {guideline_match.change_summary if guideline_match.matched else "None"}
- Semantic symptom drift score: {semantic_drift_score}
"""

    response = client.chat.completions.create(
        model=AZURE_OPENAI_DEPLOYMENT,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Please generate the explanation now."},
        ],
        temperature=0.3,
    )

    return response.choices[0].message.content.strip()


# ─────────────────────────────────────────────────────────────────
# MAIN ENDPOINT
# ─────────────────────────────────────────────────────────────────

@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    text = request.patient_notes.strip()
    warnings = []

    if not text:
        raise HTTPException(status_code=400, detail="patient_notes cannot be empty.")

    # ── STEP 1: EMERGENCY BRAKE — always runs first, no exceptions ──
    crisis_result = check_crisis(text)
    if crisis_result["crisis_flag"]:
        return AnalyzeResponse(
            crisis_triggered=True,
            crisis_message=CRISIS_MESSAGE,
        )

    # ── STEPS 2-6: only run if no crisis detected ──
    extracted = None
    guideline_match = GuidelineMatch(matched=False)
    semantic_drift_score = 0.0
    freshness_score = None
    score_color = None
    explanation = None
    breakdown = None

    try:
        extracted = extract_clinical_data(text)
    except Exception as e:
        warnings.append(f"Extraction step failed: {str(e)}")
        return AnalyzeResponse(
            crisis_triggered=False,
            extracted=None,
            warnings=warnings,
        )

    try:
        guideline_match = match_guideline(extracted.diagnosis)
    except Exception as e:
        warnings.append(f"Guideline matching failed: {str(e)}")

    try:
        semantic_drift_score = compute_semantic_drift(extracted.symptoms, guideline_match)
    except Exception as e:
        warnings.append(f"Semantic drift check failed: {str(e)}")

    try:
        score_result = calculate_freshness_score(
            guideline_match, semantic_drift_score, extracted.diagnosis_year
        )
        freshness_score = score_result["freshness_score"]
        score_color = score_result["score_color"]
        breakdown = score_result["breakdown"]
    except Exception as e:
        warnings.append(f"Scoring step failed: {str(e)}")

    try:
        if freshness_score is not None:
            explanation = generate_explanation(
                extracted, guideline_match, semantic_drift_score, freshness_score
            )
    except Exception as e:
        warnings.append(f"Explanation generation failed: {str(e)}")
        explanation = (
            f"Freshness score calculated: {freshness_score}/100. "
            f"(AI explanation unavailable — {DISCLAIMER})"
        )

    return AnalyzeResponse(
        crisis_triggered=False,
        extracted=extracted,
        guideline_match=guideline_match,
        semantic_drift_score=semantic_drift_score,
        freshness_score=freshness_score,
        score_color=score_color,
        explanation=explanation,
        score_breakdown=breakdown,
        warnings=warnings,
    )


# ─────────────────────────────────────────────────────────────────
# UTILITY ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "azure_configured": AZURE_CONFIGURED,
        "registry_rows_loaded": len(registry_df),
    }


@app.get("/api/registry")
def get_registry():
    return json.loads(registry_df.to_json(orient="records"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)