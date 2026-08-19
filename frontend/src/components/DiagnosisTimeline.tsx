'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export interface DiagnosisTimelineProps {
  diagnosisYear: number;
  diagnosisLabel: string;
  changeYear: number;
  changeLabel: string;
  currentYear?: number;
}

function pct(year: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(100, ((year - min) / (max - min)) * 100));
}

export default function DiagnosisTimeline({
  diagnosisYear,
  diagnosisLabel,
  changeYear,
  changeLabel,
  currentYear = 2026,
}: DiagnosisTimelineProps) {
  if (!diagnosisYear || !changeYear) return null;

  const padStart = 1;
  const padEnd = 1;
  const minYear = Math.min(diagnosisYear, changeYear, currentYear) - padStart;
  const maxYear = Math.max(diagnosisYear, changeYear, currentYear) + padEnd;

  const diagnosisPct = pct(diagnosisYear, minYear, maxYear);
  const changePct = pct(changeYear, minYear, maxYear);
  const currentPct = pct(currentYear, minYear, maxYear);

  const yearsOutdated = Math.max(0, currentYear - changeYear);

  const dots = [
    {
      id: 'diagnosis',
      pct: diagnosisPct,
      year: diagnosisYear,
      label: `Diagnosed: ${diagnosisLabel}`,
      dotClass: 'bg-blue-500',
      textClass: 'text-slate-700',
    },
    {
      id: 'change',
      pct: changePct,
      year: changeYear,
      label: changeLabel,
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-700',
    },
    {
      id: 'now',
      pct: currentPct,
      year: currentYear,
      label: 'Today',
      dotClass: 'bg-green-500',
      textClass: 'text-green-700',
    },
  ];

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-slate-900">Timeline</CardTitle>
        <CardDescription>
          This diagnosis has been outdated for{' '}
          <span className="text-red-600 font-semibold">{yearsOutdated} years</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 pb-6">
        {/* Horizontal (sm+) */}
        <div className="hidden sm:block relative h-24 mb-2 mt-4">
          {/* Base track line */}
          <div className="absolute top-2 left-0 right-0 h-0.5 bg-slate-200 rounded-full" />
          
          {/* Highlight segment between diagnosis and change (valid window) */}
          <div 
            className="absolute top-2 h-0.5 bg-amber-200 rounded-full"
            style={{ left: `${diagnosisPct}%`, width: `${Math.max(0, changePct - diagnosisPct)}%` }}
          />

          {/* Highlight segment between change and now (outdated window) */}
          <div 
            className="absolute top-2 h-0.5 bg-red-300 rounded-full"
            style={{ left: `${changePct}%`, width: `${Math.max(0, currentPct - changePct)}%` }}
          />

          {dots.map((dot) => (
            <div
              key={dot.id}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: `${dot.pct}%`, transform: 'translateX(-50%)' }}
            >
              {/* Dot */}
              <div className={`w-3 h-3 rounded-full ${dot.dotClass} ring-4 ring-white mt-1 z-10`} />
              
              {/* Label */}
              <div className="mt-3 text-center w-32">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                  {dot.year}
                </div>
                <div className={`text-xs font-medium leading-tight ${dot.textClass}`}>
                  {dot.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Vertical (mobile) */}
        <div className="sm:hidden flex flex-col gap-0 relative mt-2">
          {/* Vertical track line */}
          <div className="absolute left-[5px] top-2 bottom-6 w-0.5 bg-slate-200" />
          
          {/* Dynamic segments for mobile (approximation) */}
          <div 
            className="absolute left-[5px] w-0.5 bg-amber-200"
            style={{ top: '10px', height: '50%' }}
          />
          <div 
            className="absolute left-[5px] w-0.5 bg-red-300"
            style={{ top: '50%', bottom: '24px' }}
          />
          
          {dots.map((dot) => (
            <div key={dot.id} className="relative flex gap-4 pb-8 last:pb-0">
              <div className="relative z-10 flex flex-col items-center justify-start pt-1">
                <div className={`w-3 h-3 rounded-full ${dot.dotClass} ring-4 ring-white`} />
              </div>
              <div className="flex-1 pb-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                  {dot.year}
                </div>
                <div className={`text-sm font-medium leading-snug ${dot.textClass}`}>
                  {dot.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
