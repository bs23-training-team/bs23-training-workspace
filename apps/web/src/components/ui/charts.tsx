"use client";

/** Simple accessible bar chart with a text alternative (SRS §4 accessibility). */
export function BarChart({ data, unit = "", height = 160, label }: { data: { label: string; value: number | null }[]; unit?: string; height?: number; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  return (
    <figure>
      <div className="flex items-end gap-2" style={{ height }} aria-hidden>
        {data.map((d) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] text-muted">{d.value == null ? "n/a" : `${d.value}${unit}`}</span>
            <div
              className={d.value == null ? "w-full rounded-t border border-dashed border-slate-300 bg-slate-50" : "w-full rounded-t bg-brand-500"}
              style={{ height: d.value == null ? 8 : `${Math.max(4, ((d.value ?? 0) / max) * (height - 36))}px` }}
            />
            <span className="text-[11px] text-muted">{d.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {label}: {data.map((d) => `${d.label} ${d.value == null ? "unavailable" : d.value + unit}`).join(", ")}
      </figcaption>
    </figure>
  );
}
