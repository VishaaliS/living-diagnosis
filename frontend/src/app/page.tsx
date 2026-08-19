'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Info, CheckCircle2, ShieldAlert } from 'lucide-react';
import { apiFetch, getToken, clearToken, getPatientId } from '@/lib/api';
import DiagnosisTimeline from '@/components/DiagnosisTimeline';

// Fallback map: guideline entry_id → the year that change was published.
// Used when the backend doesn't return change_year on the match object.
const CHANGE_YEAR_MAP: Record<string, number> = {
  'DSM5-001': 2013, // Asperger's → ASD, DSM-5 released May 2013
  'DSM5-002': 2013, // Hypochondriasis → Illness Anxiety Disorder
  'DSM5-003': 2013, // ADD → ADHD unified
  'ICD11-001': 2022, // ICD-11 came into effect
};

function resolveChangeYear(
  guidelineMatch: { change_year?: number; entry_id?: string } | null
): number {
  if (!guidelineMatch) return 2013;
  if (guidelineMatch.change_year) return guidelineMatch.change_year;
  if (guidelineMatch.entry_id && CHANGE_YEAR_MAP[guidelineMatch.entry_id]) {
    return CHANGE_YEAR_MAP[guidelineMatch.entry_id];
  }
  return 2013; // safe default: DSM-5 era
}

const DEMO_TEXTS = {
  aspergers: "Patient notes, June 2011. Diagnosed with Asperger's Disorder per DSM-IV-TR criteria. Patient shows difficulty in social communication, intensely focused interest in train schedules, no significant early language delay noted. Recommend annual follow-up. No re-evaluation has occurred since this diagnosis.",
  hypochondriasis: "Patient notes, March 2010: Diagnosed with Hypochondriasis per DSM-IV-TR, presenting with persistent fear of serious illness despite repeated medical reassurance. Follow-up notes, 2024: patient reports minimal physical symptoms currently, but continues extensive health-related anxiety, frequent symptom-checking behavior, and reassurance-seeking, with little focus on actual bodily complaints.",
  bipolar: "Patient notes, 2015: Diagnosed with Bipolar I Disorder, Mixed Episode, per DSM-IV criteria, presenting with concurrent manic and depressive symptoms. Therapy notes, 2024: patient reports predominantly depressive symptoms over the past three years, with only brief 2-3 day periods of mild elevated mood; no full manic episode recorded since 2016.",
  crisis: "Patient journal entry: I don't see the point anymore. I've been thinking about ending my life and I already have a plan. I don't know who to talk to about this."
};

