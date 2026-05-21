import { useEffect, useState } from 'react'
import { Header } from './components/Header'
import { DonutCard } from './components/DonutCard'
import { TrendsCard } from './components/TrendsCard'
import { ImportCard } from './components/ImportCard'
import { RecurringCard } from './components/RecurringCard'
import { Ledger } from './components/Ledger'
import { CategoryManagerModal } from './components/CategoryManagerModal'
import { SettingsModal } from './components/SettingsModal'
import { TransactionModal } from './components/TransactionModal'
import { useStore } from './store/store'
import { useGlobalKeys } from './hooks/useGlobalKeys'

export default function App() {
  const [catOpen, setCatOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)

  const periods = useStore((s) => s.payPeriods)
  const addPayPeriod = useStore((s) => s.addPayPeriod)
  const regenerate = useStore((s) => s.regenerateAllRecurring)
  const theme = useStore((s) => s.settings.theme ?? 'system')

  // Apply the user's chosen theme to <html data-theme>. `system` follows the
  // OS preference and reactively flips when the user changes it (e.g. macOS
  // appearance switching at sunset).
  useEffect(() => {
    const apply = (t: 'light' | 'dark') => {
      document.documentElement.dataset.theme = t
    }
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      apply(mq.matches ? 'dark' : 'light')
      const onChange = (e: MediaQueryListEvent) =>
        apply(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    apply(theme)
  }, [theme])

  useGlobalKeys({
    onNewTransaction: () => setTransactionOpen(true),
    onOpenSettings: () => setSettingsOpen(true),
  })

  // First-run convenience: seed a single pay period so the ledger isn't empty.
  useEffect(() => {
    if (periods.length === 0) {
      addPayPeriod()
    }
    // Ensure recurring instances are up to date on every page load.
    regenerate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-full">
      <Header
        onOpenTransaction={() => setTransactionOpen(true)}
        onOpenCategories={() => setCatOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DonutCard />
          <TrendsCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ImportCard />
          <RecurringCard />
        </div>

        <Ledger />

        <footer className="py-6 text-center text-xs text-muted">
          Niemann Family Finances · Local-only · Your data lives in this browser.
        </footer>
      </main>

      {catOpen && <CategoryManagerModal onClose={() => setCatOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {transactionOpen && (
        <TransactionModal mode="create" onClose={() => setTransactionOpen(false)} />
      )}
    </div>
  )
}
