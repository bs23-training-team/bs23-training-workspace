"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "../api";
import { Alert, Button, Field, Input } from "@/components/ui/ui";

function Inner() {
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await resetPassword(token, pw, confirm);
    if (!r.ok) return setError(r.error);
    setDone(true);
  };

  if (done)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Password updated</h1>
        <Alert tone="green">Your password was changed. Sign in with the new password.</Alert>
        <Link href="/login" className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white">
          Go to sign in
        </Link>
      </div>
    );

  return (
    <div>
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field label="New password" htmlFor="pw" required hint="Minimum 8 characters">
          <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="pw2" required error={confirm && pw !== confirm ? "Passwords do not match." : undefined}>
          <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full">
          Update password
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
