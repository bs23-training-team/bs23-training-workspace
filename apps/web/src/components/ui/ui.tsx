"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn, initials } from "@/lib/utils";
import { Loader2, Inbox, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import type { IntegrationStatusValue, SourceStatus } from "@/lib/mock/types";

/* ------------------------------- Button ------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-200",
  secondary: "bg-white text-ink border border-line hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-ink hover:bg-slate-100 disabled:text-slate-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-200",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-200",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }>(
  function Button({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
          size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
          variants[variant],
          className,
        )}
        {...rest}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);

/* ------------------------------- Fields ------------------------------- */

export function Field({ label, error, hint, children, required, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Full width unless the caller sets its own width class. */
const widthOf = (className?: string) => (className && /(^|\s)(w-|min-w-|max-w-)/.test(className) ? "" : "w-full");
const inputBase = "rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputBase, widthOf(className), "h-10", invalid && "border-red-400", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputBase, widthOf(className), "min-h-[88px] py-2", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(inputBase, widthOf(className), "h-10 pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("inline-flex items-center gap-2 text-sm", disabled ? "text-muted" : "cursor-pointer")}>
      <input id={id} type="checkbox" className="h-4 w-4 rounded border-line accent-brand-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Pill-style multi/single select used in the skill assessment. */
export function ChoiceGroup({ options, value, onChange, multiple, name }: { options: string[]; value: string[]; onChange: (v: string[]) => void; multiple?: boolean; name: string }) {
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => onChange(multiple ? (on ? value.filter((v) => v !== o) : [...value, o]) : [o])}
            className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white hover:border-brand-200")}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Layout bits ------------------------------- */

export function Card({ children, className, title, action, description }: { children?: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-line bg-white", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const badgeTones = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  purple: "bg-violet-50 text-violet-700",
} as const;
export type Tone = keyof typeof badgeTones;

export function Badge({ children, tone = "gray", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone], className)}>{children}</span>;
}

export function statusTone(s: string): Tone {
  const k = s.toLowerCase();
  if (["approved", "strong", "done", "final", "awarded", "accepted", "attended", "connected", "low", "resolved", "published", "mastered"].some((x) => k.includes(x))) return "green";
  if (["pending", "developing", "provisional", "medium", "held", "queued", "stale", "self", "needs revision"].some((x) => k.includes(x))) return "amber";
  if (["declined", "rejected", "failed", "weak", "high", "reversed", "suspicious", "unmapped"].some((x) => k.includes(x))) return "red";
  if (["skipped", "not assessed", "unknown", "unavailable", "disconnected", "authorization"].some((x) => k.includes(x))) return "gray";
  return "blue";
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}

/** Labels every figure by source status (FR-RPT-03). */
export function SourceBadge({ source }: { source: SourceStatus }) {
  const tone: Tone = source === "connected" ? "green" : source === "sample" ? "amber" : source === "PM-entered" ? "purple" : "gray";
  return <Badge tone={tone}>{source}</Badge>;
}

export function IntegrationStatus({ name, status, lastSync, onRetry }: { name: string; status: IntegrationStatusValue; lastSync?: string; onRetry?: () => void }) {
  const tone: Tone = status === "Connected" ? "green" : status === "Stale cached data" ? "amber" : status.startsWith("Failed") ? "red" : "gray";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm">
      <span className="font-medium">{name}</span>
      <Badge tone={tone}>{status}</Badge>
      <span className="text-xs text-muted">Last successful sync: {lastSync ? new Date(lastSync).toLocaleString("en-GB") : "never"}</span>
      {onRetry && status.startsWith("Failed") && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, href }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; href?: string }) {
  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {icon && <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>}
    </div>
  );
  const cls = "block rounded-xl border border-line bg-white p-4";
  return href ? (
    <a href={href} className={cn(cls, "transition-shadow hover:shadow-md")}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", value === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <Inbox className="mb-2 h-8 w-8 text-slate-300" aria-hidden />
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = "blue", children, title }: { tone?: "blue" | "amber" | "red" | "green"; children: ReactNode; title?: string }) {
  const tones = { blue: "border-brand-200 bg-brand-50 text-brand-900", amber: "border-amber-200 bg-amber-50 text-amber-900", red: "border-red-200 bg-red-50 text-red-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  return (
    <div role={tone === "red" ? "alert" : "note"} className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function ProgressBar({ value, tone = "blue", label }: { value: number; tone?: "blue" | "green" | "amber"; label?: string }) {
  const color = tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-brand-500";
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 96, label, sublabel }: { value: number; size?: number; label?: string; sublabel?: string }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  return (
    <figure className="flex flex-col items-center gap-1" aria-label={`${label ?? "Progress"}: ${value}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e3e8ef" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#2f6fed"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, value) / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-ink text-lg font-semibold">
          {value}%
        </text>
      </svg>
      {label && <figcaption className="text-xs font-medium text-ink">{label}</figcaption>}
      {sublabel && <span className="text-xs text-muted">{sublabel}</span>}
    </figure>
  );
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-end gap-2 text-sm">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-muted">
        Page {page} of {pages}
      </span>
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-line", className)}>
      <table className="w-full min-w-max text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2.5 align-top", className)}>
      {children}
    </td>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="text-sm font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
