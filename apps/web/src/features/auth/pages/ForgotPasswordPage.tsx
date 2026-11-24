"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { requestPasswordReset } from "../mock-api";
import { isEmail } from "@/lib/utils";
import { Alert, Button, Field, Input } from "@/components/ui/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ token?: string } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) return setError("Enter your registered email.");
    setError("");
    const r = requestPasswordReset(email);
    if (r.ok) setSent(r.data ?? {});
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Forgot password</h1>
      <p className="mt-1 text-sm text-muted">Enter your registered email and we&apos;ll send a time-limited reset link.</p>
      {sent ? (
        <div className="mt-6 space-y-4">
          <Alert tone="green">If an account exists for {email}, a reset link has been sent. The link expires in 30 minutes.</Alert>
          <Alert tone="amber" title="Preview">
            Email is not connected.{" "}
            {sent.token ? (
              <Link className="font-medium underline" href={`/reset-password?token=${encodeURIComponent(sent.token)}`}>
                Open the reset link
              </Link>
            ) : (
              "No account matched, so no link was created."
            )}
          </Alert>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Field label="Registered email" htmlFor="email" required error={error}>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} />
          </Field>
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
