"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useDB } from "@/lib/mock/store";
import { pmPeople } from "@/lib/mock/selectors";
import { Avatar } from "@/components/ui/ui";
import { POSITION_LABEL } from "@/lib/utils";

/** Header search for PMs: finds trainees (active and archived) by name, trainee ID or email. */
export function PmSearch({ userId }: { userId: string }) {
  const db = useDB();
  const router = useRouter();
  const listId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const term = q.trim().toLowerCase();
  const hits = term
    ? pmPeople(db, userId)
        .map((t) => ({ t, u: db.users.find((u) => u.id === t.userId) }))
        .filter(({ t, u }) => `${u?.name ?? ""} ${t.traineeId} ${u?.email ?? ""}`.toLowerCase().includes(term))
        .slice(0, 6)
    : [];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    setQ("");
    router.push(`/pm/trainees/${id}`);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active].t.userId);
    }
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1 sm:max-w-md" role="search">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-label="Search users"
        aria-expanded={open && !!term}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${listId}-${hits[active].t.userId}` : undefined}
        autoComplete="off"
        placeholder="Search users by name, ID or email…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      {open && term && (
        <ul id={listId} role="listbox" aria-label="Search results" className="absolute left-0 right-0 z-50 mt-2 rounded-xl border border-line bg-white p-1 shadow-lg">
          {hits.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">No user matches “{q.trim()}”.</li>
          ) : (
            hits.map(({ t, u }, i) => (
              <li key={t.userId} id={`${listId}-${t.userId}`} role="option" aria-selected={i === active}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(t.userId)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${i === active ? "bg-slate-50" : ""}`}>
                  <Avatar name={u?.name ?? t.traineeId} src={u?.photoUrl} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{u?.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {t.traineeId} · {POSITION_LABEL[t.position]}
                      {t.archivedAt ? " · Inactive" : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
