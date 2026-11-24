"use client";

import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/features/shell";
import { evaluationsOf, latestRetake, requestRetake } from "../api";
import { SkillReport } from "../components/skill-report";
import { Alert, Button, PageHeader, Select } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";

export default function SkillAnalysisPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const versions = evaluationsOf(db, user.id);
  const [selected, setSelected] = useState(versions[0]?.id);
  const ev = versions.find((v) => v.id === selected) ?? versions[0];
  const retake = latestRetake(db, user.id);
  if (!ev) return null;

  const ask = () => {
    const r = requestRetake(user.id);
    toast(r.ok ? "Retake request sent to your PM." : r.error, r.ok ? "success" : "error");
  };

  return (
    <div>
      <PageHeader
        title="Skill Analysis"
        description="Your initial skill report and every retest. Earlier reports are kept."
        actions={
          <>
            <label className="sr-only" htmlFor="ver">
              Report version
            </label>
            <Select id="ver" value={ev.id} onChange={(e) => setSelected(e.target.value)} className="w-64">
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {formatDateTime(v.createdAt)}
                </option>
              ))}
            </Select>
            {retake?.status === "APPROVED" ? (
              <Link href="/trainee/onboarding" className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                Start retake
              </Link>
            ) : retake?.status === "PENDING" ? (
              <Button disabled>Retake requested</Button>
            ) : (
              <Button onClick={ask}>Request retake</Button>
            )}
          </>
        }
      />
      {retake?.status === "PENDING" && (
        <div className="mb-4">
          <Alert tone="blue">Your retake request is waiting for your PM. You will be notified when it is decided.</Alert>
        </div>
      )}
      {retake?.status === "APPROVED" && (
        <div className="mb-4">
          <Alert tone="green">
            Your PM approved a retake: {retake.minutes} minutes, {retake.totalMarks} marks. This approval works for one attempt.
          </Alert>
        </div>
      )}
      {retake?.status === "REJECTED" && (
        <div className="mb-4">
          <Alert tone="amber">Your last retake request was not approved. You can send a new request.</Alert>
        </div>
      )}
      <SkillReport db={db} ev={ev} />
    </div>
  );
}
