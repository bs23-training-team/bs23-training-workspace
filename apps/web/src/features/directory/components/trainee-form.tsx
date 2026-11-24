"use client";

import { useState, type ReactNode } from "react";
import type { DB, Position, AttendanceMode, Resource } from "@/lib/mock/types";
import { createTrainee, updateTrainee, type TraineeInput } from "../api";
import { Button, Checkbox, Field, Input, Select } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { POSITION_LABEL, MODE_LABEL, RESOURCE_LABEL, addDays, addMonths, todayISO } from "@/lib/utils";

/** A titled group of fields: two columns, aligned rows, one note under the group. */
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{children}</div>
      {note && <p className="text-xs text-muted">{note}</p>}
    </section>
  );
}

/** Create/edit trainee (FR-DIR-03). ID and email must be unique; new accounts get a temporary password. */
export function TraineeFormDialog({ db, pmId, editUserId, open, onClose, onSaved }: { db: DB; pmId: string; editUserId?: string; open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const t = editUserId ? db.trainees.find((x) => x.userId === editUserId) : undefined;
  const u = editUserId ? db.users.find((x) => x.id === editUserId) : undefined;
  const [f, setF] = useState<TraineeInput>(() =>
    t && u
      ? { traineeId: t.traineeId, name: u.name, email: u.email, tempPassword: "", position: t.position, attendanceMode: t.attendanceMode, resource: t.resource, onboardDate: t.onboardDate, periodEnd: t.periodEnd, skillAssessmentMinutes: t.skillAssessmentMinutes ?? 20, skillAssessmentMarks: t.skillAssessmentMarks ?? 20, teamIds: t.teamIds }
      : { traineeId: "", name: "", email: "", tempPassword: "", position: "FRONTEND", attendanceMode: "PHYSICAL", resource: "TRAINEE", onboardDate: todayISO(), periodEnd: addMonths(todayISO(), 3), skillAssessmentMinutes: 20, skillAssessmentMarks: 20, teamIds: [] },
  );
  const [error, setError] = useState("");
  const teams = db.teams.filter((x) => x.pmId === pmId);

  const departureNote = t?.archivedAt
    ? "Pick a date after today to extend the period. Saving moves the user back to All Users."
    : t && !t.periodEnd && !f.periodEnd
      ? "No departure date is set. Pick a date to set one."
      : "The user moves to the Archive on the departure date.";

  const save = () => {
    const r = editUserId ? updateTrainee(pmId, editUserId, f) : createTrainee(pmId, f);
    if (!r.ok) return setError(r.error);
    onSaved(editUserId ? (t?.archivedAt ? "User reactivated and moved back to All Users." : "User updated.") : `User account created. ${f.name} must change the temporary password on first login.`);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editUserId ? "Edit user" : "Add user"}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{editUserId ? (t?.archivedAt ? "Save and reactivate" : "Save changes") : "Create account"}</Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="space-y-5">
        <Section title="Account" note={editUserId ? "Leave the password empty to keep the current one." : "Minimum 8 characters. The user must change it on first login."}>
          <Field label="User ID" htmlFor="tid" required>
            <Input id="tid" value={f.traineeId} onChange={(e) => setF({ ...f, traineeId: e.target.value })} placeholder="BS23008" />
          </Field>
          <Field label="User name" htmlFor="tn" required>
            <Input id="tn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="te" required>
            <Input id="te" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label={editUserId ? "Reset temporary password" : "Temporary password"} htmlFor="tp" required={!editUserId}>
            <Input id="tp" type="text" value={f.tempPassword} onChange={(e) => setF({ ...f, tempPassword: e.target.value })} autoComplete="off" />
          </Field>
        </Section>

        <Section title="Role and team">
          <Field label="Position" htmlFor="tpos" required>
            <Select id="tpos" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value as Position })}>
              {Object.entries(POSITION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Resources" htmlFor="tres" required>
            <Select id="tres" value={f.resource} onChange={(e) => setF({ ...f, resource: e.target.value as Resource })}>
              {Object.entries(RESOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-sm font-medium text-ink">
              Teams <span className="text-red-600" aria-hidden>*</span>
              <span className="sr-only">(required, choose one or more)</span>
            </legend>
            {teams.length === 0 ? (
              <p className="text-sm text-muted">Create a team on All Users → Teams first.</p>
            ) : (
              <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto rounded-lg border border-line px-3 py-2">
                {teams.map((tm) => (
                  <Checkbox
                    key={tm.id}
                    label={tm.name}
                    checked={f.teamIds.includes(tm.id)}
                    onChange={(on) => setF({ ...f, teamIds: on ? [...f.teamIds, tm.id] : f.teamIds.filter((x) => x !== tm.id) })}
                  />
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-muted">A user can belong to more than one team.</p>
          </fieldset>
          <Field label="Attendance mode" htmlFor="tmode" required>
            <Select id="tmode" value={f.attendanceMode} onChange={(e) => setF({ ...f, attendanceMode: e.target.value as AttendanceMode })}>
              {Object.entries(MODE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </Section>

        <Section title="Training period" note={departureNote}>
          <Field label="Onboarding date" htmlFor="tod" required>
            <Input id="tod" type="date" value={f.onboardDate} onChange={(e) => setF({ ...f, onboardDate: e.target.value })} />
          </Field>
          <Field label="Departure date" htmlFor="tper" required={!!t?.archivedAt || !(t && !t.periodEnd)}>
            <Input id="tper" type="date" min={f.onboardDate ? addDays(f.onboardDate, 1) : undefined} value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
          </Field>
        </Section>

        <Section title="First-login skill assessment" note="Marks are shared equally across the questions.">
          <Field label="Time allowed" htmlFor="tmin" required>
            <div className="relative">
              <Input id="tmin" type="number" min={1} max={180} step={1} className="pr-14" value={Number.isNaN(f.skillAssessmentMinutes) ? "" : f.skillAssessmentMinutes} onChange={(e) => setF({ ...f, skillAssessmentMinutes: e.target.valueAsNumber })} />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">min</span>
            </div>
          </Field>
          <Field label="Total marks" htmlFor="tmarks" required>
            <div className="relative">
              <Input id="tmarks" type="number" min={1} max={1000} step={1} className="pr-16" value={Number.isNaN(f.skillAssessmentMarks) ? "" : f.skillAssessmentMarks} onChange={(e) => setF({ ...f, skillAssessmentMarks: e.target.valueAsNumber })} />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">marks</span>
            </div>
          </Field>
        </Section>
      </div>
    </Dialog>
  );
}