export default function LivingDiagnosisDashboard() {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!getToken());
  }, []);

  const handleAnalyze = async () => {
    if (!notes.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await apiFetch<any>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ patient_notes: notes }),
      });
      setResult(data);

      // Silently auto-save history if logged in
      const token = getToken();
      if (token && data && data.extracted && data.extracted.diagnosis) {
        apiFetch("/analysis/history", {
          method: "POST",
          body: JSON.stringify({
            user_id: token,
            patient_id: getPatientId() || undefined,
            diagnosis: data.extracted.diagnosis,
            freshness_score: data.score,
            guideline_matched: data.guideline_match?.matched || false
          })
        }).catch(err => console.error("Silently failed to save analysis history:", err));
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (color: string) => {
    switch (color) {
      case 'green': return '#22c55e'; // Tailwind green-500
      case 'yellow': return '#eab308'; // Tailwind yellow-500
      case 'red': return '#ef4444'; // Tailwind red-500
      default: return '#3b82f6';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Section */}
        <header className="space-y-4 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900">Living Diagnosis</h1>
              <p className="text-lg text-slate-500 mt-1">A diagnosis is a hypothesis. We keep it honest.</p>
            </div>
            <div className="flex items-center gap-2">
              {isLoggedIn ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/dashboard')}
                  >
                    Go to Dashboard
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { clearToken(); setIsLoggedIn(false); }}
                  >
                    Sign Out
                  </Button>
                </>
              ) : (
                <Link href="/login">
                  <Button variant="outline" size="sm">Sign In</Button>
                </Link>
              )}
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm font-medium">
              Not a diagnostic tool. Not a replacement for a doctor. This tool analyzes clinical notes for potential guideline drift.
            </p>
          </div>
        </header>

        {/* Main Input Section */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Clinical Notes</CardTitle>
            <CardDescription>Paste patient history or select a sample case below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setNotes(DEMO_TEXTS.aspergers)}>
                Asperger's (2011)
              </Button>
              <Button variant="outline" size="sm" onClick={() => setNotes(DEMO_TEXTS.hypochondriasis)}>
                Hypochondriasis Split
              </Button>
              <Button variant="outline" size="sm" onClick={() => setNotes(DEMO_TEXTS.bipolar)}>
                Bipolar Symptom Drift
              </Button>
              <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => setNotes(DEMO_TEXTS.crisis)}>
                Crisis Safety Test
              </Button>
            </div>
            
            <Textarea 
              placeholder="Enter patient notes here..." 
              className="min-h-[200px] text-base"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            
            <div className="flex justify-end">
              <Button onClick={handleAnalyze} disabled={loading || !notes.trim()} className="w-full md:w-auto bg-slate-900 text-white">
                {loading ? "Analyzing..." : "Analyze Notes"}
              </Button>
            </div>
            
            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-200 text-sm">
                Error: {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        {result && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {result.crisis_triggered ? (
              /* Crisis Triggered Path - High Contrast Red Alert */
              <Card className="border-red-600 border-2 bg-red-50 shadow-md">
                <CardContent className="p-8 flex flex-col items-center text-center space-y-6">
                  <ShieldAlert className="w-16 h-16 text-red-600" />
                  <h2 className="text-2xl font-bold text-red-900">Safety Alert Triggered</h2>
                  <p className="text-lg text-red-800 max-w-2xl font-medium">
                    {result.crisis_message}
                  </p>
                  <Badge variant="destructive" className="mt-4 px-4 py-1 text-sm uppercase tracking-wider">
                    Emergency Brake Engaged — AI Processing Bypassed
                  </Badge>
                </CardContent>
              </Card>
            ) : (
              /* Normal Results Path */
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Score Dial */}
                <Card className="md:col-span-1 flex flex-col items-center justify-center p-6 border-slate-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-700 mb-6">Freshness Score</h3>
                  <div className="w-40 h-40">
                    <CircularProgressbar 
                      value={result.freshness_score || 0} 
                      text={`${result.freshness_score || 0}`}
                      styles={buildStyles({
                        pathColor: getScoreColor(result.score_color),
                        textColor: getScoreColor(result.score_color),
                        trailColor: '#e2e8f0',
                      })}
                    />
                  </div>
                  <p className="text-sm text-slate-500 mt-6 text-center">
                    Higher score indicates closer alignment with current diagnostic criteria.
                  </p>
                </Card>

                <div className="md:col-span-2 space-y-6">
                  {/* Extracted Info */}
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex justify-between items-center">
                        Extracted Clinical Data
                        {result.extracted?.confidence && (
                          <Badge variant="secondary">
                            AI Confidence: {Math.round(result.extracted.confidence * 100)}%
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-slate-500 block mb-1">Diagnosis</span>
                          <span className="font-medium text-slate-900">{result.extracted?.diagnosis || "Not found"}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block mb-1">Framework / Date</span>
                          <span className="font-medium text-slate-900">
                            {result.extracted?.framework || "Unknown"} • {result.extracted?.diagnosis_date || "Unknown date"}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-500 block mb-1">Reported Symptoms</span>
                          <div className="flex flex-wrap gap-1">
                            {result.extracted?.symptoms?.map((s: string, i: number) => (
                              <Badge key={i} variant="outline" className="bg-slate-50">{s}</Badge>
                            )) || "None extracted"}
                          </div>
                        </div>
                        {result.extracted?.medications && result.extracted.medications.length > 0 && (
                          <div className="col-span-2">
                            <span className="text-slate-500 block mb-1">Medications</span>
                            <div className="flex flex-wrap gap-1">
                              {result.extracted.medications.map((m: string, i: number) => (
                                <Badge key={i} variant="outline" className="bg-slate-50">{m}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Guideline Match */}
                  {result.guideline_match && result.guideline_match.matched === true ? (
                    <Card className="border-blue-200 bg-blue-50/50 shadow-sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2 text-blue-900">
                          <CheckCircle2 className="w-5 h-5 text-blue-600" />
                          Guideline Match Found
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-none">
                            {result.guideline_match.change_type?.toUpperCase()}
                          </Badge>
                          <span className="text-sm font-medium text-slate-700">
                            Updates available for this condition
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 bg-white p-3 rounded border border-blue-100">
                          {result.guideline_match.change_summary}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          Source: {result.guideline_match.source_citation}
                        </p>
                      </CardContent>
                    </Card>
                  ) : result.guideline_match && result.guideline_match.matched === false ? (
                    <Card className="border-green-200 bg-green-50/50 shadow-sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2 text-green-900">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          Guideline Match
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm font-medium text-green-800 flex items-center gap-2">
                          ✓ No major guideline changes found for this diagnosis
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}

                  {/* ── Diagnosis Timeline — only when guideline matched ── */}
                  {result.guideline_match?.matched === true &&
                    result.extracted?.diagnosis_year && (
                    <DiagnosisTimeline
                      diagnosisYear={result.extracted.diagnosis_year}
                      diagnosisLabel={
                        result.extracted.diagnosis ?? 'Unknown Diagnosis'
                      }
                      changeYear={resolveChangeYear(result.guideline_match)}
                      changeLabel={
                        result.guideline_match.change_summary ??
                        result.guideline_match.new_label ??
                        'Guideline updated'
                      }
                      currentYear={2026}
                    />
                  )}

                  {/* Explanation */}
                  <Card className="border-slate-200 shadow-sm bg-slate-900 text-white">
                    <CardHeader>
                      <CardTitle className="text-lg">Patient Explanation</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                        {result.explanation}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Debug / Breakdown */}
                  <details className="text-sm text-slate-500 group">
                    <summary className="cursor-pointer hover:text-slate-700 font-medium list-none flex items-center gap-2">
                      <span className="group-open:rotate-90 transition-transform">▶</span>
                      How was this calculated?
                    </summary>
                    <div className="mt-3 p-4 bg-slate-100 rounded-md space-y-2 font-mono text-xs text-slate-600">
                      <div>Base Score: {result.score_breakdown?.starting_score ?? 100}</div>
                      <div>Guideline Change: {Math.abs(result.score_breakdown?.guideline_penalty || 0)} points</div>
                      <div>Semantic Drift: {Math.abs(result.score_breakdown?.drift_penalty || 0)} points</div>
                      <div>Time Passed: {Math.abs(result.score_breakdown?.time_penalty || 0)} points</div>
                      <div>Years Since Diagnosis: {result.score_breakdown?.years_since_diagnosis || 0}</div>
                      <div className="pt-2 border-t border-slate-200 font-bold">Final Score: {result.freshness_score}</div>
                    </div>
                  </details>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
