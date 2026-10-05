import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { TrendingUp, ReceiptText, ShoppingBag, Wallet, Coins, Users, Scale } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts'
import { supabase } from '@/lib/supabase'
import { usePermission } from '@/hooks/usePermission'
import { useBranches } from '@/hooks/useLookups'
import { fmtMoney, fmtNum, toISODate } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { BranchSelect } from '@/components/shared/BranchSelect'
import { Select, Input } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

function range(p: Period, from: string, to: string) {
  const now = new Date()
  const end = new Date(now)
  const start = new Date(now)
  if (p === 'week') start.setDate(now.getDate() - 6)
  else if (p === 'month') start.setDate(1)
  else if (p === 'year') { start.setMonth(0); start.setDate(1) }
  else if (p === 'custom') return { from: from || toISODate(now), to: to || toISODate(now) }
  return { from: toISODate(start), to: toISODate(end) }
}

export default function DashboardPage() {
  const { seesAllBranches, can } = usePermission()
  const { data: branches } = useBranches()
  const [period, setPeriod] = useState<Period>('month')
  const [cFrom, setCFrom] = useState('')
  const [cTo, setCTo] = useState('')
  const [branchId, setBranchId] = useState('')
  const r = useMemo(() => range(period, cFrom, cTo), [period, cFrom, cTo])

  const kpis = useQuery({
    queryKey: ['dash-kpis', branchId],
    queryFn: async () => {
      let q = supabase.from('v_dashboard_kpis').select('*')
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const daily = useQuery({
    queryKey: ['dash-daily', branchId, r.from, r.to],
    queryFn: async () => {
      let q = supabase.from('v_sales_daily').select('*').gte('day', r.from).lte('day', r.to)
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const top = useQuery({
    queryKey: ['dash-top', branchId],
    queryFn: async () => {
      let q = supabase.from('v_top_products').select('*').order('qty_sold', { ascending: false }).limit(60)
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (error) throw error
      const m = new Map<string, { name: string; qty: number; revenue: number }>()
      data?.forEach((x) => {
        const c = m.get(x.product_id) ?? { name: x.product_name, qty: 0, revenue: 0 }
        c.qty += Number(x.qty_sold); c.revenue += Number(x.revenue); m.set(x.product_id, c)
      })
      return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, 6)
    },
  })

  const low = useQuery({
    queryKey: ['dash-low', branchId],
    queryFn: async () => {
      let q = supabase.from('v_low_stock').select('product_name,branch_name,qty_on_hand,is_out').limit(8)
      if (branchId) q = q.eq('branch_id', branchId)
      const { data } = await q
      return data ?? []
    },
  })

  const staff = useQuery({
    queryKey: ['dash-staff', branchId],
    queryFn: async () => {
      const month = toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
      let q = supabase.from('v_sales_by_employee').select('*').eq('month', month).order('total_sales', { ascending: false }).limit(6)
      if (branchId) q = q.eq('branch_id', branchId)
      const { data } = await q
      return data ?? []
    },
  })

  const k = useMemo(() => {
    const rows = kpis.data ?? []
    const sum = (f: string) => rows.reduce((s, x: any) => s + Number(x[f] ?? 0), 0)
    return {
      salesMonth: sum('sales_month'), purchases: sum('purchases_month'), expenses: sum('expenses_month'),
      stock: sum('stock_value'), due: sum('customers_due'), branchBal: sum('branch_balance'),
      branchesCount: rows.filter((x: any) => x.type === 'branch').length,
    }
  }, [kpis.data])

  const salesPeriod = (daily.data ?? []).reduce((s, x: any) => s + Number(x.total), 0)
  const invoices = (daily.data ?? []).reduce((s, x: any) => s + Number(x.invoices_count), 0)
  const today = toISODate(new Date())
  const salesToday = (kpis.data ?? []).reduce((s, x: any) => s + Number(x.sales_today ?? 0), 0)

  // سلسلة المبيعات اليومية
  const series = useMemo(() => {
    const m = new Map<string, number>()
    daily.data?.forEach((x: any) => m.set(x.day, (m.get(x.day) ?? 0) + Number(x.total)))
    return [...m.entries()].sort().map(([day, total]) => ({ day: day.slice(5), total }))
  }, [daily.data])

  // مقارنة الفروع
  const byBranch = useMemo(() => {
    const m = new Map<string, number>()
    daily.data?.forEach((x: any) => m.set(x.branch_id, (m.get(x.branch_id) ?? 0) + Number(x.total)))
    return [...m.entries()].map(([id, total]) => ({ name: branches?.find((b) => b.id === id)?.name ?? '—', total }))
  }, [daily.data, branches])

  const salesMinusExpenses = k.salesMonth - k.expenses // مؤشر تقريبي؛ التفصيل في صفحة الأرباح والخسائر

  return (
    <>
      <PageHeader title="لوحة التحكم" subtitle={`الفترة: ${r.from} → ${r.to}`}
        actions={<>
          <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="w-36">
            <option value="today">اليوم</option><option value="week">الأسبوع</option><option value="month">الشهر</option>
            <option value="year">السنة</option><option value="custom">فترة مخصصة</option>
          </Select>
          {period === 'custom' && <><Input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className="w-40" /><Input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className="w-40" /></>}
          {seesAllBranches && <BranchSelect includeAll value={branchId} onChange={setBranchId} className="w-44" />}
        </>} />

      {kpis.isLoading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="مبيعات اليوم" value={fmtMoney(salesToday)} icon={TrendingUp} tone="green" sub={today} />
            <StatCard label="مبيعات الفترة" value={fmtMoney(salesPeriod)} icon={ReceiptText} sub={`${fmtNum(invoices)} فاتورة`} />
            <StatCard label="مشتريات الشهر" value={fmtMoney(k.purchases)} icon={ShoppingBag} tone="blue" />
            <StatCard label="مصروفات الشهر" value={fmtMoney(k.expenses)} icon={Wallet} tone="red" />
            <StatCard label="مبيعات الشهر" value={fmtMoney(k.salesMonth)} icon={TrendingUp} tone="green" sub={`بعد المصروفات: ${fmtMoney(salesMinusExpenses)}`} />
            <StatCard label="قيمة المخزون" value={fmtMoney(k.stock)} icon={Coins} />
            <StatCard label="مستحقات على العملاء" value={fmtMoney(k.due)} icon={Users} tone="red" />
            <StatCard label={seesAllBranches ? 'مستحقات على الفروع' : 'رصيد الفرع مع الإدارة'} value={fmtMoney(k.branchBal)} icon={Scale} tone="blue" sub={seesAllBranches ? `${k.branchesCount} فرع` : undefined} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="card p-4 lg:col-span-2">
              <h3 className="mb-3 text-sm font-bold">حركة المبيعات خلال الفترة</h3>
              <div className="h-64" dir="ltr">
                <ResponsiveContainer>
                  <LineChart data={series}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="day" fontSize={11} /><YAxis fontSize={11} width={60} />
                    <Tooltip formatter={(v: number) => fmtMoney(v)} /><Line type="monotone" dataKey="total" stroke="#a9842f" strokeWidth={2.5} dot={false} /></LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold">مقارنة مبيعات الفروع</h3>
              <div className="h-64" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={byBranch} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" width={80} fontSize={11} />
                    <Tooltip formatter={(v: number) => fmtMoney(v)} /><Bar dataKey="total" fill="#c9a24b" radius={[0, 4, 4, 0]} /></BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <ListCard title="المنتجات الأكثر مبيعاً" empty={!top.data?.length}>
              {top.data?.map((p) => <Row key={p.name} a={p.name} b={`${fmtNum(p.qty)} قطعة`} c={fmtMoney(p.revenue)} />)}
            </ListCard>
            <ListCard title="منتجات منخفضة المخزون" empty={!low.data?.length} link={can('inventory') ? { to: '/inventory/main', label: 'عرض المخزن' } : undefined}>
              {low.data?.map((p: any, i) => (
                <div key={i} className="flex items-center justify-between py-2 text-sm"><span>{p.product_name}<span className="block text-xs text-stone-400">{p.branch_name}</span></span><Badge tone={p.is_out ? 'red' : 'amber'}>{fmtNum(p.qty_on_hand)}</Badge></div>
              ))}
            </ListCard>
            <ListCard title="أداء موظفي المبيعات (الشهر)" empty={!staff.data?.length}>
              {staff.data?.map((s: any, i) => <Row key={i} a={s.full_name ?? '—'} b={`${fmtNum(s.invoices_count)} فاتورة`} c={fmtMoney(s.total_sales)} />)}
            </ListCard>
          </div>
        </>
      )}
    </>
  )
}

function ListCard({ title, children, empty, link }: { title: string; children: React.ReactNode; empty?: boolean; link?: { to: string; label: string } }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">{title}</h3>{link && <Link className="text-xs text-brand-700" to={link.to}>{link.label}</Link>}</div>
      <div className="divide-y divide-cream-200">{empty ? <div className="py-8 text-center text-sm text-stone-400">لا توجد بيانات</div> : children}</div>
    </div>
  )
}
const Row = ({ a, b, c }: { a: string; b: string; c: string }) => (
  <div className="flex items-center justify-between py-2 text-sm"><span>{a}<span className="block text-xs text-stone-400">{b}</span></span><b>{c}</b></div>
)
