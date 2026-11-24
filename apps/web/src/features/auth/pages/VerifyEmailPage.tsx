"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { verificationToken, verifyEmail } from "../mock-api";
import { Alert, Button } from "@/components/ui/ui";

/**
 * Two states: after registering (`?email=…&sent=…`) it explains that a link was emailed; opening the link
 * (`?token=…`) verifies the email, or shows a clear message for a bad or expired token (FR-AUTH-04).
 */
function Inner() {
  const params = useSearchParams();
  const token = params.get("token");
  const email = params.get("email") ?? "";
  const sent = params.get("sent");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [resent, setResent] = useState<string | null>(null);

  const confirm = () => {
    const r = verifyEmail(token ?? "");
    setResult(r.ok ? { ok: true, message: "Email verified. You can sign in now." } : { ok: false, message: r.error });
  };

  if (token != null) {
    const expired = result && !result.ok && result.message.includes("expired");
    let expiredEmail = "";
    try {
      expiredEmail = atob(token).split("|")[1] ?? "";
    } catch {
      /* invalid token: no email to resend to */
    }
    return (
      <div className="text-center">
        <MailCheck className="mx-auto h-12 w-12 text-brand-600" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold">Email verification</h1>
        {!result ? (
          <div className="mt-4">
            <p className="text-sm text-muted">Confirm this is your email to finish registering.</p>
            <Button className="mt-4" onClick={confirm}>
              Verify my email
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4 text-left">
            <Alert tone={result.ok ? "green" : "red"}>{result.message}</Alert>
            {expired && expiredEmail && !resent && (
              <Button variant="secondary" onClick={() => setResent(verificationToken(expiredEmail))}>
                Send a new verification link
              </Button>
            )}
            {resent && (
              <Alert tone="amber" title="Preview">
                Email sending is not connected in this build.{" "}
                <Link className="font-medium underline" href={`/verify-email?token=${encodeURIComponent(resent)}`}>
                  Open the new link
                </Link>
              </Alert>
            )}
          </div>
        )}
        <Link href="/login" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <MailCheck className="mx-auto h-12 w-12 text-brand-600" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">Verify your email</h1>
      <p className="mt-2 text-sm text-muted">
        We sent a verification link to <strong>{email || "your work email"}</strong>. Open it to finish registering, then sign in.
      </p>
      {sent && (
        <div className="mt-6 text-left">
          <Alert tone="amber" title="Preview">
            Email sending is not connected in this build.{" "}
            <Link className="font-medium underline" href={`/verify-email?token=${encodeURIComponent(sent)}`}>
              Open the verification link
            </Link>
          </Alert>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
