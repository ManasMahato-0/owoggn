import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, type DayResponse, type Meta } from '../api'
import { ChartTooltip, Card, Kpi, Status } from '../components/ui'
import { dayTime, gw, hhmm, mw, signedMw } from '../format'
import { useFetch } from '../useFetch'

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  return `${h}:${i % 2 ? '30' : '00'}`
})

interface Props {
  meta: Meta
  day: string
  setDay: (d: string) => void
  cutoff: string
  setCutoff: (c: string) => void
}

export function DecisionPage({ meta, day, setDay, cutoff, setCutoff }: Props) {
  const { data, error, loading } = useFetch(() => api.day(day, cutoff), [day, cutoff])
  const publishSlots = new Set(meta.publish_times_per_day)

  return (
    <>
      <div className="controls">
        <label>
          Delivery day
          <input
            type="date"
            value={day}
            min={meta.first_delivery_day}
            max={meta.last_delivery_day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
        </label>
        <label>
          Decision cutoff (day before, UK time)
          <select value={cutoff} onChange={(e) => setCutoff(e.target.value)}>
            {HALF_HOURS.map((t) => (
              <option key={t} value={t}>
                {t}
                {publishSlots.has(t) ? '  · new forecast' : ''}
              </option>
            ))}
          </select>
        </label>
        <span className="hint">
          Shows the most recent wind forecast published before your cutoff, exactly what was on screen
          when the day-ahead purchase was made.
        </span>
      </div>

      <Status loading={loading && !data} error={error} />
      {data && <DayContent data={data} />}
    </>
  )
}

function DayContent({ data }: { data: DayResponse }) {
  const rows = data.rows
  const energyMwh = rows.reduce((s, r) => s + r.forecast, 0)
  const avgForecast = rows.length ? energyMwh / rows.length : null
  const staleH = data.latest_publish
    ? (new Date(data.cutoff).getTime() - new Date(data.latest_publish).getTime()) / 3.6e6
    : null
  const adjusted = avgForecast != null && data.month_bias_mw != null ? avgForecast - data.month_bias_mw : null

  const chartData = rows.map((r) => ({
    t: hhmm(r.start_time),
    start: r.start_time,
    forecast: r.forecast,
    actual: r.actual,
    band: [r.band_low, r.band_high] as [number, number],
  }))

  return (
    <>
      <div className="kpis">
        <Kpi
          label="Forecast wind for the day"
          value={`${(energyMwh / 1000).toFixed(0)} GWh`}
          sub={`avg ${gw(avgForecast)} across 24h`}
        />
        <Kpi
          label="Forecast used"
          value={data.latest_publish ? hhmm(data.latest_publish) : '–'}
          sub={
            data.latest_publish
              ? `published ${dayTime(data.latest_publish)} · ${staleH?.toFixed(1)}h before cutoff`
              : 'no forecast before cutoff'
          }
        />
        <Kpi
          label="Bias-adjusted expectation"
          value={gw(adjusted)}
          sub={`forecast minus Jan bias of ${signedMw(data.month_bias_mw)}`}
        />
        <Kpi
          label="Suggested extra cover (P90)"
          value={mw(data.buffer_p90_mw)}
          sub="wind fell further short than this in only 10% of January hours"
        />
      </div>

      <Card
        title="Wind generation: forecast at cutoff vs actual"
        desc="Shaded band = likely range of actual wind (P10–P90), from January forecast errors at this cutoff. Actual shown for review after the fact."
      >
        <Legend />
        <div style={{ height: 340 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} interval={2} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
              <YAxis
                tickFormatter={(v: number) => (v / 1000).toFixed(1)}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={44}
                label={{ value: 'GW', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }}
              />
              <Tooltip
                cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as (typeof chartData)[number] | undefined
                  if (!active || !p) return null
                  return (
                    <ChartTooltip
                      title={dayTime(p.start)}
                      items={[
                        { label: 'Forecast', value: mw(p.forecast), color: 'var(--series-forecast)' },
                        { label: 'Likely range', value: `${gw(p.band[0])} – ${gw(p.band[1])}`, color: 'var(--band)' },
                        { label: 'Actual', value: mw(p.actual), color: 'var(--series-actual)' },
                        { label: 'Shortfall vs forecast', value: p.actual == null ? '–' : signedMw(p.forecast - p.actual) },
                      ]}
                    />
                  )
                }}
              />
              <Area dataKey="band" stroke="none" fill="var(--band)" isAnimationActive={false} />
              <Line dataKey="forecast" stroke="var(--series-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="actual" stroke="var(--series-actual)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Hourly detail" desc={`Day error: MAE ${mw(data.metrics.mae)}, bias ${signedMw(data.metrics.bias)} (positive = wind short of forecast).`}>
        <details>
          <summary>Show table</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>Forecast</th>
                  <th>P10–P90 range</th>
                  <th>Actual</th>
                  <th>Shortfall</th>
                  <th>Lead time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.start_time}>
                    <td>{hhmm(r.start_time)}</td>
                    <td>{mw(r.forecast)}</td>
                    <td>
                      {gw(r.band_low)} – {gw(r.band_high)}
                    </td>
                    <td>{mw(r.actual)}</td>
                    <td>{signedMw(r.error)}</td>
                    <td>{r.horizon_h.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
    </>
  )
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, flexWrap: 'wrap' }}>
      <span><span className="swatch" style={{ background: 'var(--series-forecast)' }} /> Forecast at cutoff</span>
      <span><span className="swatch" style={{ background: 'var(--band)' }} /> Likely range (P10–P90)</span>
      <span><span className="swatch" style={{ background: 'var(--series-actual)' }} /> Actual (after the fact)</span>
    </div>
  )
}
