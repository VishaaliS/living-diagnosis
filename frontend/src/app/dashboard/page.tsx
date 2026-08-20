'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken, getEmail, clearToken, getPatientId, setPatientId } from '@/lib/api';
import FloatingCTA from '@/components/ui/floating-cta';
import Navbar from '@/components/ui/navbar';
interface CheckIn {
  id: string;
  date: string;
  mood_score: number;
  symptom_notes: string;
  created_at: string;
}

function getMoodLabel(score: number): string {
  if (score >= 9) return 'Excellent';
  if (score >= 7) return 'Good';
  if (score >= 5) return 'Fair';
  if (score >= 3) return 'Low';
  return 'Very Low';
}

function getMoodColor(score: number): string {
  if (score >= 7) return 'bg-green-100 text-green-800';
  if (score >= 4) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

function getScoreStatus(score: number) {
  if (score >= 70) return { label: 'Current', color: 'bg-green-100 text-green-800' };
  if (score >= 40) return { label: 'Review Recommended', color: 'bg-yellow-100 text-yellow-800' };
  return { label: 'Potentially Stale', color: 'bg-red-100 text-red-800' };
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');

  // Checkins list
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [checkinsLoading, setCheckinsLoading] = useState(true);
  const [checkinsError, setCheckinsError] = useState('');

  // History list
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // New check-in form
  const [moodScore, setMoodScore] = useState(7);
  const [symptomNotes, setSymptomNotes] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Documents
  const [documents, setDocuments] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadMsg, setUploadMsg] = useState("");

  // Document analysis
  const [docAnalysis, setDocAnalysis] = useState<{
    medications: { name: string; dosage?: string | null; frequency?: string | null }[];
    prescribing_doctor: string | null;
    date: string | null;
    diagnoses_mentioned: string[];
  } | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // Patient Profile
  const [patientIdState, setPatientIdState] = useState<string | null>(null);
  const [patient, setPatient] = useState<any>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  
  // Patient Form
  const [pName, setPName] = useState('');
  const [pDob, setPDob] = useState('');
  const [pDiag, setPDiag] = useState('');
  const [pYear, setPYear] = useState('');
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState('');

  const loadPatient = useCallback(async (id: string) => {
    setPatientLoading(true);
    try {
      const data = await apiFetch(`/patients/${id}`);
      setPatient(data);
    } catch (err) {
      console.error(err);
      setPatient(null);
    } finally {
      setPatientLoading(false);
    }
  }, []);

  const loadDocuments = useCallback(async (pId: string) => {
    setDocsLoading(true);
    try {
      const data = await apiFetch<any[]>(`/patients/${pId}/documents`);
      setDocuments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  // ── Auth guard ──────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setUserId(token);
    setEmail(getEmail() ?? '');
    
    const pId = getPatientId();
    if (pId) {
      setPatientIdState(pId);
      loadPatient(pId);
      loadDocuments(pId);
    } else {
      // Lookup if patient profile exists on the backend
      apiFetch<any[]>('/patients').then(patients => {
        if (patients && patients.length > 0) {
          const existingPatient = patients[0];
          setPatientId(existingPatient.id);
          setPatientIdState(existingPatient.id);
          setPatient(existingPatient);
          loadDocuments(existingPatient.id);
        }
      }).catch(err => console.error("Failed to lookup existing patient", err));
    }
  }, [router, loadPatient, loadDocuments]);

  // ── Load checkins ───────────────────────────────────────────────
  const loadCheckins = useCallback(async (uid: string) => {
    setCheckinsLoading(true);
    setCheckinsError('');
    try {
      const data = await apiFetch<CheckIn[]>(`/checkins?user_id=${uid}`);
      // Newest first for display
      setCheckins([...data].reverse());
    } catch (err: unknown) {
      setCheckinsError(err instanceof Error ? err.message : 'Failed to load check-ins.');
    } finally {
      setCheckinsLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (uid: string) => {
    setHistoryLoading(true);
    try {
      const data = await apiFetch<any[]>(`/analysis/history?user_id=${uid}`);
      setHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      loadCheckins(userId);
      loadHistory(userId);
    }
  }, [userId, loadCheckins, loadHistory]);

  // ── Submit check-in ─────────────────────────────────────────────
  const handleCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError('');
    setSubmitSuccess(false);

    const today = new Date().toISOString().split('T')[0];

    try {
      await apiFetch('/checkins', {
        method: 'POST',
        body: JSON.stringify({
          date: today,
          mood_score: moodScore,
          symptom_notes: symptomNotes,
        }),
      });
      setSubmitSuccess(true);
      setSymptomNotes('');
      setMoodScore(7);
      await loadCheckins(userId);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save check-in.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── Submit Patient Profile ──────────────────────────────────────
  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setPLoading(true);
    setPError('');
    try {
      const data = await apiFetch<any>('/patients', {
        method: 'POST',
        body: JSON.stringify({
          name: pName,
          dob: pDob || null,
          primary_diagnosis: pDiag || null,
          diagnosis_year: pYear ? parseInt(pYear) : null,
          medications: []
        }),
      });
      setPatientId(data.id);
      setPatientIdState(data.id);
      setPatient(data);
      loadDocuments(data.id);
    } catch (err: unknown) {
      setPError(err instanceof Error ? err.message : 'Failed to create profile.');
    } finally {
      setPLoading(false);
    }
  };

  // ── File Upload + Analysis ──────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patientIdState) return;

    setUploadStatus("uploading");
    setUploadMsg("Uploading…");
    setDocAnalysis(null);
    setAnalysisError("");

    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("patient_id", patientIdState);

    let savedAs: string | null = null;

    try {
      const res = await fetch("http://localhost:8000/upload/prescription", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      savedAs = data.document?.saved_as ?? null;
      setUploadStatus("success");
      setUploadMsg("✅ Uploaded successfully — analysing…");
      await loadDocuments(patientIdState);
    } catch (err: any) {
      setUploadStatus("error");
      setUploadMsg(`❌ ${err.message || "Upload failed"}`);
      e.target.value = '';
      return;
    }

    // ── Trigger document analysis if we have a saved filename ──────
    if (savedAs) {
      setAnalysisLoading(true);
      try {
        const analysisRes = await fetch("http://localhost:8000/api/analyze-document", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ filename: savedAs }),
        });
        const analysisData = await analysisRes.json();
        if (!analysisRes.ok) throw new Error(analysisData.detail || "Analysis failed");

        setDocAnalysis(analysisData);
        setUploadMsg("✅ Upload & analysis complete");

        // ── Auto-update patient medications ────────────────────────
        const extractedMedNames: string[] = (analysisData.medications ?? [])
          .map((m: any) => (typeof m === "string" ? m : m.name))
          .filter(Boolean);

        if (extractedMedNames.length > 0 && patientIdState) {
          const existing: string[] = patient?.medications ?? [];
          const merged = Array.from(new Set([...existing, ...extractedMedNames]));
          try {
            await apiFetch(`/patients/${patientIdState}/medications`, {
              method: "PUT",
              body: JSON.stringify({ medications: merged }),
            });
            // Refresh patient profile to reflect updated medications
            await loadPatient(patientIdState);
          } catch (medErr) {
            console.error("Failed to update medications:", medErr);
          }
        }
      } catch (err: any) {
        setAnalysisError(err.message || "Could not analyse document.");
        setUploadMsg("✅ Uploaded — analysis failed");
      } finally {
        setAnalysisLoading(false);
      }
    }

    // reset input
    e.target.value = '';
  };

  // ── Sign out ────────────────────────────────────────────────────
  const handleSignOut = () => {
    clearToken();
    router.replace('/login');
  };

  // Today's date formatted nicely
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Derive display name: patient name > email prefix > fallback
  const displayName = patient?.name ?? (email ? email.split('@')[0] : 'there');

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: 'var(--ld-background)', color: 'var(--ld-on-background)', fontFamily: 'var(--font-inter, Inter, sans-serif)' }}
    >
      <Navbar />

      {/* ── Main ── */}
      <main
        style={{
          flexGrow: 1,
          width: '100%',
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '128px 16px 96px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
        }}
      >
        {/* Welcome */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
              fontSize: 'clamp(28px, 4vw, 32px)',
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.04em',
              color: 'var(--ld-on-surface)',
              margin: 0,
            }}
          >
            Welcome back, {displayName}
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
            Track your daily wellbeing and diagnostic history.
          </p>
        </section>

        {/* ── Patient Profile (kept as-is, shown when profile not yet created) ── */}
        {!patient && !patientLoading && (
          <section
            className="glass-card"
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
                  fontSize: '24px',
                  fontWeight: 700,
                  color: 'var(--ld-on-surface)',
                  margin: '0 0 4px',
                }}
              >
                Patient Profile
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
                Set up your profile before uploading documents or running analyses.
              </p>
            </div>
            <form onSubmit={handleCreatePatient} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ld-on-surface)' }}>Full Name</label>
                  <input className="input-field" value={pName} onChange={(e) => setPName(e.target.value)} required placeholder="Jane Doe" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ld-on-surface)' }}>Date of Birth</label>
                  <input className="input-field" type="date" value={pDob} onChange={(e) => setPDob(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ld-on-surface)' }}>Primary Diagnosis</label>
                  <input className="input-field" value={pDiag} onChange={(e) => setPDiag(e.target.value)} placeholder="e.g. Asperger's Syndrome" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ld-on-surface)' }}>Diagnosis Year</label>
                  <input className="input-field" type="number" value={pYear} onChange={(e) => setPYear(e.target.value)} placeholder="e.g. 2011" min="1900" max="2030" />
                </div>
              </div>
              {pError && (
                <div style={{ padding: '12px', background: 'var(--ld-error-container)', borderRadius: '12px', fontSize: '14px', color: 'var(--ld-on-error-container)' }}>
                  {pError}
                </div>
              )}
              <div>
                <button className="btn-primary" type="submit" disabled={pLoading} style={{ padding: '10px 28px', fontSize: '14px' }}>
                  {pLoading ? 'Saving…' : 'Create Profile'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Patient profile display (when loaded) */}
        {patient && (
          <section
            className="glass-card"
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
                  fontSize: '24px',
                  fontWeight: 700,
                  color: 'var(--ld-on-surface)',
                  margin: '0 0 4px',
                }}
              >
                Patient Profile
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
                Your personal and diagnostic information.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', fontSize: '14px' }}>
              {[
                { label: 'Name', value: patient.name },
                { label: 'Date of Birth', value: patient.dob || 'Not provided' },
                { label: 'Primary Diagnosis', value: patient.primary_diagnosis || 'Not provided' },
                { label: 'Diagnosis Year', value: patient.diagnosis_year || 'Not provided' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <span style={{ color: 'var(--ld-on-surface-variant)', display: 'block', marginBottom: '4px' }}>{label}</span>
                  <span style={{ fontWeight: 500, color: 'var(--ld-on-surface)' }}>{value}</span>
                </div>
              ))}
              {patient.medications && patient.medications.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--ld-on-surface-variant)', display: 'block', marginBottom: '6px' }}>Medications</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {patient.medications.map((m: string, i: number) => (
                      <span
                        key={i}
                        style={{
                          background: 'var(--ld-surface-container)',
                          border: '1px solid var(--ld-outline-variant)',
                          borderRadius: '9999px',
                          padding: '2px 12px',
                          fontSize: '13px',
                          color: 'var(--ld-on-surface)',
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {patientLoading && (
          <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)' }}>Loading profile…</p>
        )}

        {/* ── Two-column grid: Check-In + Documents ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '32px',
          }}
        >
          {/* Daily Check-In */}
          <section
            style={{
              backgroundColor: 'rgb(255, 204, 112)',
              borderRadius: '28px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '320px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '12px', flexGrow: 1 }}>
              <h2
                style={{
                  fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
                  fontSize: '24px',
                  fontWeight: 700,
                  color: 'rgb(41, 169, 232)',
                  margin: 0,
                }}
              >
                Daily Check-In
              </h2>

              {/* Mood slider */}
              <div style={{ width: '100%', padding: '0 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'rgba(0,0,0,0.6)' }}>Mood Score</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(0,0,0,0.7)' }}>
                    {moodScore}/10 — {getMoodLabel(moodScore)}
                  </span>
                </div>
                <input
                  id="mood-slider"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={moodScore}
                  onChange={(e) => setMoodScore(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'rgb(41, 169, 232)', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(0,0,0,0.45)', marginTop: '2px' }}>
                  <span>1 — Very Low</span>
                  <span>10 — Excellent</span>
                </div>
              </div>

              {/* Symptom notes textarea */}
              <div style={{ width: '100%', padding: '0 12px' }}>
                <textarea
                  id="symptom-notes"
                  value={symptomNotes}
                  onChange={(e) => setSymptomNotes(e.target.value)}
                  placeholder="How are you feeling?"
                  rows={3}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.3)',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '14px',
                    color: 'var(--ld-on-surface)',
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'var(--font-inter, Inter, sans-serif)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {submitError && (
                <div style={{ padding: '10px 14px', background: 'var(--ld-error-container)', borderRadius: '12px', fontSize: '13px', color: 'var(--ld-on-error-container)', width: '100%', boxSizing: 'border-box' }}>
                  {submitError}
                </div>
              )}
              {submitSuccess && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.5)', borderRadius: '12px', fontSize: '13px', color: '#1a5c1a', width: '100%', boxSizing: 'border-box' }}>
                  ✓ Check-in saved for today!
                </div>
              )}
            </div>

            {/* Footer row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <span style={{ fontSize: '14px', color: 'rgb(41, 169, 232)' }}>{todayFormatted}</span>
              <button
                onClick={handleCheckinSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
                disabled={submitLoading}
                title={submitLoading ? 'Saving…' : 'Save Check-In'}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgb(41, 169, 232)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: submitLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  opacity: submitLoading ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {/* Save icon via lucide-react-like SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
              </button>
            </div>
          </section>

          {/* Documents */}
          <section
            className="glass-card"
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              border: '1px solid rgba(192,199,210,0.3)',
              boxShadow: '0 4px 24px rgba(0,100,180,0.06)',
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
                  fontSize: '24px',
                  fontWeight: 700,
                  color: 'var(--ld-on-surface)',
                  margin: '0 0 4px',
                }}
              >
                Documents
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
                Upload prescriptions or clinical notes.
              </p>
            </div>

            {patientIdState ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      className="btn-primary"
                      style={{ padding: '12px 32px', fontSize: '14px', opacity: uploadStatus === 'uploading' ? 0.7 : 1 }}
                      disabled={uploadStatus === 'uploading'}
                    >
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.txt"
                        onChange={handleUpload}
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                      />
                      {uploadStatus === 'uploading' ? 'Uploading…' : 'Upload Prescription or Clinical Document'}
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
                    PDF, PNG, JPG, TXT — Max 10MB
                  </p>
                  {uploadStatus !== 'idle' && uploadStatus !== 'uploading' && (
                    <p style={{ fontSize: '14px', fontWeight: 500, color: uploadStatus === 'success' ? '#1a6b1a' : 'var(--ld-error)', margin: 0 }}>
                      {uploadMsg}
                    </p>
                  )}
                </div>

                {/* Document analysis results */}
                {(analysisLoading || docAnalysis || analysisError) && (
                  <div
                    style={{
                      background: 'linear-gradient(135deg, rgba(238,242,255,0.9) 0%, rgba(245,243,255,0.9) 100%)',
                      borderRadius: '16px',
                      border: '1px solid rgba(99,102,241,0.2)',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                        🔬
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 600, fontSize: '15px', color: '#1e1b4b', margin: 0 }}>Prescription Analysis</p>
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>AI-extracted clinical data</p>
                      </div>
                      {analysisLoading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6366f1', fontSize: '13px' }}>
                          <svg style={{ animation: 'spin 1s linear infinite', width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none">
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                          </svg>
                          Analysing…
                        </div>
                      )}
                    </div>
                    {analysisError && (
                      <div style={{ padding: '10px', background: '#fef2f2', borderRadius: '10px', fontSize: '13px', color: '#b91c1c' }}>
                        ⚠️ {analysisError}
                      </div>
                    )}
                    {docAnalysis && !analysisLoading && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {[
                            { label: 'Prescribing Doctor', value: docAnalysis.prescribing_doctor ?? 'Not specified' },
                            { label: 'Prescription Date', value: docAnalysis.date ?? 'Not specified' },
                          ].map(({ label, value }) => (
                            <div key={label} style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(99,102,241,0.15)' }}>
                              <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#818cf8', margin: '0 0 4px' }}>{label}</p>
                              <p style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', margin: 0 }}>{value}</p>
                            </div>
                          ))}
                        </div>
                        {docAnalysis.diagnoses_mentioned.length > 0 && (
                          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(139,92,246,0.15)' }}>
                            <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a78bfa', margin: '0 0 8px' }}>Diagnoses Mentioned</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {docAnalysis.diagnoses_mentioned.map((d, i) => (
                                <span key={i} style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: '9999px', padding: '2px 10px', fontSize: '12px', fontWeight: 500 }}>{d}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {docAnalysis.medications.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#818cf8', margin: 0 }}>Medications Extracted</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px' }}>
                              {docAnalysis.medications.map((med, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(99,102,241,0.1)' }}>
                                  <span style={{ fontSize: '16px' }}>💊</span>
                                  <div>
                                    <p style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', margin: '0 0 2px' }}>{med.name}</p>
                                    <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>{[med.dosage, med.frequency].filter(Boolean).join(' · ') || 'Details not specified'}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Uploaded Files */}
                <div style={{ flexGrow: 1 }}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
                      fontSize: '20px',
                      fontWeight: 600,
                      color: 'var(--ld-on-surface)',
                      margin: '0 0 12px',
                    }}
                  >
                    Uploaded Files
                  </h3>
                  {docsLoading ? (
                    <div className="soft-card" style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80px' }}>
                      <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>Loading documents…</p>
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="soft-card" style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80px', border: '1px dashed rgba(0,94,148,0.2)' }}>
                      <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>No documents uploaded yet</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {documents.map((doc, idx) => (
                        <a
                          key={idx}
                          href={`http://localhost:8000/uploads/${doc.saved_as}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px',
                            borderRadius: '16px',
                            background: 'var(--ld-surface-container-low)',
                            border: '1px solid var(--ld-outline-variant)',
                            textDecoration: 'none',
                            transition: 'background 0.15s',
                          }}
                        >
                          <span style={{ fontSize: '20px' }}>📄</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 500, fontSize: '14px', color: 'var(--ld-on-surface)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.filename || doc.original_name}
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
                              {new Date(doc.uploaded_at).toLocaleDateString()}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', background: 'var(--ld-surface-container)', padding: '16px', borderRadius: '16px' }}>
                Please create a patient profile above before uploading documents.
              </p>
            )}
          </section>
        </div>

        {/* ── My Check-Ins ── */}
        <section
          className="glass-card"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            border: '1px solid rgba(192,199,210,0.3)',
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--ld-on-surface)',
                margin: '0 0 4px',
              }}
            >
              My Check-Ins
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
              Your mood and symptom history.
            </p>
            {checkins.length > 0 && (
              <p style={{ fontSize: '14px', color: 'var(--ld-on-surface)', fontWeight: 500, marginTop: '8px' }}>
                Average mood (last {Math.min(checkins.length, 7)} entries):{' '}
                {(checkins.slice(0, 7).reduce((acc, c) => acc + c.mood_score, 0) / Math.min(checkins.length, 7)).toFixed(1)}/10
              </p>
            )}
          </div>

          {checkinsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: 'var(--ld-on-surface-variant)', fontSize: '14px' }}>
              Loading check-ins…
            </div>
          ) : checkinsError ? (
            <div style={{ padding: '12px', background: 'var(--ld-error-container)', borderRadius: '12px', fontSize: '14px', color: 'var(--ld-on-error-container)' }}>
              {checkinsError}
            </div>
          ) : checkins.length === 0 ? (
            <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <p style={{ fontSize: '15px', color: 'var(--ld-on-surface-variant)', textAlign: 'center', maxWidth: '440px', margin: 0 }}>
                No check-ins yet. Start tracking today.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {checkins.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px',
                    borderRadius: '16px',
                    border: '1px solid var(--ld-outline-variant)',
                    background: '#fff',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      borderRadius: '9999px',
                      padding: '2px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: c.mood_score >= 7 ? '#dcfce7' : c.mood_score >= 4 ? '#fef9c3' : '#fee2e2',
                      color: c.mood_score >= 7 ? '#166534' : c.mood_score >= 4 ? '#854d0e' : '#991b1b',
                    }}
                  >
                    {c.mood_score}/10
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ld-on-surface)' }}>{c.date}</span>
                      <span style={{ fontSize: '12px', color: 'var(--ld-on-surface-variant)' }}>— {getMoodLabel(c.mood_score)}</span>
                    </div>
                    {c.symptom_notes && (
                      <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.symptom_notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Diagnosis Freshness History ── */}
        <section
          className="glass-card"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            border: '1px solid rgba(192,199,210,0.3)',
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--ld-on-surface)',
                margin: '0 0 4px',
              }}
            >
              Diagnosis Freshness History
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
              Your past analysis results and diagnostic trends.
            </p>
          </div>

          {historyLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: 'var(--ld-on-surface-variant)', fontSize: '14px' }}>
              Loading history…
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
              <p style={{ fontSize: '15px', color: 'var(--ld-on-surface-variant)', textAlign: 'center', maxWidth: '440px', margin: 0 }}>
                No analysis history yet. Run an analysis on the main page to start tracking.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Trend chart */}
              {history.length >= 2 && (
                <div style={{ background: 'var(--ld-surface-container-low)', padding: '16px', borderRadius: '16px', border: '1px solid var(--ld-outline-variant)', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ld-on-surface-variant)', marginBottom: '12px' }}>
                    Freshness Trend
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '64px', width: '100%' }}>
                    {history.slice().reverse().map((entry, idx) => {
                      const h = Math.max(10, entry.freshness_score);
                      const color = entry.freshness_score >= 70 ? '#4ade80' : entry.freshness_score >= 40 ? '#facc15' : '#f87171';
                      return (
                        <div
                          key={entry.id || idx}
                          style={{
                            width: '24px',
                            borderRadius: '4px 4px 0 0',
                            backgroundColor: color,
                            height: `${h}%`,
                            transition: 'all 0.3s',
                            cursor: 'default',
                          }}
                          title={`${entry.date}: ${entry.freshness_score}/100`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* History list */}
              {history.map((h, idx) => {
                const status = getScoreStatus(h.freshness_score);
                const statusStyles = {
                  'Current': { background: '#dcfce7', color: '#166534' },
                  'Review Recommended': { background: '#fef9c3', color: '#854d0e' },
                  'Potentially Stale': { background: 'var(--ld-error-container)', color: 'var(--ld-on-error-container)' },
                }[status.label] ?? { background: 'var(--ld-surface-container)', color: 'var(--ld-on-surface)' };

                return (
                  <div
                    key={h.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '16px',
                      padding: '16px',
                      borderRadius: '16px',
                      border: '1px solid var(--ld-outline-variant)',
                      background: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <h3
                        style={{
                          fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
                          fontSize: '20px',
                          fontWeight: 600,
                          color: 'var(--ld-on-surface)',
                          margin: 0,
                        }}
                      >
                        {h.diagnosis || 'Unknown Diagnosis'}
                      </h3>
                      <p style={{ fontSize: '14px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
                        Score: {h.freshness_score}/100
                        {h.date && <span style={{ marginLeft: '8px', fontSize: '12px' }}>· {h.date}</span>}
                      </p>
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        ...statusStyles,
                        borderRadius: '9999px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>


      </main>

      {/* ── Footer ── */}
      <footer style={{ backgroundColor: 'var(--ld-surface-container-lowest)', marginTop: '64px', padding: '24px' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '0 24px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)',
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--ld-on-surface-variant)',
            }}
          >
            Living Diagnosis
          </span>
          <p style={{ fontSize: '12px', color: 'var(--ld-on-surface-variant)', margin: 0, opacity: 0.7 }}>
            © 2024 Living Diagnosis. Clinical Precision Meets AI Intelligence.
          </p>
          <div style={{ display: 'flex', gap: '16px' }}>
            {['Privacy Policy', 'Terms of Service', 'Support'].map((link) => (
              <a
                key={link}
                href="#"
                style={{ fontSize: '12px', color: 'var(--ld-on-surface-variant)', opacity: 0.7, textDecoration: 'none', transition: 'color 0.15s, opacity 0.15s' }}
                onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--ld-primary)'; (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--ld-on-surface-variant)'; (e.currentTarget as HTMLAnchorElement).style.opacity = '0.7'; }}
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
      <FloatingCTA />
    </div>
  );
}

