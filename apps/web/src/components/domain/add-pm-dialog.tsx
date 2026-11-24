"use client";

import { useState } from "react";
import { createPM } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";

/** Create another PM account from the dashboard. The new PM signs in with the email or PM ID. */
export function AddPMDialog({ creatorId, open, onClose, onSaved }: { creatorId: string; open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState({ name: "", email: "", pmCode: "", password: "" });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = () => {
    const r = createPM(creatorId, f);
    if (!r.ok) return setError(r.error);
    onSaved(`PM account created for ${f.name.trim()}.`);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create PM account"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Create account</Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="PM name" htmlFor="pmn" required>
          <Input id="pmn" value={f.name} onChange={set("name")} autoComplete="off" />
        </Field>
        <Field label="PM ID" htmlFor="pmi" required>
          <Input id="pmi" value={f.pmCode} onChange={set("pmCode")} placeholder="PM003" autoComplete="off" />
        </Field>
        <Field label="PM email" htmlFor="pme" required>
          <Input id="pme" type="email" value={f.email} onChange={set("email")} autoComplete="off" />
        </Field>
        <Field label="Password" htmlFor="pmp" required hint="Minimum 8 characters">
          <Input id="pmp" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
      </div>
    </Dialog>
  );
}
