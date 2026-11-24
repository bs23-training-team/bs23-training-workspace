"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useMe } from "@/features/shell";
import { pmArchivedTrainees } from "@/lib/mock/selectors";
import { TraineeFormDialog } from "../components/trainee-form";
import { Avatar, Badge, Button, EmptyState, PageHeader, Table, Td } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, POSITION_LABEL, RESOURCE_LABEL } from "@/lib/utils";

/** Users whose departure date has passed. Setting a new departure date from Edit moves a user back to All Users. */
export default function ArchivePage() {
  const { db, user } = useMe();
  const toast = useToast();
  const rows = pmArchivedTrainees(db, user.id);
  const [form, setForm] = useState<{ id?: string; key: number }>({ key: 0 });

  return (
    <div>
      <PageHeader title="Archive" description="Inactive users whose departure date has passed. Click a name to view the full profile. Use Edit to set a new departure date and move a user back to All Users." />
      {rows.length === 0 ? (
        <EmptyState title="No archived users." description="Users appear here automatically on their departure date." />
      ) : (
        <Table head={["User", "Email", "Position", "Resources", "Onboarded", "Departure date", "Status", ""]}>
          {rows.map((t) => {
            const u = db.users.find((x) => x.id === t.userId)!;
            return (
              <tr key={t.userId}>
                <Td>
                  <Link href={`/pm/trainees/${t.userId}`} className="flex items-center gap-2 font-medium hover:text-brand-700">
                    <Avatar name={u.name} src={u.photoUrl} size={28} />
                    <span>
                      {u.name}
                      <span className="block text-xs font-normal text-muted">{t.traineeId}</span>
                    </span>
                  </Link>
                </Td>
                <Td>{u.email}</Td>
                <Td>{POSITION_LABEL[t.position]}</Td>
                <Td>{RESOURCE_LABEL[t.resource]}</Td>
                <Td>{formatDate(t.onboardDate)}</Td>
                <Td>{formatDate(t.periodEnd)}</Td>
                <Td>
                  <Badge tone="gray">Inactive</Badge>
                </Td>
                <Td>
                  <Button size="sm" variant="secondary" aria-label={`Edit ${u.name}`} onClick={() => setForm({ id: t.userId, key: form.key + 1 })}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      {form.id && <TraineeFormDialog key={form.key} db={db} pmId={user.id} editUserId={form.id} open onClose={() => setForm({ key: form.key })} onSaved={(m) => toast(m)} />}
    </div>
  );
}
