"use client";

import { ScrollText } from "lucide-react";
import { Alert, Card, PageHeader } from "@/components/ui/ui";

/** FR-POL-01: company policy content, edit rights and publishing rules are still to be supplied. */
export default function PolicyPage() {
  return (
    <div>
      <PageHeader title="Policy" description="Company policy reference for PMs." />
      <Card>
        <div className="flex flex-col items-center py-10 text-center">
          <ScrollText className="h-10 w-10 text-slate-300" aria-hidden />
          <p className="mt-3 font-medium">Company policy content will be added here.</p>
          <p className="mt-1 max-w-md text-sm text-muted">Brain Station 23 will supply the policy text, who can edit it and how changes are published.</p>
        </div>
        <Alert tone="amber" title="Open question (PRD §10)">
          Policy page content and edit rights are not decided yet.
        </Alert>
      </Card>
    </div>
  );
}
