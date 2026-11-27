"use client";

import { useState } from "react";
import { Button } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import type { AccountCredentials } from "../api";

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
        <CopyRow label="Temporary password" value={creds.tempPassword} />
      </div>
      <p role="status" className="text-sm">
        {creds.emailSent ? `The sign-in email was sent to ${creds.email}.` : "The sign-in email was not sent. Share the details above yourself."}
      </p>
    </Dialog>
  );
}
