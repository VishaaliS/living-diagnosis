"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

export default function FloatingCTA() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto transition-all duration-500 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="absolute inset-[-4px] rounded-full backdrop-blur-sm bg-white/20 z-[-1]"></div>
      <button
        onClick={() => router.push('/analysis')}
        className="inline-flex items-center gap-3 bg-[#D7FF3F] text-[#0B0B0B] rounded-full py-3.5 pl-6 pr-2 shadow-[0_8px_32px_rgba(0,0,0,0.15)] font-bold text-sm uppercase tracking-wide transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        <span className="hidden sm:inline">Run a Diagnostic Analysis</span>
        <span className="sm:hidden">Run Analysis</span>
        <div className="w-9 h-9 rounded-full bg-[#0B0B0B] text-white flex items-center justify-center shrink-0">
          <ArrowRight className="h-4 w-4" />
        </div>
      </button>
    </div>
  );
}
