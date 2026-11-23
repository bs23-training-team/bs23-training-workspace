'use client';

import React, { useEffect, useState } from 'react';
import type {
  TraineePublishedReportDetail,
  TraineePublishedReportItem,
} from '../types';
import { getTraineeReportDetail, getTraineeReports } from '../api';
import { VisualSummaryCard } from './VisualSummaryCard';
import { ReportSectionItem } from './ReportSectionItem';
import { SectionNav } from './SectionNav';

export function TraineeReportView() {
  const [reportsList, setReportsList] = useState<TraineePublishedReportItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<TraineePublishedReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTraineeReports()
      .then((list) => {
        if (!active) return;
        setReportsList(list);
        if (list.length > 0) {
          setSelectedVersionId((prev) => prev ?? list[0]?.versionId ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load reports.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedVersionId) return;
    let active = true;
    getTraineeReportDetail(selectedVersionId)
      .then((detail) => {
        if (active) setReportDetail(detail);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load report detail.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedVersionId]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Published Reports</h1>
          <p className="text-sm text-gray-500">
            View approved and finalised training period evaluations from your PM.
          </p>
        </div>

        {/* Published Version Picker */}
        <div className="flex items-center gap-3">
          <label htmlFor="trainee-version-picker" className="text-xs font-semibold text-gray-600 uppercase">
            Select Report:
          </label>
          <select
            id="trainee-version-picker"
            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedVersionId ?? ''}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            disabled={reportsList.length === 0}
          >
            {reportsList.length === 0 ? (
              <option value="">No published reports yet</option>
            ) : (
              reportsList.map((item) => (
                <option key={item.versionId} value={item.versionId}>
                  {item.periodType} ({item.periodStart} - {item.periodEnd}) - v{item.version}
                </option>
              ))
            )}
          </select>

          {reportDetail && (
            <button
              type="button"
              onClick={() => window.print()}
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded transition-colors"
            >
              📄 Print / Save PDF
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
          {error}
        </div>
      )}

      {loading && (
        <div className="p-8 text-center text-sm text-gray-500 bg-white rounded-lg border border-gray-100">
          Loading report...
        </div>
      )}

      {!loading && !reportDetail && (
        <div className="p-12 text-center bg-white border border-gray-200 rounded-lg space-y-2">
          <p className="text-base font-semibold text-gray-700">No published reports available.</p>
          <p className="text-xs text-gray-500">
            Reports will appear here once your PM reviews and publishes them.
          </p>
        </div>
      )}

      {reportDetail && (
        <>
          {/* Visual Summary */}
          <VisualSummaryCard summary={reportDetail.visualSummary} />

          {/* 7 Sections & Navigation */}
          <div className="flex gap-6 items-start">
            <main className="flex-1 space-y-6">
              {reportDetail.sections.map((section, idx) => (
                <ReportSectionItem
                  key={section.name}
                  sectionIndex={idx}
                  section={section}
                  isEditable={false}
                />
              ))}
            </main>

            {/* Sticky Navigation Index */}
            <SectionNav />
          </div>
        </>
      )}
    </div>
  );
}
