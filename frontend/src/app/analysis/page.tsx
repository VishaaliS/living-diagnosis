'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Info, CheckCircle2, ShieldAlert, Upload, ChevronRight } from 'lucide-react';
import { apiFetch, getToken, clearToken, getPatientId, getEmail } from '@/lib/api';
import DiagnosisTimeline from '@/components/DiagnosisTimeline';
import ChatWidget from '@/components/ChatWidget';
import Navbar from '@/components/ui/navbar';

// Fallback map: guideline entry_id → the year that change was published.
const CHANGE_YEAR_MAP: Record<string, number> = {
  'DSM5-001': 2013,
  'DSM5-002': 2013,
  'DSM5-003': 2013,
  'ICD11-001': 2022,
};

function resolveChangeYear(
  guidelineMatch: { change_year?: number; entry_id?: string } | null
): number {
  if (!guidelineMatch) return 2013;
  if (guidelineMatch.change_year) return guidelineMatch.change_year;
  if (guidelineMatch.entry_id && CHANGE_YEAR_MAP[guidelineMatch.entry_id]) {
    return CHANGE_YEAR_MAP[guidelineMatch.entry_id];
  }
  return 2013;
}

export default function LivingDiagnosisDashboard() {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [animatedScore, setAnimatedScore] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    setIsLoggedIn(!!getToken());
    const email = getEmail();
    if (email) setUserEmail(email);
  }, []);

  useEffect(() => {
    if (result && result.freshness_score !== undefined) {
      let start = 0;
      const end = result.freshness_score;
      const duration = 1500;
      const stepTime = Math.max(10, Math.floor(duration / (end || 1)));
      
      if (end === 0) {
        setAnimatedScore(0);
        return;
      }
      
      const timer = setInterval(() => {
        start += 1;
        setAnimatedScore(start);
        if (start >= end) {
          clearInterval(timer);
        }
      }, stepTime);
      return () => clearInterval(timer);
    }
  }, [result?.freshness_score]);

  const handleAnalyze = async () => {
    if (!notes.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setAnimatedScore(0);

    try {
      const data = await apiFetch<any>("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ patient_notes: notes }),
      });
      setResult(data);

      const token = getToken();
      if (token && data && data.extracted && data.extracted.diagnosis) {
        apiFetch("/analysis/history", {
          method: "POST",
          body: JSON.stringify({
            user_id: token,
            patient_id: getPatientId() || undefined,
            diagnosis: data.extracted.diagnosis,
            freshness_score: data.freshness_score,
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setLoading(true);
      setError("");
      setResult(null);
      setAnimatedScore(0);

      try {
        const formData = new FormData();
        formData.append("file", file);
        
        const res = await fetch("http://localhost:8000/api/analyze-file", {
          method: "POST",
          body: formData,
        });
        
        if (!res.ok) {
          const text = await res.text();
          let msg = text;
          try {
            msg = JSON.parse(text).detail || text;
          } catch (e) {}
          throw new Error(msg);
        }
        
        const data = await res.json();
        setResult(data);
      } catch (err: any) {
        setError(err.message || "Failed to analyze document.");
      } finally {
        setLoading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBadgeText = (score: number) => {
    if (score >= 70) return 'Current';
    if (score >= 40) return 'Review Recommended';
    return 'Potentially Stale';
  };

  return (
    <div className="text-slate-800 antialiased min-h-screen pb-20 bg-[#F8FAFC]">
      <Navbar />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Disclaimer Banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start text-blue-800">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-500" />
            <p className="text-sm leading-relaxed">
              Not a diagnostic tool. Not a replacement for a doctor. This tool analyzes clinical notes for potential guideline drift.
            </p>
          </div>

          {/* Crisis State Full Width Alert */}
          {result && result.crisis_triggered && (
             <div className="bg-red-50 border-2 border-red-600 rounded-2xl shadow-md p-8 flex flex-col items-center text-center space-y-6">
               <ShieldAlert className="w-16 h-16 text-red-600" />
               <h2 className="text-2xl font-bold text-red-900">Safety Alert Triggered</h2>
               <p className="text-lg text-red-800 max-w-2xl font-medium">
                 {result.crisis_message}
               </p>
               <span className="mt-4 px-4 py-1 text-sm uppercase tracking-wider bg-red-600 text-white rounded-full font-bold">
                 Emergency Brake Engaged — AI Processing Bypassed
               </span>
             </div>
          )}

          {/* Input Section */}
          <section className="bg-white rounded-2xl shadow-blueSoft border border-borderBlue p-6 sm:p-8 flex flex-col">
            <h2 className="font-heading font-bold text-2xl mb-1 text-dark">Clinical Notes</h2>
            <p className="text-slate-500 text-sm mb-6">Paste patient history or upload a document below.</p>

            <div className="relative mb-4">
              <textarea 
                className="w-full h-48 p-4 rounded-xl border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary text-slate-700 leading-relaxed resize-none bg-slate-50 font-body analysis-textarea"
                placeholder="Enter clinical notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div 
              className="border-2 border-dashed border-cyan rounded-xl p-8 text-center bg-gradient-to-b from-[#F4FBFF] to-[#E7F7FE] mb-6 flex flex-col items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-cyan mb-3" />
              <span className="text-sm font-medium text-slate-700">
                {fileName ? fileName : "Drag & drop files here"}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                {fileName ? "Click to change file" : "or click to browse (PDF, DOCX)"}
              </span>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept=".txt,.md,.pdf,.docx"
              />
            </div>

            <div className="flex justify-end">
              <button 
                type="button"
                onClick={handleAnalyze} 
                disabled={loading || !notes.trim()}
                className="bg-lime text-dark font-bold py-3 px-8 rounded-full hover:bg-[#c9f232] transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-lime disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Analyzing..." : "Analyze Notes"}
              </button>
            </div>
            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md border border-red-200 text-sm">
                Error: {error}
              </div>
            )}
          </section>

          {/* Patient Explanation Section */}
          {result && !result.crisis_triggered && (
            <section className="bg-dark rounded-2xl shadow-blueSoft p-6 sm:p-8 text-white">
              <h3 className="font-heading font-bold text-xl mb-4">Patient Explanation</h3>
              <p className="text-slate-300 text-sm leading-relaxed mb-6 whitespace-pre-wrap">
                {result.explanation}
              </p>
              
              <details className="text-sm text-slate-400 cursor-pointer group">
                <summary className="font-medium outline-none flex items-center gap-2 hover:text-white transition-colors">
                  <ChevronRight className="w-4 h-4 transform group-open:rotate-90 transition-transform" />
                  How was this calculated?
                </summary>
                <div className="mt-4 p-4 bg-slate-800 rounded-xl text-slate-300 text-sm space-y-2 font-mono">
                  <div>Base Score: {result.score_breakdown?.starting_score ?? 100}</div>
                  <div>Guideline Change: {Math.abs(result.score_breakdown?.guideline_penalty || 0)} points</div>
                  <div>Semantic Drift: {Math.abs(result.score_breakdown?.drift_penalty || 0)} points</div>
                  <div>Time Passed: {Math.abs(result.score_breakdown?.time_penalty || 0)} points</div>
                  <div>Years Since Diagnosis: {result.score_breakdown?.years_since_diagnosis || 0}</div>
                  <div className="pt-2 border-t border-slate-700 font-bold text-white mt-2">Final Score: {result.freshness_score}</div>
                </div>
              </details>
            </section>
          )}

        </div>

        {/* Right Column (Results) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {loading && (
            <div className="space-y-6">
              <div className="bg-slate-200 animate-pulse rounded-2xl h-64 w-full"></div>
              <div className="bg-slate-200 animate-pulse rounded-2xl h-48 w-full"></div>
              <div className="bg-slate-200 animate-pulse rounded-2xl h-48 w-full"></div>
            </div>
          )}

          {result && !result.crisis_triggered && !loading && (
            <>
              {/* Freshness Score Card */}
              <section className="bg-white rounded-2xl shadow-blueSoft border border-borderBlue p-8 flex flex-col items-center justify-center text-center">
                <h3 className="font-heading font-bold text-xl text-dark mb-8 w-full text-left">Freshness Score</h3>
                <div className="relative w-40 h-40 flex items-center justify-center mb-6">
                  <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" fill="none" r="45" stroke="#F3F4F6" strokeWidth="8" />
                    <defs>
                      <linearGradient id="scoreGradient" x1="0%" x2="100%" y1="0%" y2="0%">
                        <stop offset="0%" stopColor="#0878B9" />
                        <stop offset="100%" stopColor="#29A9E8" />
                      </linearGradient>
                    </defs>
                    <circle 
                      className="transition-all duration-1000 ease-out" 
                      cx="50" 
                      cy="50" 
                      fill="none" 
                      r="45" 
                      stroke="url(#scoreGradient)" 
                      strokeDasharray="283" 
                      strokeDashoffset={283 - (283 * (result.freshness_score || 0) / 100)} 
                      strokeWidth="8" 
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="relative z-10 flex flex-col items-center">
                    <span className={`text-5xl font-heading font-bold ${getScoreColorClass(result.freshness_score || 0)}`}>
                      {animatedScore}
                    </span>
                  </div>
                </div>
                <div className="mt-2">
                  <span className="inline-block px-3 py-1 bg-blue-50 text-primary rounded-full text-sm font-medium mb-3">
                    {getScoreBadgeText(result.freshness_score || 0)}
                  </span>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Higher score indicates closer alignment with current diagnostic criteria.
                  </p>
                </div>
              </section>

              {/* Extracted Data Card */}
              <section className="bg-white rounded-2xl shadow-blueSoft border border-borderBlue p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-heading font-bold text-lg text-dark">Extracted Clinical Data</h3>
                  {result.extracted?.confidence && (
                    <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded">
                      AI Confidence: {Math.round(result.extracted.confidence * 100)}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <span className="block text-xs text-slate-500 mb-1 uppercase tracking-wide">Diagnosis</span>
                    <strong className="text-sm text-slate-800">{result.extracted?.diagnosis || "Not found"}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500 mb-1 uppercase tracking-wide">Framework / Date</span>
                    <strong className="text-sm text-slate-800">
                      {result.extracted?.framework || "Unknown"} • {result.extracted?.diagnosis_year || result.extracted?.diagnosis_date || "Unknown"}
                    </strong>
                  </div>
                </div>
                
                {result.extracted?.symptoms && result.extracted.symptoms.length > 0 && (
                  <div className="mb-4">
                    <span className="block text-xs text-slate-500 mb-2 uppercase tracking-wide">Reported Symptoms</span>
                    <div className="flex flex-wrap gap-2">
                      {result.extracted.symptoms.map((s: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-soft text-primary rounded-full text-xs border border-borderBlue">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.extracted?.medications && result.extracted.medications.length > 0 && (
                  <div>
                    <span className="block text-xs text-slate-500 mb-2 uppercase tracking-wide">Medications</span>
                    <div className="flex flex-wrap gap-2">
                      {result.extracted.medications.map((m: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-soft text-primary rounded-full text-xs border border-borderBlue">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Guideline Match Card */}
              {result.guideline_match?.matched === true ? (
                <section className="bg-white rounded-2xl shadow-blueSoft border border-borderBlue p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-primary">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <h3 className="font-heading font-bold text-lg text-dark">Guideline Match Found</h3>
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="px-2 py-1 bg-blue-100 text-primary text-xs font-bold rounded uppercase tracking-wider">
                      {result.guideline_match.change_type || result.guideline_match.severity || "UPDATE"}
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      Updates available for this condition
                    </span>
                  </div>
                  <div className="bg-slate-50 border-l-4 border-primary p-4 rounded-r-lg mb-4 text-sm text-slate-700 leading-relaxed">
                    {result.guideline_match.description || result.guideline_match.change_summary || (
                      <>
                        <span className="line-through text-slate-500 mr-2">{result.guideline_match.old_label}</span>
                        → 
                        <strong className="ml-2">{result.guideline_match.new_label}</strong>
                      </>
                    )}
                  </div>
                  {result.guideline_match.source_citation && (
                    <div className="flex items-start gap-2 text-xs text-slate-500">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p>Source: {result.guideline_match.source_citation || result.guideline_match.citation}</p>
                    </div>
                  )}
                </section>
              ) : result.guideline_match?.matched === false ? (
                <section className="bg-white rounded-2xl shadow-blueSoft border border-green-200 p-6 flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <p className="text-sm font-medium text-green-800">
                    No major guideline changes found for this diagnosis
                  </p>
                </section>
              ) : null}

              {/* Timeline Card Wrapper */}
              {result.guideline_match?.matched === true && result.extracted?.diagnosis_year && (
                <div className="bg-white rounded-2xl shadow-blueSoft border border-borderBlue p-6">
                  <h3 className="font-heading font-bold text-lg text-dark mb-4">Timeline</h3>
                  <DiagnosisTimeline
                    diagnosisYear={result.extracted.diagnosis_year}
                    diagnosisLabel={result.extracted.diagnosis ?? 'Unknown Diagnosis'}
                    changeYear={resolveChangeYear(result.guideline_match)}
                    changeLabel={result.guideline_match.description ?? result.guideline_match.change_summary ?? result.guideline_match.new_label ?? 'Guideline updated'}
                    currentYear={new Date().getFullYear()}
                  />
                </div>
              )}

            </>
          )}

        </div>
      </main>

      {/* Floating Chat Widget */}
      <ChatWidget analysisContext={result} page="analysis" />
    </div>
  );
}
