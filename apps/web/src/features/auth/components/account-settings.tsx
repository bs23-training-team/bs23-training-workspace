"use client";

import { useRef, useState } from "react";
import type { DB, User } from "@/lib/mock/types";
import { changePassword, endSession, setPhoto, validatePhoto } from "../api";
import { setNotificationPref } from "@/features/notifications";
import { ALWAYS_SHOWN_CATEGORIES, NOTIFICATION_CATEGORIES } from "@/lib/mock/content";
import { Avatar, Badge, Button, Card, Checkbox, Field, Input, Select } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";

export function PhotoUpload({ user }: { user: User }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <div className="flex items-center gap-4">
      <Avatar name={user.name} src={user.photoUrl} size={72} />
      <div>
        <input
          ref={ref}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Upload profile picture"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const err = validatePhoto(f);
            if (err) return setError(err);
            setError("");
            const reader = new FileReader();
            reader.onload = () => setPhoto(user.id, reader.result as string);
            reader.readAsDataURL(f);
          }}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => ref.current?.click()}>
            Upload photo
          </Button>
          {user.photoUrl && (
            <Button size="sm" variant="ghost" onClick={() => setPhoto(user.id, undefined)}>
              Remove
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">JPG, PNG or WebP, up to 2 MB.</p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function PasswordCard({ userId }: { userId: string }) {
  const toast = useToast();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState("");
  return (
    <Card title="Change password">
      <div className="space-y-3">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field label="Current password" htmlFor="cp1">
          <Input id="cp1" type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="cp2" hint="Minimum 8 characters">
          <Input id="cp2" type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="cp3" error={f.confirm && f.confirm !== f.next ? "Passwords do not match." : undefined}>
          <Input id="cp3" type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" />
        </Field>
        <Button
          onClick={() => {
            const r = changePassword(userId, f.current, f.next, f.confirm);
            if (!r.ok) return setError(r.error);
            setError("");
            setF({ current: "", next: "", confirm: "" });
            toast("Password changed.");
          }}
        >
          Update password
        </Button>
      </div>
    </Card>
  );
}

export function NotificationPrefsCard({ db, userId }: { db: DB; userId: string }) {
  return (
    <Card title="Notification preferences" description="Choose which notifications appear in your bell.">
      <ul className="divide-y divide-line">
        {NOTIFICATION_CATEGORIES.map((c) => {
          const p = db.notificationPrefs.find((x) => x.userId === userId && x.category === c);
          const locked = ALWAYS_SHOWN_CATEGORIES.includes(c);
          return (
            <li key={c} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>
                {c}
                {locked && <span className="block text-xs text-muted">Always shown — needs your decision</span>}
              </span>
              <Checkbox label={<span className="sr-only">Show {c} in the bell</span>} checked={locked || p?.showInBell !== false} disabled={locked} onChange={(v) => setNotificationPref(userId, c, v)} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function SessionsCard({ db, userId }: { db: DB; userId: string }) {
  const sessions = db.sessions.filter((s) => s.userId === userId);
  return (
    <Card title="Active sessions" description="Server-side session list (Assumption). Ending a session signs that device out.">
      <ul className="divide-y divide-line">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>
              <span className="font-medium">{s.device}</span>
              <span className="block text-xs text-muted">Signed in {formatDateTime(s.createdAt)}</span>
            </span>
            {s.id === db.currentSessionId ? (
              <Badge tone="green">This device</Badge>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => endSession(s.id)}>
                End session
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function LanguageCard() {
  return (
    <Card title="Interface language">
      <Field label="Language" htmlFor="lang" hint="English is the only interface language in v1.">
        <Select id="lang" value="en" disabled onChange={() => {}}>
          <option value="en">English</option>
        </Select>
      </Field>
    </Card>
  );
}
