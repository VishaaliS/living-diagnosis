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
import uuid
import difflib
import hashlib
import shutil
from datetime import datetime
from typing import Optional, List
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
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
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"

client: Optional[AzureOpenAI] = None
AZURE_CONFIGURED = bool(AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY)

# ── Startup diagnostics (never prints the actual key) ──
print("="*60)
print("[STARTUP] Living Diagnosis Backend")
print(f"[STARTUP] DEMO_MODE          : {DEMO_MODE}")
print(f"[STARTUP] AZURE_CONFIGURED   : {AZURE_CONFIGURED}")
print(f"[STARTUP] API_KEY loaded     : {'YES' if AZURE_OPENAI_API_KEY else 'NO'}")
print(f"[STARTUP] ENDPOINT loaded    : {'YES — ' + str(AZURE_OPENAI_ENDPOINT) if AZURE_OPENAI_ENDPOINT else 'NO'}")
print(f"[STARTUP] DEPLOYMENT         : {AZURE_OPENAI_DEPLOYMENT}")
print(f"[STARTUP] API_VERSION        : {AZURE_OPENAI_API_VERSION}")
print("="*60)

if AZURE_CONFIGURED:
    client = AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_API_VERSION,
    )
    print("[STARTUP] AzureOpenAI client initialised successfully.")
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────
# LOCAL JSON DATA LAYER — helpers
# ─────────────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).parent / "data"
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

USERS_FILE    = DATA_DIR / "users.json"
PATIENTS_FILE = DATA_DIR / "patients.json"
CHECKINS_FILE = DATA_DIR / "checkins.json"
HISTORY_FILE  = DATA_DIR / "history.json"


def _read(path: Path) -> list:
    """Read a JSON array file. Returns [] if missing or corrupt."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def _write(path: Path, data: list) -> None:
    """Atomically write a JSON array file."""
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _hash_password(password: str) -> str:
    """Simple SHA-256 hash — good enough for hackathon local storage."""
    return hashlib.sha256(password.encode()).hexdigest()


def _get_user_from_token(authorization: Optional[str]) -> dict:
    """
    Validate 'Authorization: Bearer <user_id>' header.
    Returns the matching user dict or raises HTTP 401.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
    user_id = authorization.split(" ", 1)[1].strip()
    users = _read(USERS_FILE)
    user = next((u for u in users if u["id"] == user_id), None)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token / user not found.")
    return user

# ─────────────────────────────────────────────────────────────────
# DATA LAYER — Guideline Change Registry
# ─────────────────────────────────────────────────────────────────

CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "guideline_changes.csv")

try:
    registry_df = pd.read_csv(CSV_PATH)
    registry_df["keywords_for_matching"] = registry_df["keywords_for_matching"].fillna("")
    print(f"Loaded {len(registry_df)} rows from guideline_changes.csv")
except FileNotFoundError:
    registry_df = pd.DataFrame()
    print(f"WARNING: {CSV_PATH} not found. Guideline matching will return no matches.")


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


class ChatMessageRequest(BaseModel):
    """Request model for POST /chat/message."""
    message: str
    context: Optional[dict] = None
    history: Optional[List[dict]] = None  # list of {role: str, content: str}


class ChatMessageResponse(BaseModel):
    """Response model for POST /chat/message."""
    response: str
    crisis_triggered: bool = False


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

def _strip_json_fences(raw: str) -> str:
    """Strip markdown code fences (```json ... ```) that GPT sometimes wraps around JSON."""
    raw = raw.strip()
    # Remove ```json ... ``` or ``` ... ``` wrappers
    fence_pattern = re.compile(r'^```(?:json)?\s*\n?(.*?)\n?```\s*$', re.DOTALL)
    match = fence_pattern.match(raw)
    if match:
        return match.group(1).strip()
    return raw


