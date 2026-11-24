"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChartColumn, TrendingUp } from "lucide-react";
import type { SectorGrowthRow } from "@/lib/dashboard";
import type { Sector } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "trend" | "compare";
type Hover = { kind: "trend"; i: number; x: number; y: number } | { kind: "bar"; key: Sector; x: number; y: number } | null;

const H = 356;
const M = { t: 30, r: 18, b: 50, l: 48 };
const PAD_X = 14;
const TIP_W = 200;

const users = (n: number) => `${n} user${n === 1 ? "" : "s"}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const monthShort = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" });
const monthLong = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

function niceMax(max: number) {
  const step = max <= 30 ? 5 : 10;
  let top = Math.ceil(max / step) * step;
  if (top - max < step * 0.3) top += step;
  return { top: Math.max(top, step), step };
}

/** Catmull-Rom → cubic Bézier: a smooth curve through every point. */
function smooth(p: [number, number][]) {
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const t = 1 / 6;
    d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Sector Growth Analytics. ONE chart container with two visual modes (Trend line chart and
 * Compare bar chart) fed by the same rows. The selected sector survives a mode switch.
 */
export function SectorGrowth({ months, rows }: { months: string[]; rows: SectorGrowthRow[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [mode, setMode] = useState<Mode>("trend");
  const [sel, setSel] = useState<Sector | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [entering, setEntering] = useState(true);
  const [barsReady, setBarsReady] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => (setEntering(false), setBarsReady(true))));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = (k: Sector) => setSel((s) => (s === k ? null : k));
  const changeMode = (m: Mode) => {
    setMode(m);
    setHover(null);
  };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") changeMode(mode === "trend" ? "compare" : "trend");
  };

  const hasData = months.length > 0 && rows.some((r) => r.values.length > 0);
  const maxGrowth = Math.max(...rows.map((r) => r.growth), 1);

  const geo = useMemo(() => {
    const W = Math.max(300, width);
    const pw = W - M.l - M.r;
    const ph = H - M.t - M.b;
    const { top, step } = niceMax(Math.max(0, ...rows.flatMap((r) => r.growthSeries)));
    const y = (v: number) => M.t + ph * (1 - v / top);
    const n = months.length;
    const x = (i: number) => (n > 1 ? M.l + PAD_X + (i * (pw - PAD_X * 2)) / (n - 1) : M.l + pw / 2);
    return { W, pw, ph, top, step, y, x, n, colW: pw / Math.max(rows.length, 1) };
  }, [width, rows, months]);

  const hoverTip = (() => {
    if (!hover) return null;
    const left = hover.x + 16 + TIP_W > geo.W ? hover.x - 16 - TIP_W : hover.x + 16;
    const style: CSSProperties = { left: Math.max(6, left), top: Math.max(6, Math.min(hover.y - 40, H - 150)), width: TIP_W };
    if (hover.kind === "trend") {
      const list = [...rows].sort((a, b) => b.growthSeries[hover.i] - a.growthSeries[hover.i]);
      return (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-white p-2.5 text-xs shadow-lg" style={style} role="tooltip">
          <p className="mb-1 font-semibold text-ink">{monthLong(months[hover.i])} · growth since {monthShort(months[0])}</p>
          {list.map((r) => (
            <div key={r.key} className={cn("flex items-center gap-2 py-0.5 text-muted", sel === r.key && "font-semibold text-ink")}>
              <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
              <span className="flex-1">{r.label}</span>
              <b className="tabular-nums text-ink">{pct(r.growthSeries[hover.i])}</b>
            </div>
          ))}
        </div>
      );
    }
    const r = rows.find((x) => x.key === hover.key)!;
    return (
      <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-white p-2.5 text-xs shadow-lg" style={style} role="tooltip">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
          <i className="h-2 w-2 rounded-full" style={{ background: r.color }} />
          {r.label}
        </p>
        <div className="flex justify-between py-0.5 text-muted">
          <span>Growth since {monthShort(months[0])}</span>
          <b className="tabular-nums text-ink">{pct(r.growth)}</b>
        </div>
        <div className="flex justify-between py-0.5 text-muted">
          <span>{monthShort(months[0])} → now</span>
          <b className="tabular-nums text-ink">
            {r.base.toFixed(1)} → {r.current.toFixed(1)}
          </b>
        </div>
        <div className="flex justify-between py-0.5 text-muted">
          <span>Users</span>
          <b className="tabular-nums text-ink">{r.trainees}</b>
        </div>
      </div>
    );
  })();

  const { W, pw, ph, top, step, y, x, n, colW } = geo;
  const ariaLabel =
    mode === "trend"
      ? `Multi-series line chart of growth since ${months[0] ? monthLong(months[0]) : "January"} by sector. Current growth: ${rows.map((r) => `${r.label} ${pct(r.growth)}`).join(", ")}.`
      : `Bar chart comparing growth since ${months[0] ? monthLong(months[0]) : "January"} by sector: ${rows.map((r) => `${r.label} ${pct(r.growth)}`).join(", ")}.`;

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-white" aria-labelledby="sg-title">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="sg-title" className="text-[15px] font-semibold text-ink">
            Sector Growth Analytics
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Average skill score growth by sector{months.length ? ` · ${monthLong(months[0])} – ${monthLong(months[months.length - 1])}` : ""}
          </p>
        </div>
        <div role="tablist" aria-label="Chart mode" className="relative inline-grid grid-cols-2 rounded-lg bg-slate-100 p-1">
          <span aria-hidden className="sg-thumb absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-md bg-brand-600" style={{ transform: mode === "compare" ? "translateX(100%)" : undefined }} />
          {(
            [
              ["trend", "Trend", TrendingUp],
              ["compare", "Compare", ChartColumn],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              id={`sg-tab-${id}`}
              aria-selected={mode === id}
              tabIndex={mode === id ? 0 : -1}
              onClick={() => changeMode(id)}
              onKeyDown={onTabKey}
              className={cn("relative z-10 flex h-8 min-w-24 items-center justify-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold transition-colors", mode === id ? "text-white" : "text-muted hover:text-ink")}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </header>

      {!hasData ? (
        <p className="px-5 py-10 text-center text-sm text-muted">No monthly sector data yet. Snapshots appear after the first monthly update.</p>
      ) : (
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2" aria-label="Select a sector">
              {rows.map((r) => (
                <button
                  key={r.key}
                  aria-pressed={sel === r.key}
                  onClick={() => toggle(r.key)}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition", sel === r.key ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line bg-white hover:bg-slate-50", sel && sel !== r.key && "opacity-50")}
                >
                  <i className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                  {r.label}
                </button>
              ))}
            </div>

            <div ref={wrapRef} className="relative w-full rounded-xl border border-line bg-white p-1" style={{ height: H + 8 }}>
              {width > 0 && (
                <>
                  <svg className={cn("sg-chart block h-full w-full overflow-visible", mode === "trend" ? "mode-trend" : "mode-compare", entering && "entering")} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ height: H }}>
                    <defs>
                      {rows.map((r) => (
                        <linearGradient key={r.key} id={`${uid}-a-${r.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor={r.color} stopOpacity={0.16} />
                          <stop offset="1" stopColor={r.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                      {rows.map((r) => (
                        <linearGradient key={`b-${r.key}`} id={`${uid}-b-${r.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor={r.color} stopOpacity={1} />
                          <stop offset="1" stopColor={r.color} stopOpacity={0.5} />
                        </linearGradient>
                      ))}
                    </defs>

                    {/* shared Y axis: both modes plot growth % */}
                    <g className="sg-grid">
                      {Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step).map((v) => (
                        <g key={v}>
                          <line className={v === 0 ? "sg-base" : undefined} x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} />
                          <text x={M.l - 10} y={y(v) + 4} textAnchor="end">
                            {v}%
                          </text>
                        </g>
                      ))}
                    </g>

                    {/* Trend */}
                    <g className="g-trend">
                      {rows.map((r, si) => {
                        const pts = r.growthSeries.map((v, i) => [x(i), y(v)] as [number, number]);
                        const d = smooth(pts);
                        const last = pts[pts.length - 1];
                        return (
                          <g key={r.key} className={cn("sg-ser", sel === r.key && "sel", sel && sel !== r.key && "dim")} style={{ "--d": `${si * 70}ms` } as CSSProperties}>
                            <path className="sg-area" d={`${d} L${last[0].toFixed(1)},${y(0)} L${pts[0][0].toFixed(1)},${y(0)} Z`} fill={`url(#${uid}-a-${r.key})`} />
                            <path className="sg-line" pathLength={1} d={d} stroke={r.color} />
                            <circle className="sg-enddot" cx={last[0]} cy={last[1]} r={4.5} fill={r.color} stroke="#fff" strokeWidth={2} />
                          </g>
                        );
                      })}
                      <g className="sg-xl">
                        {months.map((m, i) => (W < 480 && i % 2 ? null : (
                          <text key={m} x={x(i)} y={H - M.b + 22} textAnchor="middle">
                            {monthShort(m)}
                          </text>
                        )))}
                      </g>
                      {hover?.kind === "trend" && (
                        <g className="sg-xh" pointerEvents="none">
                          <line x1={x(hover.i)} x2={x(hover.i)} y1={M.t} y2={y(0)} />
                          {rows.map((r) => (
                            <circle key={r.key} cx={x(hover.i)} cy={y(r.growthSeries[hover.i])} r={4.5} fill={r.color} stroke="#fff" strokeWidth={2} />
                          ))}
                        </g>
                      )}
                      <rect
                        x={M.l}
                        y={M.t}
                        width={pw}
                        height={ph}
                        fill="transparent"
                        onPointerMove={(e) => {
                          const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                          const px = ((e.clientX - r.left) / r.width) * W;
                          const i = n > 1 ? Math.max(0, Math.min(n - 1, Math.round(((px - M.l - PAD_X) / (pw - PAD_X * 2)) * (n - 1)))) : 0;
                          setHover({ kind: "trend", i, x: (x(i) / W) * r.width + 4, y: e.clientY - r.top + 4 });
                        }}
                        onPointerLeave={() => setHover(null)}
                      />
                    </g>

                    {/* Compare */}
                    <g className="g-compare">
                      {rows.map((r, i) => {
                        const cx = M.l + colW * i + colW / 2;
                        const bw = Math.min(68, colW * 0.5);
                        const bx = cx - bw / 2;
                        const by = y(Math.max(r.growth, 0));
                        const bh = y(0) - by;
                        const rad = Math.min(10, bh / 2);
                        return (
                          <g
                            key={r.key}
                            className={cn("sg-bw", sel === r.key && "sel", sel && sel !== r.key && "dim")}
                            tabIndex={mode === "compare" ? 0 : -1}
                            role="button"
                            aria-pressed={sel === r.key}
                            aria-label={`${r.label}: ${pct(r.growth)} growth. Press to highlight.`}
                            onClick={() => toggle(r.key)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggle(r.key);
                              }
                            }}
                            onPointerMove={(e) => {
                              const b = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                              setHover({ kind: "bar", key: r.key, x: e.clientX - b.left + 4, y: e.clientY - b.top + 4 });
                            }}
                            onPointerLeave={() => setHover(null)}
                          >
                            <rect className="sg-hit" x={cx - colW / 2 + 4} y={M.t} width={colW - 8} height={ph + 44} rx={8} />
                            <path
                              className="sg-bar"
                              style={{ "--d": `${i * 70}ms` } as CSSProperties}
                              fill={`url(#${uid}-b-${r.key})`}
                              d={`M${bx},${y(0)} L${bx},${by + rad} Q${bx},${by} ${bx + rad},${by} L${bx + bw - rad},${by} Q${bx + bw},${by} ${bx + bw},${by + rad} L${bx + bw},${y(0)} Z`}
                            />
                            <text className="sg-vlabel" style={{ "--ld": `${0.35 + i * 0.07}s` } as CSSProperties} x={cx} y={by - 9} textAnchor="middle">
                              {pct(r.growth)}
                            </text>
                            <g className="sg-xl">
                              <text className={sel === r.key ? "sg-xsel" : undefined} x={cx} y={H - M.b + 22} textAnchor="middle">
                                {r.label}
                              </text>
                              <text className="sg-sub" x={cx} y={H - M.b + 38} textAnchor="middle">
                                {users(r.trainees)}
                              </text>
                            </g>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                  {hoverTip}
                </>
              )}
            </div>
          </div>

          <aside className="flex flex-col rounded-xl border border-line bg-slate-50 p-4" aria-labelledby="sg-panel">
            <h3 id="sg-panel" className="text-[15px] font-semibold text-ink">
              Growth Since {months[0] ? new Date(`${months[0]}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long" }) : "January"}
            </h3>
            <p className="mb-3 mt-0.5 text-xs text-muted">Select a sector to highlight it in the chart</p>
            <ul className="flex flex-1 flex-col gap-2">
              {rows.map((r) => (
                <li key={r.key}>
                  <button
                    aria-pressed={sel === r.key}
                    onClick={() => toggle(r.key)}
                    className={cn("block w-full rounded-lg border bg-white px-3 py-2.5 text-left transition hover:bg-slate-50", sel === r.key ? "shadow-[0_0_0_1px_var(--c)]" : "border-line", sel && sel !== r.key && "opacity-55")}
                    style={{ "--c": r.color, borderColor: sel === r.key ? r.color : undefined } as CSSProperties}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                        <i className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />
                        {r.label}
                        <small className="whitespace-nowrap text-xs font-normal text-muted">{users(r.trainees)}</small>
                      </span>
                      <span className="text-base font-bold tabular-nums text-ink">{pct(r.growth)}</span>
                    </span>
                    <span className="mt-0.5 flex justify-between text-xs text-muted tabular-nums">
                      <span>{months[0] ? monthShort(months[0]) : "Start"} → Current</span>
                      <span>
                        {r.base.toFixed(1)} → {r.current.toFixed(1)}
                      </span>
                    </span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${r.label} growth relative to the best sector`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, r.growth) / maxGrowth * 100)}>
                      <span className="sg-pb block h-full rounded-full transition-[width] duration-1000" style={{ width: barsReady ? `${(Math.max(0, r.growth) / maxGrowth) * 100}%` : 0, background: r.color }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
      <p className="px-5 pb-4 text-xs text-muted">Growth % = ((Current − {months[0] ? monthShort(months[0]) : "January"}) ÷ {months[0] ? monthShort(months[0]) : "January"}) × 100. One dataset powers both chart modes and this panel.</p>
      <p className="sr-only" role="status" aria-live="polite">
        {mode === "trend" ? "Showing trend line chart" : "Showing sector comparison bar chart"}
      </p>
    </section>
  );
}
