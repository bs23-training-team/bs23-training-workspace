"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "../components/hooks";
import { traineeOf } from "@/lib/mock/selectors";
import { updateProfile, PasswordCard, PhotoUpload } from "@/features/auth";
import { Button, Card, Field, Input, KeyValue, PageHeader, Textarea } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, MODE_LABEL, POSITION_LABEL } from "@/lib/utils";

export default function TraineeProfilePage() {
  const { db, user } = useMe();
  const toast = useToast();
  const t = traineeOf(db, user.id)!;
  const [f, setF] = useState({ name: user.name, bio: user.bio ?? "" });
  const [error, setError] = useState("");

  return (
    <div>
      <PageHeader title="Profile & settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <div className="space-y-4">
            <PhotoUpload user={user} />
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <Field label="Display name" htmlFor="dn">
              <Input id="dn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Bio / learning goals" htmlFor="bio">
              <Textarea id="bio" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
            </Field>
            <Button
              onClick={() => {
                const r = updateProfile(user.id, f);
                if (!r.ok) return setError(r.error);
                setError("");
                toast("Profile saved.");
              }}
            >
              Save profile
            </Button>
          </div>
        </Card>
        <Card title="Managed by your PM" description="These details are read-only. Ask your PM to change them.">
          <KeyValue
            items={[
              ["User ID", t.traineeId],
              ["Email", user.email],
              ["Position", POSITION_LABEL[t.position]],
              ["Attendance mode", MODE_LABEL[t.attendanceMode]],
              ["Team", t.teamIds.map((id) => db.teams.find((x) => x.id === id)?.name).join(", ")],
              ["L&D onboarding date", formatDate(t.onboardDate)],
            ]}
          />
          <div className="mt-4">
            <Link href="/trainee/skill-analysis" className="text-sm font-medium text-brand-600">
              View my skill analysis →
            </Link>
          </div>
        </Card>
        <PasswordCard userId={user.id} />
      </div>
    </div>
  );
}
