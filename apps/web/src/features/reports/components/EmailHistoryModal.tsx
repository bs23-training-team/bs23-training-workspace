'use client';

import React, { useState } from 'react';
import type { MailDeliveryDto, SendEmailPayload } from '../types';

interface EmailHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  mailDeliveries: MailDeliveryDto[];
  onSendEmail: (payload: SendEmailPayload) => Promise<void>;
  onRetryDelivery: (deliveryId: string) => Promise<void>;
  defaultRecipient?: string;
  defaultSubject?: string;
}

export function EmailHistoryModal({
  isOpen,
  onClose,
  mailDeliveries,
  onSendEmail,
  onRetryDelivery,
  defaultRecipient = '',
  defaultSubject = 'Training Period Report',
}: EmailHistoryModalProps) {
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState('Please find the attached training report for your review.');
  const [sending, setSending] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !subject.trim() || !message.trim()) {
      setError('Recipient, subject, and message are required.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await onSendEmail({ recipient: recipient.trim(), subject: subject.trim(), message: message.trim() });
      setMessage('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async (deliveryId: string) => {
    setError(null);
    setRetryingId(deliveryId);
    try {
      await onRetryDelivery(deliveryId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Email Report & Delivery History</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg font-bold px-2"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
              {error}
            </div>
          )}

          {/* Email Composer */}
          <form onSubmit={handleSend} className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h4 className="text-xs font-bold text-gray-700 uppercase">Compose New Email</h4>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Recipient</label>
              <input
                type="email"
                required
                placeholder="recipient@bs23.test"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Message</label>
              <textarea
                rows={3}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </form>

          {/* Delivery History */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-700 uppercase">
              Email Deliveries & Attempts ({mailDeliveries.length})
            </h4>
            {mailDeliveries.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No email delivery recorded for this report.</p>
            ) : (
              <div className="space-y-3">
                {mailDeliveries.map((delivery) => (
                  <div key={delivery.id} className="border border-gray-200 rounded p-3 bg-white text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-gray-900">{delivery.recipient}</span>
                        <span className="text-gray-500 ml-2">({delivery.subject})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded font-medium ${
                            delivery.status === 'SENT'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {delivery.status} ({delivery.attempts} attempt{delivery.attempts === 1 ? '' : 's'})
                        </span>
                        {delivery.status !== 'SENT' && (
                          <button
                            type="button"
                            disabled={retryingId === delivery.id}
                            onClick={() => handleRetry(delivery.id)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-0.5 rounded font-medium border border-gray-300 transition-colors"
                          >
                            {retryingId === delivery.id ? 'Retrying...' : 'Retry'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Attempts details */}
                    {delivery.mailAttempts && delivery.mailAttempts.length > 0 && (
                      <div className="border-t border-gray-100 pt-1.5 space-y-1">
                        {delivery.mailAttempts.map((att) => (
                          <div key={att.id} className="flex items-center justify-between text-[11px] text-gray-600">
                            <span>
                              Attempt #{att.attemptNo} - Status: {att.status}{' '}
                              {att.error && <span className="text-red-600">({att.error})</span>}
                            </span>
                            <span>{new Date(att.attemptedAt).toLocaleTimeString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold px-4 py-2 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
