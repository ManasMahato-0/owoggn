import { useEffect, useState } from 'react'
import { api } from './api'
import { Status } from './components/ui'
import { AccuracyPage } from './pages/AccuracyPage'
import { DecisionPage } from './pages/DecisionPage'
import { useFetch } from './useFetch'

type Tab = 'decision' | 'accuracy'
const TABS: { id: Tab; label: string }[] = [
  { id: 'decision', label: 'Decision view' },
  { id: 'accuracy', label: 'Forecast accuracy' },
]

const tabFromHash = (): Tab => (window.location.hash === '#accuracy' ? 'accuracy' : 'decision')

export default function App() {
  const meta = useFetch(() => api.meta(), [])
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [day, setDay] = useState('2026-01-15')
  const [cutoff, setCutoff] = useState<string | null>(null)

  useEffect(() => {
    window.location.hash = tab
  }, [tab])

  const effectiveCutoff = cutoff ?? meta.data?.default_cutoff ?? '09:00'

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Wind Forecast Monitor</h1>
          <p>GB national wind · day-ahead purchase decisions · January 2026 · source: Elexon BMRS</p>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <Status loading={meta.loading} error={meta.error} />
      {meta.data &&
        (tab === 'decision' ? (
          <DecisionPage meta={meta.data} day={day} setDay={setDay} cutoff={effectiveCutoff} setCutoff={setCutoff} />
        ) : (
          <AccuracyPage cutoff={effectiveCutoff} />
        ))}
    </div>
  )
}
