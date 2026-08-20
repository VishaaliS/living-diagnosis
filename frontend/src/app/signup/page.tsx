'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, setToken } from '@/lib/api';
import Navbar from '@/components/ui/navbar';

export default function SignupPage() {
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
      // 1. Register the user
      await apiFetch(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }
      );

      // 2. Automatically log them in to get the token
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
      setError(err instanceof Error ? err.message : 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col bg-white pt-24">
        <Navbar disabled />
        <section className="section-wrap p-2 sm:p-3 mx-auto w-full max-w-[90rem]">
            <div>
                <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
                    <article
                        className="relative min-h-[24rem] flex-[2] overflow-hidden rounded-3xl sm:min-h-[28rem] lg:min-h-[32rem]">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 to-sky-400"></div>
                        <div className="absolute inset-0 bg-sky-500/10" aria-hidden="true"></div>
                        <div className="relative z-10 flex h-full items-center justify-center p-5 sm:p-8 lg:p-10">
                            <form onSubmit={handleSubmit}
                                className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:p-8 lg:p-10">
                                <div className="space-y-5">
                                    <div><label htmlFor="email" className="font-medium text-[#131313] text-sm">Email
                                            address</label><input id="email" type="email"
                                            placeholder="Your email address" autoComplete="email"
                                            className="mt-2 w-full rounded-2xl border border-transparent bg-[#f5f5f7] px-4 py-3.5 text-[15px] text-[#131313] outline-none transition placeholder:text-muted-foreground focus:border-gray-300 focus:bg-white"
                                            required name="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                                    <div><label htmlFor="password" className="font-medium text-[#131313] text-sm">Password</label><input id="password" type="password" placeholder="Your password"
                                            autoComplete="new-password"
                                            className="mt-2 w-full rounded-2xl border border-transparent bg-[#f5f5f7] px-4 py-3.5 text-[15px] text-[#131313] outline-none transition placeholder:text-muted-foreground focus:border-gray-300 focus:bg-white"
                                            required name="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                </div><button type="submit" disabled={loading}
                                    className="btn-accent-dark relative z-0 inline-flex w-fit items-center gap-2.5 py-1 pr-1 disabled:cursor-not-allowed disabled:opacity-60 mt-8 pl-5 sm:pl-6 bg-[#131313] text-white rounded-full transition hover:opacity-90"
                                    tabIndex={0}><span className="font-bold text-sm tracking-wide">{loading ? 'SIGNING UP...' : 'SIGN UP'}</span><span
                                        className="flex shrink-0 items-center justify-center rounded-full bg-[#D7FF3F] text-[#141210] size-9 sm:size-10 ml-2"><svg
                                            viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                                            <path d="M4 12L12 4M12 4H6M12 4v6" fill="none" stroke="currentColor"
                                                strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                            </path>
                                        </svg></span></button>
                                <p className="mt-6 text-center text-sm text-gray-500">
                                    Already have an account?{' '}
                                    <Link href="/login" className="font-medium text-[#131313] hover:underline">
                                        Sign In
                                    </Link>
                                </p>
                            </form>
                        </div>
                    </article>
                    <article
                        className="flex flex-1 flex-col justify-between rounded-3xl bg-[#f2f2f2] p-6 sm:p-8 lg:min-h-[32rem] lg:p-10 xl:p-12">
                        <div>
                            <div className="relative w-full">
                                <h2 className="text-left text-[clamp(2rem,4vw,3rem)] font-medium leading-[1.12] tracking-tight text-[#131313] lg:text-[48px]">Join Living Diagnosis</h2>
                            </div>
                            <p className="mt-4 max-w-md text-base leading-relaxed text-gray-500 sm:text-[17px]">Create your account to start managing your health records, viewing AI-driven insights, and tracking your wellness journey securely.</p>
                        </div>
                        <div className="mt-10 lg:mt-12">
                            <p className="text-sm text-gray-500">Follow Us:</p>
                            <div className="mt-4 flex flex-wrap gap-3"><a href="https://www.instagram.com/yashtex"
                                    aria-label="Instagram"
                                    className="flex size-11 items-center justify-center rounded-full bg-[#141210] text-white transition hover:brightness-110"><svg
                                        viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                                        <rect x="3" y="3" width="14" height="14" rx="4" fill="none"
                                            stroke="currentColor" strokeWidth="1.5"></rect>
                                        <circle cx="10" cy="10" r="3.25" fill="none" stroke="currentColor"
                                            strokeWidth="1.5"></circle>
                                        <circle cx="14.2" cy="5.8" r="0.9" fill="currentColor"></circle>
                                    </svg></a></div>
                        </div>
                    </article>
                </div>
            </div>
        </section>

        <div className="p-2 sm:p-3 mx-auto w-full max-w-[90rem]">
            <footer className="w-full">
                <div className="w-full rounded-3xl bg-[#0a0a0a] px-5 py-10 text-white sm:px-12 sm:py-14 lg:px-14 lg:py-16">
                    <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
                        <div className="max-w-md"><Link href="/" className="inline-flex items-center">
                                <span className="text-xl font-bold text-white tracking-tight">Living Diagnosis</span>
                            </Link>
                            <p className="mt-5 text-[15px] leading-relaxed text-white/70">Easily adapt to changes and scale
                                your operations with our flexible infrastructure, designed to support your business
                                growth.</p>
                        </div>

                    </div>
                    <div className="mt-14 border-t border-white/10 pt-10 lg:mt-16 lg:pt-12">
                        <p className="text-[15px] font-medium text-white">Subscribe our newsletter</p>
                        <form className="relative mt-4 max-w-lg"><label htmlFor="footer-email" className="sr-only">Email
                                address</label><input id="footer-email" type="email" placeholder="Enter your email"
                                className="h-14 w-full rounded-full border border-white/10 bg-white/10 py-3 pl-6 pr-36 text-[15px] text-white placeholder:text-white/45 outline-none transition focus:border-white/25 focus:bg-white/[0.14]" /><button
                                type="submit"
                                className="btn-accent absolute right-1.5 top-1.5 bottom-1.5 inline-flex items-center gap-2.5 py-0 pl-5 pr-1 bg-white text-black rounded-full"
                                tabIndex={0}><span className="font-bold text-sm tracking-wide">SUBMIT</span><span
                                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-black text-white ml-2"><svg
                                        viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                                        <path d="M4 12L12 4M12 4H6M12 4v6" fill="none" stroke="currentColor"
                                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"></path>
                                    </svg></span></button></form>
                        <p className="mt-8 text-sm text-white/45">© 2026. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    </main>
  );
}
