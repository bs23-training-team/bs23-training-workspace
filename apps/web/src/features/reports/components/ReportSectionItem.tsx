'use client';

import React from 'react';
import type { ReportLineSource, ReportSectionData } from '../types';

interface ReportSectionItemProps {
  sectionIndex: number;
  section: ReportSectionData;
  isEditable?: boolean;
  onNoteChange?: (newNote: string) => void;
}

function SourceBadge({ source }: { source: ReportLineSource }) {
  switch (source) {
    case 'connected':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800">
          Connected
        </span>
      );
    case 'sample':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800">
          Sample
        </span>
      );
    case 'PM-entered':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-100 text-indigo-800">
          PM-entered
        </span>
      );
    case 'unavailable':
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
          Unavailable
        </span>
      );
  }
}

export function ReportSectionItem({
  sectionIndex,
  section,
  isEditable = false,
  onNoteChange,
}: ReportSectionItemProps) {
  const sectionId = `section-${sectionIndex + 1}`;

  return (
    <div id={sectionId} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm scroll-mt-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
            {sectionIndex + 1}
          </span>
          <h3 className="text-base font-semibold text-gray-900">{section.name}</h3>
        </div>
        <span className="text-xs text-gray-400">Section {sectionIndex + 1} of 7</span>
      </div>

      {/* Data Lines */}
      <div className="space-y-2">
        {section.lines.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Data unavailable for this period</p>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-md overflow-hidden">
            {section.lines.map((line, idx) => (
              <div key={idx} className="p-3 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-gray-900">{line.label}</div>
                  <div className="text-sm text-gray-700">{line.value}</div>
                  {line.note && <div className="text-xs text-gray-500 italic">{line.note}</div>}
                </div>
                <div>
                  <SourceBadge source={line.source} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PM Note Area */}
      <div className="pt-2 border-t border-gray-100">
        <label htmlFor={`pm-note-${sectionIndex}`} className="block text-xs font-semibold text-gray-700 mb-1">
          PM Evaluation & Notes
        </label>
        {isEditable ? (
          <textarea
            id={`pm-note-${sectionIndex}`}
            rows={2}
            className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Enter PM feedback or notes for ${section.name}...`}
            value={section.pmNote}
            onChange={(e) => onNoteChange?.(e.target.value)}
          />
        ) : (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-800 whitespace-pre-wrap">
            {section.pmNote ? section.pmNote : <span className="text-gray-400 italic">No notes entered.</span>}
          </div>
        )}
      </div>
    </div>
  );
}
