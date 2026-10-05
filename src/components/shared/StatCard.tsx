import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

export function StatCard({ label, value, icon: Icon, tone = 'brand', sub }: {
  label: string; value: string; icon?: LucideIcon; tone?: 'brand' | 'green' | 'red' | 'blue'; sub?: string
}) {
  const t = { brand: 'bg-gradient-to-br from-gold-100 to-gold-200 text-gold-800', green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800', blue: 'bg-brand-100 text-brand-700' }[tone]
  return (
    <div className="card flex items-center gap-3 p-4">
      {Icon && <div className={clsx('rounded-xl p-3', t)}><Icon className="h-5 w-5" /></div>}
      <div className="min-w-0">
        <div className="truncate text-xs text-brand-400">{label}</div>
        <div className="truncate text-lg font-bold text-brand-900">{value}</div>
        {sub && <div className="truncate text-xs text-brand-300">{sub}</div>}
      </div>
    </div>
  )
}
