PROBLEM STATEMENT

A mental health diagnosis is not a permanent medical fact — it is a clinical hypothesis, formed at a specific point in time using the symptoms a patient reported, the diagnostic guidelines available then, and one doctor's judgment. All three of these inputs change over time: diagnostic manuals like the DSM and ICD are periodically revised, patients' symptoms evolve over years, and patients frequently switch doctors, hospitals, and cities. Yet once a diagnosis is written into a medical record, it is treated as permanent — nothing in the healthcare system ever revisits it.

This is not a hypothetical gap. In 2013, the DSM was updated from its 4th to its 5th edition, and this single revision eliminated, merged, split, or renamed more than 15 major diagnostic categories that had been standard for decades — including eliminating "Asperger's Disorder" entirely and folding it into "Autism Spectrum Disorder." Anyone diagnosed before 2013 still carries the old, now-obsolete label in their file today, and no one has ever told them. This pattern repeats across nearly every major guideline revision, and it is compounded by well-documented misdiagnosis rates: 69% of bipolar disorder patients are initially misdiagnosed, often for over a decade (Hirschfeld et al., 2003), and primary care physicians correctly identify depression in only about 47% of true cases (Mitchell, Vaze & Rao, The Lancet, 2009).

The root failure is systemic: no mechanism exists anywhere in healthcare — no software, no checkpoint, no process — that ever asks "does this diagnosis still hold up, given how the guidelines and the patient have both changed?" Diagnoses are written once and trusted indefinitely, with zero re-verification, and patients have no way of knowing when their own record has quietly become outdated.

PROJECT STATEMENT

Living Diagnosis is a multi-agent AI system that continuously checks whether a patient's existing mental health diagnosis is still valid — against both evolving clinical guidelines (DSM/ICD revisions) and the patient's own changing symptoms — and alerts them when a professional re-evaluation may be warranted. It is explicitly not a diagnostic tool and not a replacement for a doctor; its only output is a scored, explained recommendation to seek professional review.

The system works through a coordinated pipeline of specialized agents. A deterministic, non-AI safety layer first scans every submission for crisis or self-harm language using fixed pattern matching — if detected, it immediately bypasses all further processing and displays emergency resources, functioning independently of any AI model so it can never fail, hallucinate, or be overridden. If no crisis is detected, an Extractor Agent uses an LLM to pull structured clinical facts (diagnosis, date, symptoms) from unstructured notes; a Researcher Agent then deterministically checks that diagnosis against a curated, cited registry of real DSM/ICD guideline changes and measures semantic drift between the patient's recent symptoms and current diagnostic criteria; and a Communicator Agent uses a constrained LLM prompt to translate the resulting Freshness Score into a plain-language, disclaimer-terminated explanation for the patient.

The result is a patient-owned, privacy-first platform — encrypted storage, database-level access control, consent-gated doctor access, and full audit logging — that treats a diagnosis not as a permanent label, but as a claim that deserves to be periodically re-examined, ensuring that no diagnosis gets left behind as medical knowledge moves forward.

Living Diagnosis — Solution (Standalone Slide-Ready Version)

The Solution, In One Line

Living Diagnosis is a multi-agent AI system that continuously re-checks whether a patient's existing mental health diagnosis is still valid — against updated clinical guidelines and their own evolving symptoms — and alerts them when a professional re-evaluation may be needed.

It does not diagnose. It does not replace doctors. It does exactly one job: "This diagnosis may be outdated — here's why — please get it checked."

How It Works — The Pipeline

text

Patient uploads clinical notes
        ↓
┌─────────────────────────────────────────┐
│  EMERGENCY BRAKE (deterministic, no AI)   │
│  Regex scan for crisis/self-harm language │
└─────────────────────────────────────────┘
        ↓                           ↓
   CRISIS DETECTED           NO CRISIS DETECTED
        ↓                           ↓
  Immediate crisis        ┌───────────────────┐
  resource card           │  EXTRACTOR AGENT    │ (LLM)
  (bypasses everything    │  Pulls diagnosis,    │
   else, works even       │  date, symptoms from │
   with no AI available)  │  messy clinical text │
                           └───────────┬───────┘
                                       ↓
                           ┌───────────────────┐
                           │  RESEARCHER AGENT    │ (deterministic)
                           │  • Matches diagnosis  │
                           │    against Guideline  │
                           │    Change Registry    │
                           │  • Measures symptom   │
                           │    drift vs current   │
                           │    criteria           │
                           │  • Calculates          │
                           │    Freshness Score     │
                           └───────────┬───────┘
                                       ↓
                           ┌───────────────────┐
                           │  COMMUNICATOR AGENT  │ (LLM, constrained)
                           │  Converts score into  │
                           │  plain-language        │
                           │  explanation +          │
                           │  disclaimer            │
                           └───────────┬───────┘
                                       ↓
                           Patient Dashboard:
                           Freshness Score (0-100)
                           Green / Yellow / Red
The Three Agents — What Each One Actually Does

1. Extractor Agent (LLM)
Reads unstructured clinical notes and converts them into structured data: diagnosis label, date, diagnostic framework used, symptoms mentioned. Turns messy text into something the system can actually reason about.

2. Researcher Agent (deterministic — zero LLM calls)

Checks the diagnosis against a curated, cited registry of 20 real DSM-IV→5 / ICD-10→11 guideline changes (e.g., "Asperger's merged into Autism Spectrum Disorder, 2013")
Compares the patient's recent symptoms against current diagnostic criteria to detect drift toward a different condition
Calculates the Freshness Score using a fixed, transparent formula — not a black box
3. Communicator Agent (LLM, tightly constrained)
Translates the score and evidence into a warm, plain-language explanation. Instructed to never suggest an alternative diagnosis, never give treatment advice — only explain the facts and recommend professional consultation. Every output ends with a fixed disclaimer.

The Non-Negotiable Safety Layer

Before any of the above runs, a pure Python regex check — completely outside the AI system — scans for crisis or self-harm language. If triggered, it immediately shows a fixed, pre-written crisis resource card and skips everything else. This works even if the AI model is unavailable or disconnected entirely, because it has zero dependency on any LLM. This is the one decision in the entire system that a probabilistic model is never trusted to make.

What Makes This Different From an EHR

Traditional EHR	Living Diagnosis
Stores diagnosis as a static label	Treats diagnosis as a claim requiring periodic re-verification
Nothing happens over time	Actively re-evaluates against new guidelines and new symptoms
Hospital-owned	Patient-owned, portable across doctors and cities
Stores documents	Extracts structured clinical facts
No guideline-awareness	Built-in, cited registry of real diagnostic guideline changes
Patient never knows a record is outdated	Patient receives a scored, explained, actionable alert
The Guardrails (say these out loud, always)

Not a diagnostic tool. Never outputs a new diagnosis.
Not a replacement for doctors. Every result ends with: "This is not a diagnosis. Please consult a licensed mental health professional."
Crisis detection never touches the LLM. Deterministic, testable, provably independent of AI availability.
Patient owns the data. Encrypted storage, database-enforced access control, consent-gated doctor sharing, full audit logs.