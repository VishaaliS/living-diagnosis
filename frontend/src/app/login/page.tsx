'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, setToken } from '@/lib/api';

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
    <main className="flex flex-col bg-white min-h-screen">
      <section className="section-wrap pt-12 sm:pt-16 lg:pt-20 p-2 sm:p-3 mx-auto w-full max-w-[90rem]">
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
          {/* Left Column */}
          <article className="relative min-h-[24rem] flex-[2] overflow-hidden rounded-3xl sm:min-h-[28rem] lg:min-h-[32rem]">
            {/* Background image (using the provided src attributes) */}
            <img 
              alt="" 
              decoding="async" 
              className="scale-105 object-cover object-center absolute h-full w-full left-0 top-0 right-0 bottom-0 text-transparent"
              sizes="(max-width: 1024px) 100vw, 50vw"
              srcSet="images/image_1.webp 384w, images/image_2.webp 640w, images/image_5.webp 750w, images/image_4.webp 828w, images/image_3.webp 1080w, images/image_6.webp 1200w, images/image_7.webp 1920w, images/image_8.webp 2048w, images/image.webp 3840w"
              src="images/image.webp" 
            />
            {/* Overlay */}
            <div className="absolute inset-0 bg-sky-500/10" aria-hidden="true"></div>
            
            {/* Form Container */}
            <div className="relative z-10 flex h-full items-center justify-center p-5 sm:p-8 lg:p-10">
              <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:p-8 lg:p-10">
                <div className="space-y-5">
                  <div>
                    <label htmlFor="email" className="font-medium text-[#131313] text-sm">
                      Email address
                    </label>
                    <input 
                      id="email" 
                      type="email" 
                      placeholder="Your email address" 
                      autoComplete="email"
                      className="mt-2 w-full rounded-2xl border border-transparent bg-[#f5f5f7] px-4 py-3.5 text-[15px] text-[#131313] outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white"
                      required 
                      name="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="font-medium text-[#131313] text-sm">
                      Password
                    </label>
                    <input 
                      id="password" 
                      type="password" 
                      placeholder="Your password" 
                      autoComplete="current-password"
                      className="mt-2 w-full rounded-2xl border border-transparent bg-[#f5f5f7] px-4 py-3.5 text-[15px] text-[#131313] outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:bg-white"
                      required 
                      name="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  {error && <p className="text-red-500 text-sm">{error}</p>}
                </div>
                
                {/* Submit Button */}
                <button 
                  type="submit"
                  disabled={loading}
                  className="relative z-0 inline-flex w-fit items-center gap-2.5 py-1 pr-1 disabled:cursor-not-allowed disabled:opacity-60 mt-8 pl-5 sm:pl-6 bg-[#131313] text-white rounded-full transition hover:opacity-90"
                  tabIndex={0}
                >
                  <span className="font-semibold text-sm tracking-wide">
                    {loading ? 'SIGNING IN...' : 'SIGN IN'}
                  </span>
                  <span className="flex shrink-0 items-center justify-center rounded-full bg-[#D7FF3F] text-[#141210] size-9 sm:size-10 ml-2">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M4 12L12 4M12 4H6M12 4v6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"></path>
                    </svg>
                  </span>
                </button>

                <div className="mt-6 pt-6 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    Don&apos;t have an account?{' '}
                    <Link href="/signup" className="font-medium text-[#131313] hover:underline">
                      Create one
                    </Link>
                  </p>
                </div>
              </form>
            </div>
          </article>
          
          {/* Right Column */}
          <article className="flex flex-1 flex-col justify-between rounded-3xl bg-[#f2f2f2] p-6 sm:p-8 lg:min-h-[32rem] lg:p-10 xl:p-12">
            <div>
              <div className="relative w-full">
                <h2 className="text-left text-[clamp(2rem,4vw,3rem)] font-medium leading-[1.12] tracking-tight text-[#131313] lg:text-[48px]">
                  Let's Build Smarter Business Workflows Together
                </h2>
              </div>
              <p className="mt-4 max-w-md text-base leading-relaxed text-gray-500 sm:text-[17px]">
                Tell us what slows your business down, and our team will recommend the best automation solution for your requirements.
              </p>
              <dl className="mt-10 space-y-6 sm:mt-12">
                <div>
                  <dt className="text-sm text-gray-500">Email</dt>
                  <dd className="mt-1.5">
                    <a href="mailto:contact@otoma8.com" className="text-lg font-medium tracking-tight text-[#131313] transition hover:text-[#131313]/70 sm:text-xl">
                      contact@otoma8.com
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
            <div className="mt-10 lg:mt-12">
              <p className="text-sm text-gray-500">Follow Us:</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a href="https://www.instagram.com/otoma8.labs/" aria-label="Instagram" className="flex size-11 items-center justify-center rounded-full bg-[#141210] text-white transition hover:brightness-110">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                    <rect x="3" y="3" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5"></rect>
                    <circle cx="10" cy="10" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5"></circle>
                    <circle cx="14.2" cy="5.8" r="0.9" fill="currentColor"></circle>
                  </svg>
                </a>
                <a href="https://www.linkedin.com/company/otoma8-labs/" aria-label="LinkedIn" className="flex size-11 items-center justify-center rounded-full bg-[#141210] text-white transition hover:brightness-110">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                    <path d="M5 8v8H2.5V8H5Zm-1.25-4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM8 8h2.4v1.1h.1c.3-.6 1.1-1.2 2.3-1.2 2.5 0 3 1.6 3 3.9V16h-2.5v-3.6c0-.9-.02-2-1.2-2-1.2 0-1.4.9-1.4 1.9V16H8V8Z" fill="currentColor"></path>
                  </svg>
                </a>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
