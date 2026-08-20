'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getEmail, clearToken } from '@/lib/api';
import FloatingCTA from '@/components/ui/floating-cta';
import Navbar from '@/components/ui/navbar';

export default function ProfilePage() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
  }, [router]);

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: 'var(--ld-background)', color: 'var(--ld-on-background)', fontFamily: 'var(--font-inter, Inter, sans-serif)' }}
    >
      <Navbar />

      <main
        className="pb-24"
        style={{
          flexGrow: 1,
          width: '100%',
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '96px 16px 48px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '64px',
        }}
      >
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
            Profile
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--ld-on-surface-variant)', margin: 0 }}>
            Manage your account and profile settings.
          </p>
        </section>

        {/* Placeholder content for profile */}
        <section className="glass-card" style={{ padding: '24px' }}>
            <p>Profile content will go here.</p>
        </section>

      </main>

      <FloatingCTA />
    </div>
  );
}
