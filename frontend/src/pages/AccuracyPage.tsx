import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, type AccuracyResponse, type HorizonMetrics } from '../api'
import { ChartTooltip, Card, Kpi, Status } from '../components/ui'
import { gw, mw, pct, signedMw } from '../format'
import { useFetch } from '../useFetch'

const axisTick = { fill: 'var(--text-muted)', fontSize: 12 }
const gwTick = (v: number) => `${(v / 1000).toFixed(1)}`

export function AccuracyPage({ cutoff }: { cutoff: string }) {
  const acc = useFetch(() => api.accuracy(cutoff), [cutoff])
  const hor = useFetch(() => api.horizon(), [])

  return (
    <>
      <Status loading={acc.loading && !acc.data} error={acc.error ?? hor.error} />
      {acc.data && <Summary data={acc.data} />}
      {hor.data && <HorizonChart data={hor.data} cutoff={cutoff} />}
      {acc.data && (
        <div className="grid-2">
          <ByHourChart data={acc.data} />
          <HistogramChart data={acc.data} />
        </div>
      )}
    </>
  )
}

function Summary({ data }: { data: AccuracyResponse }) {
  const m = data.metrics
  return (
    <>
      <div className="insight">
        <strong>Takeaway for January 2026 (cutoff {data.cutoff} D-1):</strong> wind came in on average{' '}
        <strong>{gw(m.bias)}</strong> below the forecast the desk had at decision time. Typical error was{' '}
        {pct(m.nmae_pct)} of output. To be covered in 90% of hours, plan for about{' '}
        <strong>{mw(m.p90)}</strong> of additional procurement beyond the forecast.
        {(m.bias ?? 0) > 0 &&
          ' A large part of that gap is systematic over-forecasting, so correcting for bias is the first, cheapest win.'}
      </div>
      <div className="kpis">
        <Kpi label="Mean absolute error" value={mw(m.mae)} sub={`${pct(m.nmae_pct)} of mean output ${gw(m.mean_actual)}`} />
        <Kpi label="RMSE" value={mw(m.rmse)} sub="penalises large misses" />
        <Kpi label="Bias" value={signedMw(m.bias)} sub="positive = wind short of forecast" />
        <Kpi label="P90 shortfall" value={mw(m.p90)} sub={`P10 ${signedMw(m.p10)} · worst ${signedMw(m.max_over)}`} />
        <Kpi label="Hours evaluated" value={m.n} sub="31 delivery days × 24h" />
      </div>
    </>
  )
}

function HorizonChart({ data, cutoff }: { data: HorizonMetrics[]; cutoff: string }) {
  const [h, mm] = cutoff.split(':').map(Number)
  const c = h + mm / 60
  // Delivery day spans 24-c .. 47-c hours after a D-1 cutoff at c.
  const winStart = Math.max(0, 24 - c)
  const winEnd = Math.min(48, 47 - c)

  return (
    <Card
      title="Error grows with forecast lead time"
      desc="Each point: every January delivery hour scored with the latest forecast published at least that many hours earlier. Shaded = the lead times your cutoff actually uses."
    >
      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
        <span><span className="swatch" style={{ background: 'var(--series-forecast)' }} /> MAE</span>
        <span><span className="swatch" style={{ background: 'var(--series-actual)' }} /> Bias</span>
      </div>
      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <ReferenceArea x1={winStart} x2={winEnd} fill="var(--band)" stroke="none" ifOverflow="hidden" />
            <XAxis
              dataKey="horizon_h"
              type="number"
              domain={[0, 48]}
              ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: 'var(--grid)' }}
              label={{ value: 'Hours ahead', position: 'insideBottom', offset: -10, fill: 'var(--text-muted)', fontSize: 12 }}
            />
            <YAxis tickFormatter={gwTick} tick={axisTick} tickLine={false} axisLine={false} width={40} label={{ value: 'GW', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as HorizonMetrics | undefined
                if (!active || !p) return null
                return (
                  <ChartTooltip
                    title={`${p.horizon_h}h ahead`}
                    items={[
                      { label: 'MAE', value: mw(p.mae), color: 'var(--series-forecast)' },
                      { label: 'Bias', value: signedMw(p.bias), color: 'var(--series-actual)' },
                      { label: 'nMAE', value: pct(p.nmae_pct) },
                      { label: 'Hours scored', value: String(p.n) },
                    ]}
                  />
                )
              }}
            />
            <Line dataKey="mae" stroke="var(--series-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="bias" stroke="var(--series-actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function ByHourChart({ data }: { data: AccuracyResponse }) {
  return (
    <Card title="Mean absolute error by hour of day" desc="Which delivery hours carry the most forecast risk.">
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data.by_hour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="hour" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} interval={2} tickFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`} />
            <YAxis tickFormatter={gwTick} tick={axisTick} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ fill: 'var(--grid)' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as AccuracyResponse['by_hour'][number] | undefined
                if (!active || !p) return null
                return (
                  <ChartTooltip
                    title={`${String(p.hour).padStart(2, '0')}:00`}
                    items={[
                      { label: 'MAE', value: mw(p.mae), color: 'var(--series-forecast)' },
                      { label: 'Bias', value: signedMw(p.bias) },
                      { label: 'P90 shortfall', value: mw(p.p90) },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="mae" fill="var(--series-forecast)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function HistogramChart({ data }: { data: AccuracyResponse }) {
  const p90 = data.metrics.p90 ?? 0
  const bins = data.histogram.map((b) => ({ ...b, mid: (b.bin_start + b.bin_end) / 2 }))
  return (
    <Card title="Distribution of forecast errors" desc="Right of zero = wind short of forecast. Dashed line = P90 cover level.">
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ top: 8, right: 8, left: 0, bottom: 16 }} barCategoryGap={1}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="mid"
              type="number"
              domain={['dataMin - 250', 'dataMax + 250']}
              tickFormatter={gwTick}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: 'var(--grid)' }}
              label={{ value: 'Forecast − actual (GW)', position: 'insideBottom', offset: -10, fill: 'var(--text-muted)', fontSize: 12 }}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
            <ReferenceLine x={0} stroke="var(--text-muted)" />
            <ReferenceLine x={p90} stroke="var(--series-actual)" strokeDasharray="4 3" />
            <Tooltip
              cursor={{ fill: 'var(--grid)' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof bins)[number] | undefined
                if (!active || !p) return null
                return (
                  <ChartTooltip
                    title={`${signedMw(p.bin_start)} to ${signedMw(p.bin_end)}`}
                    items={[{ label: 'Hours', value: String(p.count), color: 'var(--series-forecast)' }]}
                  />
                )
              }}
            />
            <Bar dataKey="count" fill="var(--series-forecast)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