def extract_clinical_data(text: str) -> ExtractedData:
    if not AZURE_CONFIGURED or client is None:
        raise RuntimeError("Azure OpenAI is not configured — cannot run extraction. "
                           "Check that AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are set in .env.")

    system_prompt = """You are a clinical information extraction assistant.
Extract ONLY the following fields from the patient notes provided, and
respond with STRICT JSON only, no commentary, no markdown fences, matching this exact schema:

{
  "diagnosis": string or null,
  "diagnosis_date": string or null (e.g. "2011-06" or "2011"),
  "diagnosis_year": integer or null,
  "framework": string or null (e.g. "DSM-IV-TR", "DSM-5", "ICD-10", "ICD-11", "unstated"),
  "symptoms": array of strings (reported symptoms mentioned in the notes),
  "medications": array of strings,
  "confidence": float between 0 and 1 representing your confidence in this extraction
}

Do not diagnose. Do not infer information not present in the text.
If a field is not mentioned, use null or an empty array.
Return ONLY the JSON object — no explanation text before or after."""

    print(f"[EXTRACT] Sending extraction request to model: {AZURE_OPENAI_DEPLOYMENT}")

    try:
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0,
        )
        print(f"[EXTRACT] API request succeeded. Finish reason: {response.choices[0].finish_reason}")
    except Exception as api_err:
        print(f"[EXTRACT] ❌ Azure OpenAI API call FAILED: {type(api_err).__name__}: {api_err}")
        raise RuntimeError(f"Azure OpenAI API call failed: {type(api_err).__name__}: {api_err}") from api_err

    raw = response.choices[0].message.content
    print(f"[EXTRACT] Raw GPT response (first 500 chars): {repr(raw[:500]) if raw else 'EMPTY'}")

    if not raw or not raw.strip():
        raise RuntimeError("GPT returned an empty response during extraction.")

    try:
        cleaned = _strip_json_fences(raw)
        data = json.loads(cleaned)
        print(f"[EXTRACT] Parsed JSON keys: {list(data.keys())}")
        print(f"[EXTRACT] diagnosis={data.get('diagnosis')!r}, "
              f"framework={data.get('framework')!r}, "
              f"diagnosis_date={data.get('diagnosis_date')!r}, "
              f"symptoms={data.get('symptoms')!r}")
    except json.JSONDecodeError as json_err:
        print(f"[EXTRACT] ❌ JSON parse failed: {json_err}")
        print(f"[EXTRACT] Raw content that failed to parse: {repr(raw)}")
        raise RuntimeError(f"Failed to parse GPT JSON response: {json_err}. Raw: {raw[:200]}") from json_err

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

    print(f"[EXPLAIN] Sending explanation request to model: {AZURE_OPENAI_DEPLOYMENT}")
    try:
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Please generate the explanation now."},
            ],
            temperature=0.3,
        )
        print(f"[EXPLAIN] API request succeeded.")
    except Exception as api_err:
        print(f"[EXPLAIN] ❌ Azure OpenAI API call FAILED: {type(api_err).__name__}: {api_err}")
        raise RuntimeError(f"Explanation API call failed: {type(api_err).__name__}: {api_err}") from api_err

    content = response.choices[0].message.content
    print(f"[EXPLAIN] Raw explanation (first 200 chars): {repr(content[:200]) if content else 'EMPTY'}")
    return content.strip() if content else ""


# ─────────────────────────────────────────────────────────────────
# MAIN ENDPOINT
# ─────────────────────────────────────────────────────────────────

