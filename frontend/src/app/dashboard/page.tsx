'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch, getToken, getEmail, clearToken, getPatientId, setPatientId } from '@/lib/api';

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

  // ── File Upload ─────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patientIdState) return;

    setUploadStatus("uploading");
    setUploadMsg("Uploading...");
    
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("patient_id", patientIdState);

    try {
      const res = await fetch("http://localhost:8000/upload/prescription", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      
      setUploadStatus("success");
      setUploadMsg("✅ Uploaded successfully");
      await loadDocuments(patientIdState);
    } catch (err: any) {
      setUploadStatus("error");
      setUploadMsg(`❌ ${err.message || "Upload failed"}`);
    }
    // reset input
    e.target.value = '';
  };

  // ── Sign out ────────────────────────────────────────────────────
  const handleSignOut = () => {
    clearToken();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Nav */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Living Diagnosis</h1>
            <p className="text-xs text-slate-500">Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 hidden sm:block">{email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Welcome */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900">
            Welcome back{email ? `, ${email.split('@')[0]}` : ''}
          </h2>
          <p className="text-slate-500 text-sm">Track your daily wellbeing and diagnostic history.</p>
        </div>

        {/* ── Patient Profile ── */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Patient Profile</CardTitle>
            <CardDescription>Your personal and diagnostic information.</CardDescription>
          </CardHeader>
          <CardContent>
            {patientLoading ? (
              <div className="text-slate-400 text-sm">Loading profile…</div>
            ) : patient ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block mb-1">Name</span>
                  <span className="font-medium text-slate-900">{patient.name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Date of Birth</span>
                  <span className="font-medium text-slate-900">{patient.dob || 'Not provided'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Primary Diagnosis</span>
                  <span className="font-medium text-slate-900">{patient.primary_diagnosis || 'Not provided'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Diagnosis Year</span>
                  <span className="font-medium text-slate-900">{patient.diagnosis_year || 'Not provided'}</span>
                </div>
                {patient.medications && patient.medications.length > 0 && (
                  <div className="col-span-2 md:col-span-4 mt-2">
                    <span className="text-slate-500 block mb-1">Medications</span>
                    <div className="flex flex-wrap gap-1">
                      {patient.medications.map((m: string, i: number) => (
                        <Badge key={i} variant="outline" className="bg-slate-50">{m}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleCreatePatient} className="space-y-4 max-w-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Full Name</label>
                    <Input value={pName} onChange={(e) => setPName(e.target.value)} required placeholder="Jane Doe" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Date of Birth</label>
                    <Input type="date" value={pDob} onChange={(e) => setPDob(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Primary Diagnosis</label>
                    <Input value={pDiag} onChange={(e) => setPDiag(e.target.value)} placeholder="e.g. Asperger's Syndrome" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Diagnosis Year</label>
                    <Input type="number" value={pYear} onChange={(e) => setPYear(e.target.value)} placeholder="e.g. 2011" min="1900" max="2026" />
                  </div>
                </div>
                {pError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{pError}</div>
                )}
                <Button type="submit" disabled={pLoading} className="bg-slate-900 text-white hover:bg-slate-700">
                  {pLoading ? 'Saving…' : 'Create Profile'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ── Daily Check-In Form ── */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Daily Check-In</CardTitle>
              <CardDescription>Log your mood and symptoms for today.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCheckinSubmit} className="space-y-5">
                {/* Mood slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="mood-slider" className="text-sm font-medium text-slate-700">
                      Mood Score
                    </label>
                    <span className="text-sm font-bold text-slate-900">
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
                    className="w-full accent-slate-900 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>1 — Very Low</span>
                    <span>10 — Excellent</span>
                  </div>
                </div>

                {/* Symptom notes */}
                <div className="space-y-1">
                  <label htmlFor="symptom-notes" className="text-sm font-medium text-slate-700">
                    Symptom Notes <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <Textarea
                    id="symptom-notes"
                    placeholder="Describe how you're feeling today…"
                    className="min-h-[100px]"
                    value={symptomNotes}
                    onChange={(e) => setSymptomNotes(e.target.value)}
                  />
                </div>

                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                    {submitError}
                  </div>
                )}
                {submitSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
                    ✓ Check-in saved for today!
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={submitLoading}
                  className="w-full bg-slate-900 text-white hover:bg-slate-700"
                >
                  {submitLoading ? 'Saving…' : 'Save Check-In'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* ── Documents Section ── */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>
                Upload prescriptions or clinical notes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {patientIdState ? (
                <div className="space-y-6">
                  {/* Upload area */}
                  <div className="flex flex-col items-start gap-2">
                    <Button 
                      variant="outline" 
                      className="relative overflow-hidden bg-slate-900 text-white hover:bg-slate-700 hover:text-white"
                      disabled={uploadStatus === 'uploading'}
                    >
                      <input 
                        type="file" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        accept=".pdf,.png,.jpg,.jpeg,.txt"
                        onChange={handleUpload}
                      />
                      {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload Prescription or Clinical Document'}
                    </Button>
                    <p className="text-xs text-slate-500">PDF, PNG, JPG, TXT — Max 10MB</p>
                    
                    {uploadStatus !== 'idle' && uploadStatus !== 'uploading' && (
                      <p className={`text-sm font-medium ${uploadStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {uploadMsg}
                      </p>
                    )}
                  </div>

                  {/* Document List */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Uploaded Files</h4>
                    {docsLoading ? (
                      <p className="text-sm text-slate-400">Loading documents...</p>
                    ) : documents.length === 0 ? (
                      <p className="text-sm text-slate-400">No documents uploaded yet</p>
                    ) : (
                      <div className="space-y-2">
                        {documents.map((doc, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 rounded-md bg-slate-50 border border-slate-100 text-sm">
                            <span className="text-lg">📄</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-900 truncate">{doc.filename || doc.original_name}</p>
                              <p className="text-xs text-slate-500">{new Date(doc.uploaded_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-md border border-slate-100">
                  Please create a patient profile above before uploading documents.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── My Check-Ins History ── */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Check-Ins</CardTitle>
                <CardDescription>Your mood and symptom history.</CardDescription>
                {checkins.length > 0 && (
                  <p className="text-sm text-slate-600 mt-2 font-medium">
                    Average mood (last {Math.min(checkins.length, 7)} entries): {(checkins.slice(0, 7).reduce((acc, c) => acc + c.mood_score, 0) / Math.min(checkins.length, 7)).toFixed(1)}/10
                  </p>
                )}
              </div>
              {checkins.length > 0 && (
                <Badge variant="secondary">{checkins.length} entries</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {checkinsLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
                Loading check-ins…
              </div>
            ) : checkinsError ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {checkinsError}
              </div>
            ) : checkins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-2 text-slate-400">
                <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-medium">No check-ins yet. Start tracking today to build your symptom timeline.</p>
                <p className="text-xs">Use the form above to log your first check-in.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {checkins.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-4 p-4 rounded-lg border border-slate-100 bg-white hover:border-slate-200 transition-colors"
                  >
                    {/* Mood badge */}
                    <div className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${getMoodColor(c.mood_score)}`}>
                      {c.mood_score}/10
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{c.date}</span>
                        <span className="text-xs text-slate-400">— {getMoodLabel(c.mood_score)}</span>
                      </div>
                      {c.symptom_notes && (
                        <p className="text-sm text-slate-600 truncate">{c.symptom_notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Diagnosis Freshness History ── */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Diagnosis Freshness History</CardTitle>
            <CardDescription>Your past analysis results and diagnostic trends.</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
                Loading history…
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-2 text-slate-400">
                <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-medium">No analysis history yet. Run an analysis on the main page to start tracking.</p>
              </div>
            ) : (
              <div>
                {/* Trend Chart */}
                {history.length >= 2 && (
                  <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Freshness Trend</div>
                    <div className="flex items-end gap-2 h-16 w-full">
                      {history.slice().reverse().map((entry, idx) => {
                        const h = Math.max(10, entry.freshness_score); // min 10% height
                        const color = entry.freshness_score >= 70 ? 'bg-green-400' : entry.freshness_score >= 40 ? 'bg-yellow-400' : 'bg-red-400';
                        return (
                          <div 
                            key={entry.id || idx}
                            className={`w-6 rounded-t-sm ${color} transition-all hover:opacity-80`}
                            style={{ height: `${h}%` }}
                            title={`${entry.date}: ${entry.freshness_score}/100`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* List */}
                <div className="space-y-3">
                  {history.map((h, idx) => {
                    const status = getScoreStatus(h.freshness_score);
                    return (
                      <div
                        key={h.id || idx}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-slate-100 bg-white hover:border-slate-200 transition-colors"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900">{h.diagnosis || 'Unknown Diagnosis'}</span>
                            <span className="text-xs text-slate-400">{h.date}</span>
                          </div>
                          <p className="text-sm text-slate-600">Score: {h.freshness_score}/100</p>
                        </div>
                        <div className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${status.color}`}>
                          {status.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analyze CTA */}
        <Card className="border-slate-200 shadow-sm bg-slate-900 text-white">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Run a Diagnostic Analysis</h3>
              <p className="text-slate-300 text-sm">
                Check if your diagnosis is still aligned with current clinical guidelines.
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0 border-slate-600 text-slate-900 bg-white hover:bg-slate-100"
              onClick={() => router.push('/')}
            >
              Analyze Notes →
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
