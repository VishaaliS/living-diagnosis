'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, setToken } from '@/lib/api';
import { ArrowRight, ShieldCheck, FileText, Bell } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await apiFetch<{ token: string; user_id: string; email: string }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }
      );
      setToken(data.user_id, data.email);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-2 sm:p-3 flex flex-col lg:flex-row gap-4 lg:gap-5 font-[family-name:var(--font-inter)]">
      {/* Left Column */}
      <div className="flex-[2] min-h-[28rem] lg:min-h-[calc(100vh-24px)] rounded-[24px] bg-gradient-to-br from-[#0878B9] to-[#29A9E8] overflow-hidden flex items-center justify-center p-5 sm:p-8 lg:p-10 relative">
        {/* Subtle blue overlay for depth */}
        <div className="absolute inset-0 bg-[#0878B9]/10 pointer-events-none mix-blend-overlay"></div>
        
        {/* White Form Card */}
        <div className="relative z-10 bg-white rounded-3xl p-6 sm:p-8 lg:p-10 shadow-[0_20px_50px_rgba(15,23,42,0.12)] w-full max-w-md">
          {/* Header Section */}
          <div className="mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0878B9] to-[#29A9E8] flex items-center justify-center text-white font-bold font-[family-name:var(--font-space-grotesk)] mb-4">
              L
            </div>
            <h1 className="font-[family-name:var(--font-space-grotesk)] font-bold text-xl text-[#0B0B0B]">
              Living Diagnosis
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Sign in to your account
            </p>
          </div>

          {/* Form Fields */}
          <form onSubmit={handleSubmit} className="space-y-5 mt-6">
            <div>
              <label htmlFor="email" className="block font-medium text-[#131313] text-sm">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="mt-2 w-full rounded-2xl border border-transparent bg-[#f5f5f7] px-4 py-3.5 text-[15px] text-[#131313] outline-none transition placeholder:text-slate-400 focus:border-[#0878B9] focus:bg-white focus:ring-2 focus:ring-[#0878B9]/20"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block font-medium text-[#131313] text-sm">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="mt-2 w-full rounded-2xl border border-transparent bg-[#f5f5f7] px-4 py-3.5 text-[15px] text-[#131313] outline-none transition placeholder:text-slate-400 focus:border-[#0878B9] focus:bg-white focus:ring-2 focus:ring-[#0878B9]/20"
                required
              />
              {error && (
                <p className="text-sm text-red-500 mt-1">
                  {error}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-8 w-full bg-[#D7FF3F] text-[#0B0B0B] font-bold text-sm uppercase tracking-wide rounded-full py-3.5 px-6 inline-flex items-center justify-between transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <span>{loading ? 'SIGNING IN...' : 'SIGN IN'}</span>
              <span className="rounded-full bg-[#0B0B0B] text-white w-8 h-8 flex items-center justify-center shrink-0">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          </form>

          {/* Register Link */}
          <div className="mt-6 text-center">
            <span className="text-sm text-slate-500">Don&apos;t have an account? </span>
            <Link href="/signup" className="text-sm font-medium text-[#0878B9] hover:underline">
              Create one
            </Link>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="hidden lg:flex flex-[1] flex-col justify-between bg-[#f2f2f2] rounded-[24px] p-6 sm:p-8 lg:p-10 xl:p-12">
        {/* Top Section */}
        <div>
          <h2 className="font-[family-name:var(--font-space-grotesk)] font-medium text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.12] tracking-tight text-[#131313]">
            Your Diagnosis Should Be as Current as You Are
          </h2>
          <p className="mt-4 text-base text-slate-500 leading-relaxed max-w-sm">
            Living Diagnosis checks whether your existing mental health diagnosis still reflects current clinical guidelines — and alerts you when it may be time to revisit it with a professional.
          </p>

          <div className="mt-8 space-y-4">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-[#EAF6FC] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-[#0878B9]" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-semibold text-[#131313]">Safety First</p>
                <p className="text-sm text-slate-500">Crisis detection runs before any AI — always</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-[#EAF6FC] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-[#0878B9]" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-semibold text-[#131313]">Guideline Aware</p>
                <p className="text-sm text-slate-500">Checks DSM-5 and ICD-11 changes automatically</p>
              </div>
            </div>

            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-[#EAF6FC] flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-[#0878B9]" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-semibold text-[#131313]">Patient Owned</p>
                <p className="text-sm text-slate-500">Your data stays private and portable</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-auto pt-8 border-t border-slate-200">
          <p className="text-xs text-slate-400 leading-relaxed">
            Living Diagnosis is not a diagnostic tool and does not replace a licensed mental health professional. Always consult a qualified clinician for medical decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
