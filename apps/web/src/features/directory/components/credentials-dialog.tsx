"use client";

import { useState } from "react";
import { Button } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { useDB } from "@/lib/mock/store";
import { retryEmail, type AccountCredentials } from "../mock-api";
import { resendAccountEmail } from "../api";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="break-all font-mono text-sm">{value}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** FR-AUTH-08: shown once after an account is created, with the account ID, the temporary password and the email status. */
export function CredentialsDialog({ creds, onClose }: { creds: AccountCredentials; onClose: () => void }) {
  const db = useDB();
  // The real API has no delivery record (deliveryId is empty): its status lives here and Retry calls the API.
  const real = creds.deliveryId === "";
  const [apiStatus, setApiStatus] = useState(creds.mailStatus);
  const [password, setPassword] = useState(creds.temporaryPassword);
  const [retryError, setRetryError] = useState("");
  const status = real ? apiStatus : (db.emailDeliveries.find((e) => e.id === creds.deliveryId)?.status ?? creds.mailStatus);
  const retry = async () => {
    if (!real) return retryEmail(creds.deliveryId);
    setRetryError("");
    const r = await resendAccountEmail(creds.accountId);
    if (r.ok) {
      setApiStatus(r.data!.mailStatus);
      setPassword(r.data!.temporaryPassword); // the old password no longer works
    } else setRetryError(r.error);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Account created"
      footer={
        <Button onClick={onClose}>Done</Button>
      }
    >
      <p className="text-sm">
        {creds.name} must change the temporary password at first sign-in. This password is shown only now, so copy it before you close this window.
      </p>
      <div className="space-y-2">
        <CopyRow label="Account ID" value={creds.accountId} />
        <CopyRow label="Email" value={creds.email} />
        <CopyRow label="Temporary password" value={real ? password : creds.temporaryPassword} />
      </div>
      <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
        {status === "ACCEPTED" && <span>The sign-in email (account ID and temporary password) was sent to {creds.email}.</span>}
        {status === "QUEUED" && <span>The sign-in email is queued for {creds.email}.</span>}
        {status === "FAILED" && (
          <>
            <span>The sign-in email was not sent. Give the person the details above yourself. Retry issues a new temporary password and emails it.</span>
            <button className="font-medium text-brand-600 hover:underline" onClick={retry}>
              Retry
            </button>
          </>
        )}
      </p>
      {retryError && (
        <p role="alert" className="text-sm text-red-600">
          {retryError}
        </p>
      )}
    </Dialog>
  );
}