@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    text = request.patient_notes.strip()
    warnings = []

    if not text:
        raise HTTPException(status_code=400, detail="patient_notes cannot be empty.")

    # ── DEMO MODE FAILSAFE ──
    # Prevents dependency on Azure OpenAI during live demos.
    # Returns hardcoded responses for specific trigger words.
    if DEMO_MODE:
        text_lower = text.lower()
        if "crisis" in text_lower or "suicide" in text_lower or "self-harm" in text_lower:
            return AnalyzeResponse(
                crisis_triggered=True,
                crisis_message=CRISIS_MESSAGE,
                extracted=None,
                guideline_match=None,
                semantic_drift_score=None,
                freshness_score=None,
                score_color=None,
                explanation=None,
                score_breakdown=None,
                warnings=[],
            )
        elif "asperger" in text_lower or "2011" in text_lower:
            return AnalyzeResponse(
                crisis_triggered=False,
                crisis_message=None,
                extracted=ExtractedData(
                    diagnosis="Asperger's Syndrome",
                    diagnosis_date="2011",
                    diagnosis_year=2011,
                    framework="DSM-IV",
                    symptoms=["social difficulties"],
                    medications=[],
                    confidence=0.99
                ),
                guideline_match=GuidelineMatch(
                    matched=True,
                    entry_id="DSM5-001",
                    old_label="Asperger's syndrome",
                    new_label="Autism spectrum disorder",
                    change_type="Consolidated",
                    change_summary="Consolidated into Autism Spectrum Disorder.",
                    severity_weight=0.8,
                    source_citation="DSM-5"
                ),
                semantic_drift_score=0.15,
                freshness_score=43,
                score_color="yellow",
                explanation="The diagnosis of Asperger's syndrome has been consolidated into Autism spectrum disorder in the DSM-5. Your freshness score is 43/100. " + DISCLAIMER,
                score_breakdown={"starting_score": 100, "guideline_penalty": 32.0, "drift_penalty": 3.8, "time_penalty": 20.0, "years_since_diagnosis": 13},
                warnings=[],
            )
        elif "hypochondriasis" in text_lower or "illness anxiety" in text_lower:
            return AnalyzeResponse(
                crisis_triggered=False,
                crisis_message=None,
                extracted=ExtractedData(
                    diagnosis="Hypochondriasis",
                    diagnosis_date="2010",
                    diagnosis_year=2010,
                    framework="DSM-IV",
                    symptoms=["fear of disease"],
                    medications=[],
                    confidence=0.99
                ),
                guideline_match=GuidelineMatch(
                    matched=True,
                    entry_id="DSM5-002",
                    old_label="Hypochondriasis",
                    new_label="Illness anxiety disorder",
                    change_type="Renamed",
                    change_summary="Renamed to Illness anxiety disorder.",
                    severity_weight=0.6,
                    source_citation="DSM-5"
                ),
                semantic_drift_score=0.3,
                freshness_score=38,
                score_color="red",
                explanation="The term Hypochondriasis has been updated to Illness anxiety disorder. Your freshness score is 38/100. " + DISCLAIMER,
                score_breakdown={"starting_score": 100, "guideline_penalty": 24.0, "drift_penalty": 7.5, "time_penalty": 20.0, "years_since_diagnosis": 14},
                warnings=[],
            )
        elif "add" in text_lower or "attention deficit" in text_lower:
            return AnalyzeResponse(
                crisis_triggered=False,
                crisis_message=None,
                extracted=ExtractedData(
                    diagnosis="ADD",
                    diagnosis_date="2015",
                    diagnosis_year=2015,
                    framework="DSM-IV",
                    symptoms=["inattention"],
                    medications=["Adderall"],
                    confidence=0.99
                ),
                guideline_match=GuidelineMatch(
                    matched=True,
                    entry_id="DSM5-003",
                    old_label="ADD",
                    new_label="ADHD",
                    change_type="Renamed",
                    change_summary="Term ADD is now ADHD.",
                    severity_weight=0.4,
                    source_citation="DSM-5"
                ),
                semantic_drift_score=0.1,
                freshness_score=72,
                score_color="green",
                explanation="Your diagnosis of ADD is now classified under ADHD. Your freshness score is 72/100. " + DISCLAIMER,
                score_breakdown={"starting_score": 100, "guideline_penalty": 16.0, "drift_penalty": 2.5, "time_penalty": 9.5, "years_since_diagnosis": 9},
                warnings=[],
            )

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
        print(f"[ANALYZE] Extraction succeeded: diagnosis={extracted.diagnosis!r}")
    except Exception as e:
        err_msg = str(e)
        print(f"[ANALYZE] ❌ Extraction failed: {err_msg}")
        warnings.append(f"Extraction step failed: {err_msg}")
        # Surface the actual error to the frontend so it's visible, not silent
        raise HTTPException(
            status_code=502,
            detail=f"AI extraction failed: {err_msg}"
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

@app.post("/api/analyze-file", response_model=AnalyzeResponse)
async def analyze_file(file: UploadFile = File(...)):
    """
    Accepts an ad-hoc file upload, extracts its text, and runs the same
    analysis as /api/analyze without requiring auth or saving to disk.
    """
    contents = await file.read()
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    
    raw_text = ""
    # Extract text based on file type
    if ext == ".txt":
        raw_text = contents.decode("utf-8", errors="replace")
    elif ext == ".pdf":
        try:
            import PyPDF2
            import io
            reader = PyPDF2.PdfReader(io.BytesIO(contents))
            pages = [page.extract_text() or "" for page in reader.pages]
            raw_text = "\n".join(pages)
        except ImportError:
            raise HTTPException(status_code=500, detail="PyPDF2 is not installed.")
    elif ext in [".jpeg", ".jpg", ".png", ".webp"]:
        import base64
        base64_image = base64.b64encode(contents).decode('utf-8')
        media_type = f"image/{ext[1:]}" if ext != ".jpg" else "image/jpeg"
        
        if not AZURE_CONFIGURED or client is None:
            raise HTTPException(status_code=503, detail="Azure OpenAI is not configured for image OCR.")
            
        try:
            response = client.chat.completions.create(
                model=AZURE_OPENAI_DEPLOYMENT,
                messages=[
                    {"role": "system", "content": "You are a clinical OCR assistant. Accurately transcribe all text, clinical notes, and handwriting from the image. Output ONLY the transcribed text."},
                    {"role": "user", "content": [{"type": "text", "text": "Extract text:"}, {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{base64_image}"}}]}
                ],
                max_completion_tokens=2000,
            )
            raw_text = response.choices[0].message.content or ""
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to OCR image: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract any content from the document.")

    # Pass the extracted text into the standard analyze function
    return analyze(AnalyzeRequest(patient_notes=raw_text))


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


# ═════════════════════════════════════════════════════════════════
# A. AUTH ENDPOINTS
# ═════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/register", status_code=201)
def auth_register(body: RegisterRequest):
    """Create a new user. Returns {id, email}."""
    users = _read(USERS_FILE)
    if any(u["email"].lower() == body.email.lower() for u in users):
        raise HTTPException(status_code=409, detail="Email already registered.")
    new_user = {
        "id": f"user_{uuid.uuid4().hex[:8]}",
        "email": body.email,
        "password_hash": _hash_password(body.password),
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    users.append(new_user)
    _write(USERS_FILE, users)
    return {"id": new_user["id"], "email": new_user["email"]}


@app.post("/auth/login")
def auth_login(body: LoginRequest):
    """Authenticate. Returns {token, user_id} where token == user_id for simplicity."""
    users = _read(USERS_FILE)
    user = next(
        (u for u in users
         if u["email"].lower() == body.email.lower()
         and u["password_hash"] == _hash_password(body.password)),
        None,
    )
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"token": user["id"], "user_id": user["id"], "email": user["email"]}


# ═════════════════════════════════════════════════════════════════
# B. PATIENT PROFILE ENDPOINTS
# ═════════════════════════════════════════════════════════════════

class PatientCreate(BaseModel):
    name: str
    dob: Optional[str] = None
    primary_diagnosis: Optional[str] = None
    diagnosis_year: Optional[int] = None
    medications: List[str] = []


class MedicationsUpdate(BaseModel):
    medications: List[str]


@app.post("/patients", status_code=201)
def create_patient(
    body: PatientCreate,
    authorization: Optional[str] = Header(None),
):
    """Create a patient record linked to the authenticated user."""
    user = _get_user_from_token(authorization)
    patients = _read(PATIENTS_FILE)
    new_patient = {
        "id": f"pat_{uuid.uuid4().hex[:8]}",
        "user_id": user["id"],
        "name": body.name,
        "dob": body.dob,
        "primary_diagnosis": body.primary_diagnosis,
        "diagnosis_year": body.diagnosis_year,
        "medications": body.medications,
        "documents": [],
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    patients.append(new_patient)
    _write(PATIENTS_FILE, patients)
    return new_patient


@app.get("/patients")
def get_user_patients(authorization: Optional[str] = Header(None)):
    """Return all patients associated with the authenticated user."""
    user = _get_user_from_token(authorization)
    patients = _read(PATIENTS_FILE)
    user_patients = [p for p in patients if p["user_id"] == user["id"]]
    return user_patients


@app.get("/patients/{patient_id}")
def get_patient(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """Return a patient record. Requires auth."""
    _get_user_from_token(authorization)  # ensure caller is authenticated
    patients = _read(PATIENTS_FILE)
    patient = next((p for p in patients if p["id"] == patient_id), None)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    return patient


@app.put("/patients/{patient_id}/medications")
def update_medications(
    patient_id: str,
    body: MedicationsUpdate,
    authorization: Optional[str] = Header(None),
):
    """Replace the medications list for a patient."""
    user = _get_user_from_token(authorization)
    patients = _read(PATIENTS_FILE)
    idx = next((i for i, p in enumerate(patients) if p["id"] == patient_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    if patients[idx]["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    patients[idx]["medications"] = body.medications
    _write(PATIENTS_FILE, patients)
    return patients[idx]


# ═════════════════════════════════════════════════════════════════
# C. DAILY CHECK-IN ENDPOINTS
# ═════════════════════════════════════════════════════════════════

class CheckInCreate(BaseModel):
    date: str                      # "YYYY-MM-DD"
    mood_score: int                # 1–10
    symptom_notes: Optional[str] = ""


@app.post("/checkins", status_code=201)
def create_checkin(
    body: CheckInCreate,
    authorization: Optional[str] = Header(None),
):
    """Save a daily mood/symptom check-in linked to the authenticated user."""
    user = _get_user_from_token(authorization)
    if not (1 <= body.mood_score <= 10):
        raise HTTPException(status_code=422, detail="mood_score must be between 1 and 10.")
    checkins = _read(CHECKINS_FILE)
    new_checkin = {
        "id": f"chk_{uuid.uuid4().hex[:8]}",
        "user_id": user["id"],
        "date": body.date,
        "mood_score": body.mood_score,
        "symptom_notes": body.symptom_notes,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    checkins.append(new_checkin)
    _write(CHECKINS_FILE, checkins)
    return new_checkin


@app.get("/checkins")
def get_checkins(user_id: str):
    """Return all check-ins for a given user_id (for trend analysis)."""
    checkins = _read(CHECKINS_FILE)
    user_checkins = [c for c in checkins if c["user_id"] == user_id]
    # Sort by date ascending
    user_checkins.sort(key=lambda c: c["date"])
    return user_checkins


@app.get("/checkins/summary")
def get_checkins_summary(user_id: str):
    """Return mood trend array, average mood, and days logged for a user."""
    checkins = _read(CHECKINS_FILE)
    user_checkins = sorted(
        [c for c in checkins if c["user_id"] == user_id],
        key=lambda c: c["date"],
    )
    if not user_checkins:
        return {"mood_trend": [], "average_mood": None, "days_logged": 0}
    scores = [c["mood_score"] for c in user_checkins]
    return {
        "mood_trend": scores,
        "average_mood": round(sum(scores) / len(scores), 2),
        "days_logged": len(scores),
        "dates": [c["date"] for c in user_checkins],
    }


# ═════════════════════════════════════════════════════════════════
# D. PRESCRIPTION / FILE UPLOAD ENDPOINTS
# ═════════════════════════════════════════════════════════════════

@app.post("/upload/prescription", status_code=201)
async def upload_prescription(
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    authorization: Optional[str] = Header(None),
):
    """
    Accept a multipart file upload, save to backend/uploads/,
    and record the reference in the patient's documents array.
    """
    user = _get_user_from_token(authorization)

    # Validate extension
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    allowed_exts = {".pdf", ".png", ".jpg", ".jpeg", ".txt"}
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, PNG, JPG, JPEG, TXT are allowed.")

    # Validate size (10MB)
    MAX_SIZE = 10 * 1024 * 1024
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    # Build a safe unique filename
    safe_name = f"{patient_id}_{uuid.uuid4().hex[:8]}{ext}"
    dest = UPLOADS_DIR / safe_name

    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    doc_ref = {
        "filename": file.filename,
        "saved_as": safe_name,
        "path": str(dest),
        "uploaded_at": datetime.utcnow().isoformat() + "Z",
        "uploaded_by": user["id"],
    }

    # Attach to patient record
    patients = _read(PATIENTS_FILE)
    idx = next((i for i, p in enumerate(patients) if p["id"] == patient_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    if patients[idx]["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    patients[idx].setdefault("documents", []).append(doc_ref)
    _write(PATIENTS_FILE, patients)

    return {"message": "File uploaded successfully.", "document": doc_ref}


@app.get("/patients/{patient_id}/documents")
def get_patient_documents(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """List all uploaded documents for a patient."""
    _get_user_from_token(authorization)
    patients = _read(PATIENTS_FILE)
    patient = next((p for p in patients if p["id"] == patient_id), None)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    return patient.get("documents", [])


# ═════════════════════════════════════════════════════════════════
# D2. DOCUMENT ANALYSIS ENDPOINT
# ═════════════════════════════════════════════════════════════════

class AnalyzeDocumentRequest(BaseModel):
    filename: str  # The `saved_as` value from the upload response


@app.post("/api/analyze-document")
async def analyze_document(
    body: AnalyzeDocumentRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Read an already-uploaded file from backend/uploads/, extract text
    (TXT: read directly, PDF: use PyPDF2), then call Azure OpenAI to
    extract medications, prescribing doctor, date, and diagnoses.
    Returns structured JSON.
    """
    _get_user_from_token(authorization)

    file_path = UPLOADS_DIR / body.filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found in uploads directory.")

    ext = file_path.suffix.lower()
    raw_text = ""
    base64_image = None
    media_type = None

    # ── Extract text or encode image ────────────────────────────────
    try:
        if ext == ".txt":
            raw_text = file_path.read_text(encoding="utf-8", errors="replace")
        elif ext == ".pdf":
            try:
                import PyPDF2
            except ImportError:
                raise HTTPException(
                    status_code=500,
                    detail="PyPDF2 is not installed. Run: pip install PyPDF2"
                )
            reader = PyPDF2.PdfReader(str(file_path))
            pages = [page.extract_text() or "" for page in reader.pages]
            raw_text = "\n".join(pages)
        elif ext in [".jpeg", ".jpg", ".png", ".webp"]:
            import base64
            with open(file_path, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            media_type = f"image/{ext[1:]}" if ext != ".jpg" else "image/jpeg"
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {ext}. Only PDF, TXT, and Images (JPEG, PNG, WEBP) are supported for analysis."
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read document: {exc}"
        )

    if not raw_text.strip() and not base64_image:
        raise HTTPException(
            status_code=422,
            detail="Could not extract any content from the document. The file may be empty."
        )

    # ── Call Azure OpenAI ───────────────────────────────────────────
    if not AZURE_CONFIGURED or client is None:
        raise HTTPException(
            status_code=503,
            detail="Could not analyze document. Azure OpenAI is not configured."
        )

    SYSTEM_PROMPT = (
        "You are a clinical data extraction assistant. "
        "Extract medications (name, dosage, frequency), prescribing doctor name, "
        "prescription date, and any diagnoses mentioned from the clinical document provided. "
        "Return ONLY a valid JSON object with the following fields: "
        "  medications (array of objects with fields: name, dosage, frequency), "
        "  prescribing_doctor (string or null), "
        "  date (string or null), "
        "  diagnoses_mentioned (array of strings). "
        "Do not include any explanation or markdown—output raw JSON only."
    )

    try:
        if base64_image:
            user_content = [
                {"type": "text", "text": "Clinical document:"},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media_type};base64,{base64_image}"
                    }
                }
            ]
        else:
            user_content = f"Clinical document:\n\n{raw_text[:6000]}"

        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
            max_completion_tokens=800,
        )
        raw_json = response.choices[0].message.content or "{}"
        extraction = json.loads(raw_json)
    except json.JSONDecodeError:
        extraction = {}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not analyze document. Please try again. (Error: {str(exc)})"
        )

    # ── Normalise output ────────────────────────────────────────────
    medications = extraction.get("medications", [])
    # Ensure each entry is a dict; if the model returned strings, wrap them
    medications = [
        m if isinstance(m, dict) else {"name": str(m), "dosage": None, "frequency": None}
        for m in medications
    ]

    return {
        "medications": medications,
        "prescribing_doctor": extraction.get("prescribing_doctor"),
        "date": extraction.get("date"),
        "diagnoses_mentioned": extraction.get("diagnoses_mentioned", []),
        "raw_text_preview": raw_text[:300],
    }


# ═════════════════════════════════════════════════════════════════
# F. CHAT / AI ASSISTANT ENDPOINT
# ═════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────
# STATIC PRODUCT KNOWLEDGE — injected into every chat prompt so the
# assistant can answer questions about the website, pages, workflow,
# and why specific information is collected.
# ─────────────────────────────────────────────────────────────────

APP_KNOWLEDGE = {
    "product_name": "Living Diagnosis",
    "one_line": "Living Diagnosis helps patients understand whether an existing mental health diagnosis may be outdated based on DSM/ICD guideline changes and symptom changes over time.",
    "core_purpose": "The app does not diagnose. It reviews an existing diagnosis and tells the user whether professional re-evaluation may be warranted.",
    "not_a_diagnostic_tool": True,
    "pages": {
        "analysis": {
            "name": "Analysis Dashboard",
            "purpose": "The main analysis page lets users paste clinical notes or analyze diagnosis information. It produces a Freshness Score, extracted clinical data, guideline match, explanation, and review recommendation.",
            "features": [
                "Patient notes input", "Analyze Notes button", "Emergency Brake crisis detection",
                "Extractor Agent", "Guideline Match", "Semantic Drift", "Freshness Score",
                "Diagnosis Timeline", "Doctor Questions", "Chat assistant"
            ]
        },
        "profile": {
            "name": "Patient Profile",
            "purpose": "The profile page stores patient-owned details and longitudinal health information.",
            "features": [
                "Patient name and basic details", "Primary diagnosis", "Diagnosis year",
                "Medications", "Daily mood check-ins", "Symptom notes",
                "Diagnosis freshness history", "Uploaded documents"
            ]
        },
        "documents": {
            "name": "Documents Section",
            "purpose": "The documents section lets patients upload prescriptions and clinical files so they can keep a portable record.",
            "features": ["Prescription upload", "Clinical document upload", "Stored document list", "File persistence"]
        }
    },
    "why_we_ask": {
        "diagnosis_label": "The diagnosis label is needed so the system can check whether that specific diagnosis has changed, merged, been renamed, or become obsolete in DSM or ICD updates.",
        "diagnosis_year": "The diagnosis year helps determine whether the diagnosis was made before or after major guideline revisions, such as DSM-5 in 2013 or ICD-11 in 2022.",
        "symptoms": "Symptoms help compare the patient's current experience with current diagnostic criteria and detect possible symptom drift over time.",
        "daily_mood": "Daily mood check-ins build a timeline of how the patient feels over time. This helps show whether symptoms are stable, improving, or changing.",
        "symptom_notes": "Symptom notes capture details that may not appear in old medical records and help build a longitudinal patient-owned record.",
        "prescriptions": "Prescription uploads help store medication context in the patient profile. The app does not recommend medication changes.",
        "documents": "Documents help patients keep prescriptions and clinical notes in one portable record that can be discussed with a clinician."
    },
    "pipeline": [
        "Emergency Brake scans for crisis/self-harm language using deterministic pattern matching before AI runs.",
        "Extractor Agent pulls structured clinical facts from unstructured notes.",
        "Researcher Agent checks diagnosis labels against a curated DSM/ICD guideline change registry.",
        "Semantic Drift compares recent symptoms against current criteria.",
        "Freshness Score summarizes how current or stale the existing diagnosis may be.",
        "Communicator Agent explains the result in plain language."
    ],
    "freshness_score": {
        "meaning": "A 0-100 score estimating whether the existing diagnosis appears current or may deserve professional review.",
        "green": "70-100 means the diagnosis appears relatively current based on available information.",
        "yellow": "40-69 means professional review may be useful.",
        "red": "Below 40 means the diagnosis may be stale or strongly affected by guideline changes or symptom drift."
    },
    "safety_rules": [
        "Living Diagnosis does not diagnose.",
        "Living Diagnosis does not suggest replacement diagnoses.",
        "Living Diagnosis does not provide treatment advice.",
        "Living Diagnosis does not recommend medication changes.",
        "Crisis language is handled by deterministic safety logic before AI is called."
    ],
    "standard_disclaimer": "This is not a diagnosis. Please consult a licensed mental health professional."
}

# Site-aware system prompt — knows the product, enforces strict safety constraints.
_CHAT_SYSTEM_PROMPT = (
    "You are the Living Diagnosis site-aware assistant. You understand the Living Diagnosis "
    "website, its pages, features, and workflow from APP_KNOWLEDGE provided in this prompt. "
    "Use this knowledge to answer questions about what the website does, why it asks for "
    "specific information, how to use each feature, and what the user's analysis result means.\n\n"
    "You are NOT a doctor. You do NOT diagnose. You NEVER suggest a new diagnosis. You NEVER "
    "give treatment advice. You NEVER recommend medication changes. If the user asks for "
    "medical decisions, refuse safely and recommend a licensed professional.\n\n"
    "Do not invent features, pages, or claims that are not in APP_KNOWLEDGE or the provided context.\n\n"
    "Keep responses under 150 words. Every response MUST end with exactly this sentence: "
    "'This is not a diagnosis. Please consult a licensed mental health professional.'"
)


def _pick_demo_response(message: str, analysis_context: Optional[dict] = None) -> str:
    """
    Site-aware canned response for DEMO_MODE.
    Answers product/workflow/feature questions using APP_KNOWLEDGE without calling Azure.
    """
    msg = message.lower()
    disclaimer = APP_KNOWLEDGE["standard_disclaimer"]

    # Medication safety — hard refusal first
    if any(kw in msg for kw in ["stop medication", "stop my medication", "stop taking",
                                  "change medication", "can i stop", "medication advice",
                                  "adjust medication", "quit medication"]):
        return (
            "Medication decisions must only be made with your prescribing clinician. "
            "Living Diagnosis does not recommend medication changes and cannot advise "
            "on whether to adjust, stop, or start any medication. Please contact your "
            "doctor or pharmacist directly. "
            f"{disclaimer}"
        )

    # What does this website / app do?
    if any(kw in msg for kw in ["what does this website do", "what does this app do",
                                  "what is this", "what is living diagnosis", "what do you do",
                                  "how does this work", "what is the purpose",
                                  "how do i use", "how to use", "getting started"]):
        return (
            f"{APP_KNOWLEDGE['one_line']} "
            "Paste your clinical notes on the Analysis Dashboard and click 'Analyze Notes'. "
            "The system extracts your diagnosis, checks it against current DSM/ICD guidelines, "
            "and produces a Freshness Score indicating whether professional re-evaluation may be useful. "
            f"{disclaimer}"
        )

    # Daily check-ins / mood / symptom notes
    if any(kw in msg for kw in ["daily check", "check-in", "check in", "mood", "symptom note"]):
        return (
            f"{APP_KNOWLEDGE['why_we_ask']['daily_mood']} "
            "Tracking symptoms over time builds a patient-owned longitudinal record you can "
            "share with your clinician to show how your experience has changed since your original diagnosis. "
            f"{disclaimer}"
        )

    # Prescriptions / documents / upload
    if any(kw in msg for kw in ["prescription", "upload", "document", "file"]):
        return (
            f"{APP_KNOWLEDGE['why_we_ask']['prescriptions']} "
            f"{APP_KNOWLEDGE['why_we_ask']['documents']} "
            f"{disclaimer}"
        )

    # Diagnosis year
    if any(kw in msg for kw in ["diagnosis year", "year", "when diagnosed", "date of diagnosis"]):
        return (
            f"{APP_KNOWLEDGE['why_we_ask']['diagnosis_year']} "
            "For example, a diagnosis made under DSM-IV before 2013 may carry a different label today under DSM-5. "
            f"{disclaimer}"
        )

    # Freshness Score
    if any(kw in msg for kw in ["freshness", "score", "what does", "mean"]):
        fs = APP_KNOWLEDGE["freshness_score"]
        return (
            f"{fs['meaning']} {fs['green']} {fs['yellow']} {fs['red']} "
            f"{disclaimer}"
        )

    # What should I do next — use analysis context if available
    if any(kw in msg for kw in ["next", "what should i", "now what", "recommend", "what do i do"]):
        if analysis_context and analysis_context.get("freshness_score") is not None:
            score = analysis_context["freshness_score"]
            color = analysis_context.get("score_color", "")
            diag = (analysis_context.get("extracted") or {}).get("diagnosis", "your diagnosis")
            urgency = {"red": "strongly recommended", "yellow": "recommended", "green": "still worth discussing"}.get(color, "recommended")
            return (
                f"Based on your analysis, {diag} has a Freshness Score of {score}/100 ({color}). "
                f"A professional review is {urgency}. Share your results with your clinician "
                "and ask whether current guidelines affect your diagnosis or care plan. "
                f"{disclaimer}"
            )
        return (
            "Run an analysis first — paste your clinical notes on the Analysis Dashboard and "
            "click 'Analyze Notes'. Then I can give specific guidance based on your Freshness Score. "
            f"{disclaimer}"
        )

    # Generic fallback
    return (
        "I can help explain what Living Diagnosis does, why we ask for specific information, "
        "how to use the app, and what your analysis results mean. "
        "Ask me anything about the website or your results. "
        f"{disclaimer}"
    )


def _build_context_block(frontend_context: Optional[dict]) -> str:
    """
    Format the full frontend context (analysis + page + user_state + visible_features)
    into a human-readable block to inject into the LLM system prompt.
    Handles both the new nested structure {analysis, page, user_state, visible_features}
    and the legacy flat analysis object for backwards compatibility.
    """
    if not frontend_context:
        return "No frontend context provided. The user has not run an analysis yet."

    lines = []

    # ── Current page ──
    page = frontend_context.get("page")
    if page:
        page_info = APP_KNOWLEDGE["pages"].get(page, {})
        lines.append(f"- Current page: {page_info.get('name', page)}")
        if page_info.get("purpose"):
            lines.append(f"  Page purpose: {page_info['purpose']}")

    # ── Visible features on current page ──
    visible = frontend_context.get("visible_features")
    if visible:
        lines.append(f"- Visible features: {', '.join(visible)}")

    # ── User state (compact summary from frontend) ──
    user_state = frontend_context.get("user_state") or {}
    if user_state.get("has_analysis_result"):
        lines.append("- User has run an analysis: Yes")
        if user_state.get("diagnosis"):
            lines.append(f"  - Diagnosis: {user_state['diagnosis']}")
        if user_state.get("diagnosis_year"):
            lines.append(f"  - Diagnosis year: {user_state['diagnosis_year']}")
        if user_state.get("score") is not None:
            lines.append(f"  - Freshness score: {user_state['score']}/100")
        if user_state.get("has_guideline_match"):
            gm = user_state.get("guideline_match") or {}
            lines.append(
                f"  - Guideline change detected: Yes "
                f"({gm.get('change_type', '')}: {gm.get('change_summary', '')})"
            )
        else:
            lines.append("  - Guideline change detected: No")
        if user_state.get("explanation"):
            lines.append(f"  - AI explanation: {user_state['explanation']}")
    else:
        lines.append("- User has NOT run an analysis in this session yet.")

    # ── Full analysis object (detailed breakdown) ──
    analysis = frontend_context.get("analysis")
    # Also support legacy flat context (analysisContext passed directly)
    if not analysis and frontend_context.get("freshness_score") is not None:
        analysis = frontend_context
    if analysis and analysis.get("freshness_score") is not None:
        lines.append(f"- Freshness score (full): {analysis.get('freshness_score')}/100 ({analysis.get('score_color', '')})")
        if analysis.get("score_breakdown"):
            sb = analysis["score_breakdown"]
            lines.append(
                f"  Score breakdown: guideline_penalty={sb.get('guideline_penalty', 0)}, "
                f"drift_penalty={sb.get('drift_penalty', 0)}, "
                f"time_penalty={sb.get('time_penalty', 0)}, "
                f"years_since_diagnosis={sb.get('years_since_diagnosis', '?')}"
            )
        if analysis.get("extracted"):
            ext = analysis["extracted"]
            lines.append(f"  Extracted diagnosis: {ext.get('diagnosis', 'Unknown')} "
                         f"({ext.get('framework', '?')}, {ext.get('diagnosis_date', '?')})")
        if analysis.get("guideline_match", {}).get("matched"):
            gm = analysis["guideline_match"]
            lines.append(f"  Guideline change: {gm.get('change_type')} — {gm.get('change_summary')} (Source: {gm.get('source_citation')})")
        if analysis.get("explanation"):
            lines.append(f"  AI explanation: {analysis['explanation']}")

    return "\n".join(lines) if lines else "No context details available."


@app.post("/chat/message", response_model=ChatMessageResponse)
def chat_message(body: ChatMessageRequest):
    """
    Site-aware AI chatbot endpoint for the Living Diagnosis assistant.

    Knows the product, its pages, workflow, and why specific information is
    collected. Uses APP_KNOWLEDGE + frontend page/state context in every prompt.

    Safety pipeline (STRICT ORDER — do not reorder):
      1. Deterministic crisis/self-harm detector (pure Python regex, no LLM).
         If triggered → return crisis response immediately, no LLM call.
      2. DEMO_MODE guard → site-aware keyword-matched canned response, no LLM.
      3. Azure OpenAI with APP_KNOWLEDGE + frontend context in system prompt.
    """
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message cannot be empty.")

    # ── Parse structured context from frontend ──
    frontend_context: dict = body.context or {}
    analysis_context: Optional[dict] = frontend_context.get("analysis")
    page_context: Optional[str] = frontend_context.get("page")
    user_state: Optional[dict] = frontend_context.get("user_state")
    visible_features: Optional[list] = frontend_context.get("visible_features")

    # Debug logging
    print("CHAT DEBUG:", {
        "message": message,
        "page": page_context,
        "has_analysis": bool(analysis_context),
        "demo_mode": DEMO_MODE,
        "visible_features": visible_features,
        "user_state_keys": list(user_state.keys()) if user_state else [],
    })

    # ── STEP 1: EMERGENCY BRAKE — runs first, always, no exceptions ──
    crisis_result = check_crisis(message)
    if crisis_result["crisis_flag"]:
        print("[CHAT] Crisis detected — returning crisis response, skipping LLM.")
        return ChatMessageResponse(
            response=CRISIS_MESSAGE,
            crisis_triggered=True,
        )

    # ── STEP 2: DEMO MODE — site-aware canned responses, no LLM call ──
    if DEMO_MODE:
        print("[CHAT] DEMO_MODE active — returning site-aware canned response.")
        return ChatMessageResponse(
            response=_pick_demo_response(message, analysis_context),
            crisis_triggered=False,
        )

    # ── STEP 3: Azure OpenAI with APP_KNOWLEDGE + context ──
    if not AZURE_CONFIGURED or client is None:
        raise HTTPException(
            status_code=503,
            detail="Chat assistant unavailable — Azure OpenAI is not configured.",
        )

    context_block = _build_context_block(frontend_context)

    full_system_prompt = (
        _CHAT_SYSTEM_PROMPT
        + "\n\n---\nAPP_KNOWLEDGE:\n"
        + json.dumps(APP_KNOWLEDGE, indent=2)
        + "\n\n---\nCURRENT_FRONTEND_CONTEXT:\n"
        + context_block
    )

    # Last 5 history messages only
    recent_history = (body.history or [])[-5:]
    safe_history = [
        {"role": e["role"], "content": e["content"]}
        for e in recent_history
        if e.get("role") in ("user", "assistant")
        and isinstance(e.get("content"), str)
        and e["content"].strip()
    ]

    messages_payload = [
        {"role": "system", "content": full_system_prompt},
        *safe_history,
        {"role": "user", "content": message},
    ]

    print(f"[CHAT] Sending to Azure OpenAI (model={AZURE_OPENAI_DEPLOYMENT}, "
          f"history={len(safe_history)}, page={page_context}, has_analysis={bool(analysis_context)})")

    try:
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            messages=messages_payload,
            temperature=0.4,
            max_completion_tokens=300,
        )
        ai_text = (response.choices[0].message.content or "").strip()
        print(f"[CHAT] Response received (first 100 chars): {ai_text[:100]!r}")
    except Exception as api_err:
        print(f"[CHAT] ❌ Azure OpenAI API call failed: {type(api_err).__name__}: {api_err}")
        raise HTTPException(
            status_code=502,
            detail=f"Chat API call failed: {type(api_err).__name__}",
        )

    return ChatMessageResponse(
        response=ai_text,
        crisis_triggered=False,
    )


# ═════════════════════════════════════════════════════════════════
# E. ANALYSIS HISTORY ENDPOINTS
# ═════════════════════════════════════════════════════════════════


class SaveHistoryRequest(BaseModel):
    user_id: str
    patient_id: Optional[str] = None
    diagnosis: Optional[str] = None
    freshness_score: Optional[int] = None
    score_color: Optional[str] = None
    score_breakdown: Optional[dict] = None
    guideline_matched: Optional[bool] = None
    semantic_drift_score: Optional[float] = None
    explanation: Optional[str] = None


@app.post("/analysis/history", status_code=201)
def save_analysis_history(body: SaveHistoryRequest):
    """Persist the result of /api/analyze for trend tracking."""
    history = _read(HISTORY_FILE)
    entry = {
        "id": f"hist_{uuid.uuid4().hex[:8]}",
        "user_id": body.user_id,
        "patient_id": body.patient_id,
        "diagnosis": body.diagnosis,
        "freshness_score": body.freshness_score,
        "score_color": body.score_color,
        "score_breakdown": body.score_breakdown,
        "guideline_matched": body.guideline_matched,
        "semantic_drift_score": body.semantic_drift_score,
        "explanation": body.explanation,
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
    }
    history.append(entry)
    _write(HISTORY_FILE, history)
    return entry


@app.get("/analysis/history")
def get_analysis_history(user_id: str):
    """Return all past analysis results for a user, newest first."""
    history = _read(HISTORY_FILE)
    user_history = [
        h for h in history if h["user_id"] == user_id
    ]
    user_history.sort(key=lambda h: h["analyzed_at"], reverse=True)
    return user_history


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)