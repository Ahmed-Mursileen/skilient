"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

/**
 * /ops/metrics charts (PRD 5.26), drawn with Recharts. Colours are the --series-* tokens (fixed
 * order, validated for colour blindness and contrast in both themes); text stays in text tokens.
 * Every chart has a hover tooltip and a table view, so nothing depends on colour alone.
 */

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const AXIS = { stroke: "var(--border-default)", tick: { fill: "var(--text-secondary)", fontSize: 12 }, tickLine: false } as const;
const GRID = { stroke: "var(--border-muted)", strokeDasharray: "0", vertical: false } as const;

type Row = Record<string, string | number>;
export interface Series {
  key: string;
  label: string;
}

function ChartTooltip({ active, payload, label, format }: Partial<TooltipContentProps<number, string>> & { format?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-caption shadow-2">
      <p className="mb-1 font-semibold text-text-primary">{label}</p>
      <ul className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center gap-2 text-text-secondary">
            <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: p.color }} />
            <span>{p.name}</span>
            <span className="ml-auto pl-3 font-semibold text-text-primary tabular-nums">{format ? format(Number(p.value)) : p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LegendRow({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary" aria-hidden>
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: SERIES[i], height: 3 }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** A card: title, the chart (hidden from screen readers) and the same numbers as a table. */
export function ChartCard({ title, subtitle, children, table }: { title: string; subtitle?: string; children: ReactNode; table: { head: string[]; rows: (string | number)[][] } }) {
  return (
    <figure className="flex min-w-0 flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4" data-testid="metric-card">
      <figcaption className="flex flex-col">
        <span className="text-h4 font-semibold">{title}</span>
        {subtitle ? <span className="text-caption text-text-secondary">{subtitle}</span> : null}
      </figcaption>
      <div aria-hidden className="min-w-0">
        {children}
      </div>
      <details className="text-body-sm">
        <summary className="cursor-pointer text-text-secondary underline underline-offset-4">Table view</summary>
        <div className="mt-2 max-h-64 overflow-auto" tabIndex={0} role="region" aria-label={`${title} as a table`}>
          <table className="w-full text-left text-caption">
            <thead className="text-text-secondary">
              <tr>
                {table.head.map((h) => (
                  <th key={h} scope="col" className="py-1 pr-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="py-0.5 pr-3">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Change over time for up to four series: 2px lines, a crosshair tooltip, a legend for two or more. */
export function TrendChart({ data, x, series, height = 220 }: { data: Row[]; x: string; series: Series[]; height?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 ? <LegendRow series={series} /> : null}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey={x} {...AXIS} minTickGap={24} />
          <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={SERIES[i]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--bg-surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Stacked monthly counts: 4px rounded top, a 2px surface gap between segments. */
export function StackedBars({ data, x, series, height = 220 }: { data: Row[]; x: string; series: Series[]; height?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <LegendRow series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="30%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey={x} {...AXIS} />
          <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={SERIES[i]}
              stroke="var(--bg-surface)"
              strokeWidth={2}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
          <Legend content={() => null} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Value formats by name: a server page can't pass a function into this client component. */
const FORMATS = { percent: (v: number) => `${v}%` } as const;

/** One measure per labelled row (universities): horizontal bars, single series, value in the tooltip. */

export function RankedBars({ data, label, value, name, unit, height }: { data: Row[]; label: string; value: string; name: string; unit?: keyof typeof FORMATS; height?: number }) {
  const format = unit ? FORMATS[unit] : undefined;
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 30 + 24)}>
      <BarChart accessibilityLayer={false} data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }} barCategoryGap={6}>
        <CartesianGrid {...GRID} horizontal={false} vertical />
        <XAxis type="number" {...AXIS} allowDecimals={false} tickFormatter={format} />
        <YAxis type="category" dataKey={label} {...AXIS} axisLine={false} width={150} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
        <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "var(--bg-subtle)" }} />
        <Bar dataKey={value} name={name} fill={SERIES[0]} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A small multiple: one queue's backlog over time, with the current count as the headline. */
export function Sparkline({ data, x, y, name }: { data: Row[]; x: string; y: string; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={56}>
      <LineChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <XAxis dataKey={x} hide />
        <YAxis hide allowDecimals={false} domain={[0, "dataMax + 1"]} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} />
        <Line type="monotone" dataKey={y} name={name} stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
