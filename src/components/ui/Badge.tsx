import clsx from 'clsx'
import type { Tone } from '@/lib/status'

const tones: Record<Tone, string> = {
  gray: 'bg-cream-200 text-brand-600', blue: 'bg-sky-100 text-sky-700', green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', purple: 'bg-violet-100 text-violet-700',
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={clsx('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>
}

export function StatusBadge({ map, value }: { map: Record<string, [string, Tone]>; value: string }) {
  const [label, tone] = map[value] ?? [value, 'gray' as Tone]
  return <Badge tone={tone}>{label}</Badge>
}
