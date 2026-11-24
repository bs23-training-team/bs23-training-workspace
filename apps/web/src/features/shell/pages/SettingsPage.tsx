"use client";

import { useState } from "react";
import { useMe } from "../components/hooks";
import { updateProfile, NotificationPrefsCard, PasswordCard, PhotoUpload } from "@/features/auth";
import { XpRulesForm } from "@/features/gamification-core";
import { Button, Card, Field, Input, PageHeader, Tabs } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";

export default function PMSettingsPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const [tab, setTab] = useState<"account" | "notifications" | "xp">("account");
  const [name, setName] = useState(user.name);

  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs
        label="Settings sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "account", label: "Account" },
          { id: "notifications", label: "Notifications" },
          { id: "xp", label: "XP rules & levels" },
        ]}
      />

      {tab === "account" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Profile">
            <div className="space-y-4">
              <PhotoUpload user={user} />
              <Field label="Display name" htmlFor="pn">
                <Input id="pn" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <p className="text-sm text-muted">Email: {user.email}</p>
              <Button
                onClick={() => {
                  const r = updateProfile(user.id, { name, bio: user.bio ?? "" });
                  toast(r.ok ? "Profile saved." : r.error, r.ok ? "success" : "error");
                }}
              >
                Save
              </Button>
            </div>
          </Card>
          <PasswordCard userId={user.id} />
        </div>
      )}

      {tab === "notifications" && (
        <div className="max-w-3xl">
          <NotificationPrefsCard db={db} userId={user.id} />
        </div>
      )}

      {tab === "xp" && <XpRulesForm db={db} pmId={user.id} />}
    </div>
  );
}
