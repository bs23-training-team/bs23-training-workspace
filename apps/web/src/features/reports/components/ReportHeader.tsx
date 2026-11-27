'use client';

import React from 'react';
import type { ReportPeriodType, ReportVersionDetail } from '../types';

interface ReportHeaderProps {
  userId: string;
  onUserIdChange: (userId: string) => void;
  periodType: ReportPeriodType;
  onPeriodTypeChange: (periodType: ReportPeriodType) => void;
  periodStart: string;
  periodEnd: string;
  onPeriodStartChange: (date: string) => void;
  onPeriodEndChange: (date: string) => void;
  onLoadReport: () => void;
  versions: ReportVersionDetail[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string | null) => void;
  userName?: string;
  inTrainingPeriod?: boolean;
  outsidePeriodReason?: string | null;
  isPmView?: boolean;
  loading?: boolean;
}

const PRESET_USERS = [
  { id: 'BS23001', label: 'BS23001 - Demo Trainee (Active)' },
  { id: 'BS23002', label: 'BS23002 - Demo Central RND' },
  { id: 'BS23003', label: 'BS23003 - Demo Industrial Attachment' },
  { id: 'BS23004', label: 'BS23004 - Demo SBU' },
];

export function ReportHeader({
  userId,
  onUserIdChange,
  periodType,
  onPeriodTypeChange,
  periodStart,
  periodEnd,
  onPeriodStartChange,
  onPeriodEndChange,
  onLoadReport,
  versions,
  selectedVersionId,
  onSelectVersion,
  userName,
  inTrainingPeriod,
  outsidePeriodReason,
  isPmView = true,
  loading = false,
}: ReportHeaderProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isPmView ? 'Training Report Management' : 'My Training Reports'}
          </h1>
          <p className="text-sm text-gray-500">
            {userName ? `User: ${userName} (${userId})` : `Viewing report for ${userId}`}
          </p>
        </div>

        {/* Version Picker */}
        <div className="flex items-center gap-2">
          <label htmlFor="version-picker" className="text-xs font-semibold text-gray-600 uppercase">
            Version:
          </label>
          <select
            id="version-picker"
            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedVersionId ?? ''}
            onChange={(e) => onSelectVersion(e.target.value === '' ? null : e.target.value)}
          >
            {isPmView && <option value="">Latest Live / Draft</option>}
            {versions.map((ver) => (
              <option key={ver.id} value={ver.id}>
                v{ver.version} {ver.publishedAt ? '(Published)' : '(Draft)'} -{' '}
                {new Date(ver.savedAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Query Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        {isPmView && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Select Trainee / User
            </label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={userId}
              onChange={(e) => onUserIdChange(e.target.value)}
            >
              {PRESET_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Period Type</label>
          <select
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={periodType}
            onChange={(e) => onPeriodTypeChange(e.target.value as ReportPeriodType)}
          >
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Bi-weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="FULL">Full Training Period</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Period Start</label>
          <input
            type="date"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={periodStart}
            onChange={(e) => onPeriodStartChange(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Period End</label>
          <div className="flex gap-2">
            <input
              type="date"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={periodEnd}
              onChange={(e) => onPeriodEndChange(e.target.value)}
            />
            <button
              type="button"
              onClick={onLoadReport}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 text-sm font-medium rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Fetch'}
            </button>
          </div>
        </div>
      </div>

      {/* Outside Training Period Warning */}
      {inTrainingPeriod === false && outsidePeriodReason && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded flex items-center justify-between">
          <span>⚠️ {outsidePeriodReason}</span>
          <span className="font-semibold text-amber-900">Training Period Boundary</span>
        </div>
      )}
    </div>
  );
}
