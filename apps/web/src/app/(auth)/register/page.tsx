"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { registerPM } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const mismatch = !!f.confirm && f.password !== f.confirm;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = registerPM(f);
    if (!r.ok) return setError(r.error);
    router.push(`/verify-email?email=${encodeURIComponent(f.email.trim())}&sent=${encodeURIComponent(r.data!.token)}`);
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div>
      <h1 className="text-2xl font-semibold">PM registration</h1>
      <p className="mt-1 text-sm text-muted">PM registration only. User accounts are created by a PM.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field label="Full name" htmlFor="name" required>
          <Input id="name" value={f.name} onChange={set("name")} autoComplete="name" />
        </Field>
        <Field label="Work email" htmlFor="email" required>
          <Input id="email" type="email" value={f.email} onChange={set("email")} autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="pw" required hint="Minimum 8 characters">
          <Input id="pw" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" htmlFor="pw2" required error={mismatch ? "Passwords do not match." : undefined}>
          <Input id="pw2" type="password" value={f.confirm} onChange={set("confirm")} invalid={mismatch} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full">
          Create PM account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
