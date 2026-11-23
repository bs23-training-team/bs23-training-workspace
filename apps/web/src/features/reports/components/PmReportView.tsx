'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type {
  PmReportResponse,
  ReportPeriodType,
  ReportSectionData,
  SendEmailPayload,
} from '../types';
import {
  generatePdf,
  getPmReport,
  prepareReport,
  publishReport,
  retryReportEmail,
  saveReportVersion,
  sendReportEmail,
} from '../api';
import { ReportHeader } from './ReportHeader';
import { VisualSummaryCard } from './VisualSummaryCard';
import { ReportSectionItem } from './ReportSectionItem';
import { SectionNav } from './SectionNav';
import { EmailHistoryModal } from './EmailHistoryModal';

export function PmReportView() {
  const [userId, setUserId] = useState('BS23001');
  const [periodType, setPeriodType] = useState<ReportPeriodType>('WEEKLY');
  const [periodStart, setPeriodStart] = useState('2026-11-01');
  const [periodEnd, setPeriodEnd] = useState('2026-11-07');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [reportData, setReportData] = useState<PmReportResponse | null>(null);
  const [currentSections, setCurrentSections] = useState<ReportSectionData[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  const fetchCurrentReport = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const data = await getPmReport({
        userId,
        periodType,
        periodStart,
        periodEnd,
      });
      setReportData(data);
      setSelectedVersionId(null);
      setCurrentSections(data.liveSections);
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to fetch report.',
      });
    } finally {
      setLoading(false);
    }
  }, [userId, periodType, periodStart, periodEnd]);

  useEffect(() => {
    let active = true;
    getPmReport({
      userId,
      periodType,
      periodStart,
      periodEnd,
    })
      .then((data) => {
        if (!active) return;
        setReportData(data);
        setSelectedVersionId(null);
        setCurrentSections(data.liveSections);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to fetch report.',
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, periodType, periodStart, periodEnd]);

  const handleSelectVersion = (versionId: string | null) => {
    setSelectedVersionId(versionId);
    if (!versionId) {
      if (reportData) {
        setCurrentSections(reportData.liveSections);
      }
      return;
    }
    const foundVer = reportData?.versions.find((v) => v.id === versionId);
    if (foundVer) {
      setCurrentSections(foundVer.sections);
    }
  };

  const handleNoteChange = (index: number, newNote: string) => {
    setCurrentSections((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], pmNote: newNote };
      }
      return copy;
    });
  };

  // Helper to ensure an existing report record ID is available
  const getOrCreateReportId = async (): Promise<string> => {
    if (reportData?.report?.id) {
      return reportData.report.id;
    }
    const prep = await prepareReport({
      userId,
      periodType,
      periodStart,
      periodEnd,
    });
    return prep.id;
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const reportId = await getOrCreateReportId();
      await saveReportVersion(reportId, currentSections);
      setStatusMessage({ type: 'success', text: 'New draft version saved successfully.' });
      await fetchCurrentReport();
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save draft.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setStatusMessage(null);
    try {
      const reportId = await getOrCreateReportId();
      await publishReport(reportId, { sections: currentSections });
      setStatusMessage({ type: 'success', text: 'Report published successfully and is now visible to the user.' });
      await fetchCurrentReport();
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to publish report.',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleMakePdf = async () => {
    if (!reportData?.report?.id) {
      setStatusMessage({ type: 'error', text: 'Please save a version first before generating PDF.' });
      return;
    }
    const versionId = selectedVersionId ?? reportData.versions[0]?.id;
    if (!versionId) {
      setStatusMessage({ type: 'error', text: 'No saved version available to generate PDF.' });
      return;
    }
    setPdfGenerating(true);
    setStatusMessage(null);
    try {
      const pdf = await generatePdf(reportData.report.id, versionId);
      setStatusMessage({
        type: 'success',
        text: `PDF generated: ${pdf.filePath}. Ready for export.`,
      });
      window.print();
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'PDF generation failed.',
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleSendEmail = async (payload: SendEmailPayload) => {
    if (!reportData?.report?.id) {
      throw new Error('Report must be saved before sending via email.');
    }
    await sendReportEmail(reportData.report.id, payload);
    setStatusMessage({ type: 'success', text: 'Email queued for delivery.' });
    await fetchCurrentReport();
  };

  const handleRetryEmail = async (deliveryId: string) => {
    if (!reportData?.report?.id) return;
    await retryReportEmail(reportData.report.id, deliveryId);
    setStatusMessage({ type: 'success', text: 'Email delivery retry initiated.' });
    await fetchCurrentReport();
  };

  const isReadOnly = selectedVersionId !== null;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header & Filters */}
      <ReportHeader
        userId={userId}
        onUserIdChange={setUserId}
        periodType={periodType}
        onPeriodTypeChange={setPeriodType}
        periodStart={periodStart}
        periodEnd={periodEnd}
        onPeriodStartChange={setPeriodStart}
        onPeriodEndChange={setPeriodEnd}
        onLoadReport={fetchCurrentReport}
        versions={reportData?.versions ?? []}
        selectedVersionId={selectedVersionId}
        onSelectVersion={handleSelectVersion}
        userName={reportData?.user.name}
        inTrainingPeriod={reportData?.period.inTrainingPeriod}
        outsidePeriodReason={reportData?.period.outsidePeriodReason}
        isPmView={true}
        loading={loading}
      />

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`p-3 rounded text-xs font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Visual Summary */}
      <VisualSummaryCard summary={reportData?.visualSummary ?? null} />

      {/* Main Body: 7 Sections & Sticky Index */}
      <div className="flex gap-6 items-start">
        <main className="flex-1 space-y-6">
          {currentSections.map((section, idx) => (
            <ReportSectionItem
              key={section.name}
              sectionIndex={idx}
              section={section}
              isEditable={!isReadOnly}
              onNoteChange={(newNote) => handleNoteChange(idx, newNote)}
            />
          ))}

          {/* Action Bar at the end of Section 7 */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-gray-500">
              {isReadOnly ? (
                <span className="text-amber-700 font-semibold">Viewing a saved version in read-only mode.</span>
              ) : (
                <span>Every save creates a new draft version. Publish makes it visible to the trainee.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(true)}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-4 py-2 rounded transition-colors"
              >
                ✉ Email Report ({reportData?.mailDeliveries.length ?? 0})
              </button>

              <button
                type="button"
                onClick={handleMakePdf}
                disabled={pdfGenerating}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50"
              >
                {pdfGenerating ? 'Generating PDF...' : '📄 Make PDF'}
              </button>

              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="bg-gray-800 hover:bg-gray-900 text-white text-xs font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : '💾 Save Draft'}
                  </button>

                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishing}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 py-2 rounded transition-colors disabled:opacity-50"
                  >
                    {publishing ? 'Publishing...' : '🚀 Publish Report'}
                  </button>
                </>
              )}
            </div>
          </div>
        </main>

        {/* Section Navigation Index on the Right */}
        <SectionNav />
      </div>

      {/* Email History & Composer Modal */}
      <EmailHistoryModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        mailDeliveries={reportData?.mailDeliveries ?? []}
        onSendEmail={handleSendEmail}
        onRetryDelivery={handleRetryEmail}
        defaultRecipient="hr@bs23.test"
        defaultSubject={`Training Period Report - ${reportData?.user.name ?? userId} (${periodType})`}
      />
    </div>
  );
}
