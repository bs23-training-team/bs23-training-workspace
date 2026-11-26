"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { login } from "../mock-api";
import { Alert, Button, Checkbox, Field, Input } from "@/components/ui/ui";

export default function LoginPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!identity.trim() || !password) {
      setError("Enter your work email or user ID and your password.");
      return;
    }
    setLoading(true);
    const r = login(identity, password, remember);
    setLoading(false);
    if (!r.ok) setError(r.error);
    else router.replace(r.data!.redirect);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">One login for PMs and users.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field label="Work email or user ID" htmlFor="identity" required>
          <Input id="identity" autoComplete="username" value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="name@bs23.com or BS23001" />
        </Field>
        <Field label="Password" htmlFor="password" required>
          <div className="relative">
            <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex items-center justify-between">
          <Checkbox label="Remember me" checked={remember} onChange={setRemember} />
          <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">New PM accounts are created by an existing PM from the PM dashboard.</p>
      <div className="mt-8">
        <Alert tone="blue" title="Demo accounts (mock data)">
          <ul className="mt-1 space-y-0.5 text-xs">
            <li>PM: sarah@bs23.com / Password123</li>
            <li>User: BS23001 / Password123</li>
            <li>New user (first login): BS23002 / Temp1234</li>
          </ul>
        </Alert>
      </div>
    </div>
  );
}
