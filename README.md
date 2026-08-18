# Living Diagnosis Prototype

A multi-agent healthcare system that checks whether a patient's old mental health diagnosis is outdated relative to current diagnostic guidelines (DSM-5/ICD-11) and their own evolving symptoms.

## Setup

### Backend (FastAPI)

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Copy the `.env.example` to `.env` and add your OpenAI API key:
   ```bash
   cp .env.example .env
   # Edit .env and set OPENAI_API_KEY
   ```
4. Run the server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend (Next.js)

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features
- **Deterministic Emergency Brake**: Pure-Python regex intercepts crisis language before hitting the LLM.
- **Guideline Matching**: Checks against a curated registry of known guideline changes.
- **Semantic Drift Analysis**: Compares symptoms against current criteria using embeddings.
- **Freshness Score**: Deterministic score out of 100 based on matches and drift.
- **Plain-Language Explanation**: Generates a non-alarming explanation for the patient.
