import type { ReactNode } from 'react'

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Card({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {desc && <p className="desc">{desc}</p>}
      {children}
    </section>
  )
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <div className="status error">{error}</div>
  if (loading) return <div className="status">Loading…</div>
  return null
}

export interface TooltipItem {
  label: string
  value: string
  color?: string
}

export function ChartTooltip({ title, items }: { title: string; items: TooltipItem[] }) {
  return (
    <div className="tooltip">
      <div className="t">{title}</div>
      {items.map((it) => (
        <div className="row" key={it.label}>
          {it.color && <span className="swatch" style={{ background: it.color }} />}
          {it.label}
          <b>{it.value}</b>
        </div>
      ))}
    </div>
  )
}
