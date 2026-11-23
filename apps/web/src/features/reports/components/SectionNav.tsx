'use client';

import React from 'react';
import { REPORT_SECTION_NAMES } from '../types';

export function SectionNav() {
  const handleScrollTo = (index: number) => {
    const el = document.getElementById(`section-${index + 1}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <aside className="w-64 shrink-0 hidden lg:block sticky top-6 h-fit bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
        Section Index (7 Areas)
      </h4>
      <nav className="space-y-1">
        {REPORT_SECTION_NAMES.map((name, idx) => (
          <button
            key={name}
            type="button"
            onClick={() => handleScrollTo(idx)}
            className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors text-ellipsis overflow-hidden"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-700 text-[10px] font-bold shrink-0">
              {idx + 1}
            </span>
            <span className="truncate">{name}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
