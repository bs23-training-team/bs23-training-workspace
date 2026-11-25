"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useDB } from "@/lib/mock/store";
import { homeFor } from "../mock-api";
import { changePassword, useApiSession } from "../api";
import { currentUser } from "@/lib/mock/selectors";
import { Alert, Button, Field, Input, Loading } from "@/components/ui/ui";

/** Forced first-login password change for trainees (FR-AUTH-03). */
export default function ChangePasswordPage() {
  const db = useDB();
  const session = useApiSession(); // the API decides who is signed in
  const user = currentUser(db);
  const router = useRouter();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState("");

  const needsChange = session === "signed-in" && !!user && user.mustChangePassword;
  useEffect(() => {
    if (session === "checking") return;
    if (session === "signed-out" || !user) router.replace("/login");
    else if (!user.mustChangePassword) router.replace(homeFor(user.id));
  }, [session, user, router]);

  if (!needsChange) return <Loading label={session === "checking" ? "Checking your session…" : "Redirecting…"} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await changePassword(f.current, f.next, f.confirm);
    if (!r.ok) return setError(r.error);
    router.replace(homeFor(user.id));
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Change your password</h1>
      <p className="mt-1 text-sm text-muted">Welcome, {user.name}. Replace the temporary password from your PM before you continue.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field label="Temporary password" htmlFor="cur" required>
          <Input id="cur" type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="new" required hint="Minimum 8 characters">
          <Input id="new" type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="conf" required error={f.confirm && f.next !== f.confirm ? "Passwords do not match." : undefined}>
          <Input id="conf" type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full">
          Save and continue
        </Button>
      </form>
      <div className="mt-6">
        <Alert tone="blue">Next you&apos;ll complete a short skill assessment so your PM can plan your learning.</Alert>
      </div>
    </div>
  );
}
