'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, getEmail, clearToken } from '@/lib/api';

export default function Navbar({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    setIsLoggedIn(!!getToken());
    const email = getEmail();
    if (email) setUserEmail(email);
  }, []);

  const handleSignOut = () => {
    clearToken();
    setIsLoggedIn(false);
    setUserEmail('');
    router.push('/login');
  };

  return (
    <header className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-48px)] max-w-[1200px] h-16 px-6 flex items-center justify-between rounded-full bg-white/95 border border-black/[0.04] shadow-[0_4px_16px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all ${disabled ? 'pointer-events-none' : ''}`}>
        <div className="flex items-center gap-3">
          <Link href="/" className="font-heading font-bold text-2xl text-dark tracking-tight hover:text-primary transition-colors">
            Living Diagnosis
          </Link>
        </div>

        <div className="flex items-center gap-6">
          <nav className="hidden md:flex gap-6 mr-4 border-r border-slate-200 pr-6">
            <Link 
              href="/dashboard" 
              className={`font-medium transition-colors ${
                pathname === '/dashboard' 
                  ? 'text-primary' 
                  : 'text-slate-600 hover:text-primary'
              }`}
            >
              Dashboard
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <>
                <div className="flex flex-col text-right hidden sm:block">
                  <span className="text-sm font-medium text-slate-900">{userEmail || 'User'}</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-soft text-primary flex items-center justify-center font-bold">
                  {(userEmail || 'U')[0].toUpperCase()}
                </div>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-slate-500 hover:text-red-500 font-medium transition-colors ml-2"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link href="/login" className="text-sm text-slate-500 hover:text-primary font-medium transition-colors">
                Sign In
              </Link>
            )}
          </div>
        </div>
    </header>
  );
}
