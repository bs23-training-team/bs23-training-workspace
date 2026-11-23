'use client';

import React from 'react';
import type { ReportVisualSummary } from '../types';

interface VisualSummaryCardProps {
  summary: ReportVisualSummary | null;
}

export function VisualSummaryCard({ summary }: VisualSummaryCardProps) {
  if (!summary) return null;

  const totalOfficeLateMinutes = summary.officeLateMinutes.reduce((acc, m) => acc + m, 0);
  const lateOfficeDaysCount = summary.officeLateMinutes.filter((m) => m > 0).length;

  const totalMeetingLateMinutes = summary.meetingLateMinutes.reduce((acc, m) => acc + m, 0);
  const lateMeetingCount = summary.meetingLateMinutes.filter((m) => m > 0).length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h2 className="text-base font-semibold text-gray-900">Training Progress & Visual Summary</h2>
        <span className="text-xs text-gray-400">Live Calculated Metrics</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Content Completion */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-xs font-medium text-blue-700">Content Completion</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-blue-900">
              {summary.contentCompletionPct}%
            </span>
          </div>
          <div className="w-full bg-blue-200 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-blue-600 h-1.5 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, summary.contentCompletionPct))}%` }}
            />
          </div>
        </div>

        {/* Verified Mastery */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
          <p className="text-xs font-medium text-emerald-700">Verified Mastery</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-emerald-900">
              {summary.verifiedMasteryPct}%
            </span>
          </div>
          <div className="w-full bg-emerald-200 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, summary.verifiedMasteryPct))}%` }}
            />
          </div>
        </div>

        {/* Assessment Average */}
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
          <p className="text-xs font-medium text-purple-700">Assessment Average</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-purple-900">
              {summary.assessmentAveragePct !== null ? `${summary.assessmentAveragePct}%` : 'N/A'}
            </span>
            <span className="text-xs text-purple-500">
              ({summary.finalResultsCount} final exam{summary.finalResultsCount === 1 ? '' : 's'})
            </span>
          </div>
          <p className="text-[10px] text-purple-600 mt-2">Finalised results only</p>
        </div>

        {/* Sprint On-Time Rate */}
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-700">Sprint On-Time</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-amber-900">
              {summary.sprintOnTimeRatePct !== null ? `${summary.sprintOnTimeRatePct}%` : 'N/A'}
            </span>
          </div>
          <p className="text-[10px] text-amber-600 mt-2">Daily tasks delivered on time</p>
        </div>

        {/* Attendance Punctuality */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-700">Late Delays</p>
          <div className="mt-1 space-y-0.5 text-xs text-gray-800">
            <div>
              Office: <span className="font-semibold">{totalOfficeLateMinutes}m</span>{' '}
              <span className="text-gray-500 text-[10px]">({lateOfficeDaysCount} day{lateOfficeDaysCount === 1 ? '' : 's'})</span>
            </div>
            <div>
              Teams: <span className="font-semibold">{totalMeetingLateMinutes}m</span>{' '}
              <span className="text-gray-500 text-[10px]">({lateMeetingCount} meeting{lateMeetingCount === 1 ? '' : 's'})</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Missing ERP is not an absence</p>
        </div>
      </div>
    </div>
  );
}
