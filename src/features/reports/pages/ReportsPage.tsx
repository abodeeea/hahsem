import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  TrendingUp,
  FileText,
  DollarSign,
  Package,
  Users,
  Building2,
  Download,
  Printer,
  Search,
  ArrowDownRight,
  Layers,
  AlertTriangle,
  Coins,
} from 'lucide-react'
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/store/auth.store'
import { fmtMoney, fmtNum, fmtDate } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { BranchSelect } from '@/components/shared/BranchSelect'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'

type ReportTab = 'sales_daily' | 'top_products' | 'employee_sales' | 'stock_status' | 'branch_pnl' | 'suppliers' | 'customers'

export default function ReportsPage() {
  const { seesAllBranches } = usePermission()
  const userBranchId = useAuth((s) => s.profile?.branch_id) ?? ''

  const todayStr = new Date().toISOString().slice(0, 10)
  const firstDayOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

  const [activeTab, setActiveTab] = useState<ReportTab>('sales_daily')
  const [branchFilter, setBranchFilter] = useState(seesAllBranches ? '' : userBranchId)
  const [fromDate, setFromDate] = useState(firstDayOfMonth)
  const [toDate, setToDate] = useState(todayStr)
  const [searchQuery, setSearchQuery] = useState('')

  // 1. Sales Daily & Periodic Report
  const { data: salesDaily = [], isLoading: loadingSales } = useQuery({
    queryKey: ['report_sales_daily', branchFilter, fromDate, toDate],
    enabled: activeTab === 'sales_daily',
    queryFn: async () => {
      let q = supabase
        .from('v_sales_daily')
        .select('*')
        .gte('day', fromDate)
        .lte('day', toDate)
        .order('day', { ascending: false })

      if (branchFilter) q = q.eq('branch_id', branchFilter)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // 2. Top Products Report
  const { data: topProducts = [], isLoading: loadingTopProducts } = useQuery({
    queryKey: ['report_top_products', branchFilter],
    enabled: activeTab === 'top_products',
    queryFn: async () => {
      let q = supabase
        .from('v_top_products')
        .select('*')
        .order('revenue', { ascending: false })
        .limit(100)

      if (branchFilter) q = q.eq('branch_id', branchFilter)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // 3. Employee Sales Report
  const { data: employeeSales = [], isLoading: loadingEmployeeSales } = useQuery({
    queryKey: ['report_employee_sales', branchFilter],
    enabled: activeTab === 'employee_sales',
    queryFn: async () => {
      let q = supabase
        .from('v_sales_by_employee')
        .select('*')
        .order('total_sales', { ascending: false })

      if (branchFilter) q = q.eq('branch_id', branchFilter)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // 4. Stock Status Report
  const { data: stockStatus = [], isLoading: loadingStock } = useQuery({
    queryKey: ['report_stock_status', branchFilter],
    enabled: activeTab === 'stock_status',
    queryFn: async () => {
      let q = supabase
        .from('v_stock_status')
        .select('*')
        .order('stock_value', { ascending: false })

      if (branchFilter) q = q.eq('branch_id', branchFilter)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // 5. Branch P&L Report
  const { data: branchPnl = [], isLoading: loadingPnl } = useQuery({
    queryKey: ['report_branch_pnl', branchFilter],
    enabled: activeTab === 'branch_pnl',
    queryFn: async () => {
      let q = supabase
        .from('v_branch_pnl')
        .select('*, branch:branches(name)')
        .order('month', { ascending: false })

      if (branchFilter) q = q.eq('branch_id', branchFilter)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // 6. Suppliers Balances
  const { data: supplierBalances = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: ['report_supplier_balances'],
    enabled: activeTab === 'suppliers',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_supplier_balance')
        .select('*')
        .order('balance', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  // 7. Customers Balances
  const { data: customerBalances = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ['report_customer_balances'],
    enabled: activeTab === 'customers',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_customer_balance')
        .select('*')
        .order('balance_due', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  // Export CSV helper
  const exportCsv = (filename: string, headers: string[], rows: any[][]) => {
    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))].join(
        '\n'
      )
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename}_${todayStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // --- TAB 1: Sales Daily Columns ---
  const salesColumns: Column<any>[] = [
    { key: 'day', header: 'التاريخ', render: (r) => <span className="font-bold text-stone-900">{fmtDate(r.day)}</span> },
    { key: 'invoices_count', header: 'عدد الفواتير', render: (r) => <span>{fmtNum(r.invoices_count)} فاتورة</span> },
    { key: 'subtotal', header: 'المبيعات قبل الخصم', render: (r) => fmtMoney(r.subtotal) },
    { key: 'discount', header: 'الخصومات', render: (r) => <span className="text-amber-700">{fmtMoney(r.discount)}</span> },
    { key: 'tax', header: 'ضريبة القيمة المضافة', render: (r) => fmtMoney(r.tax) },
    { key: 'total', header: 'صافي المبيعات (شامل الضريبة)', render: (r) => <span className="font-bold text-emerald-700 text-base">{fmtMoney(r.total)}</span> },
  ]

  // --- TAB 2: Top Products Columns ---
  const topProductColumns: Column<any>[] = [
    { key: 'product_name', header: 'المنتج', render: (r) => <span className="font-bold text-stone-900">{r.product_name}</span> },
    { key: 'qty_sold', header: 'الكمية المباعة', render: (r) => <span className="font-semibold">{fmtNum(r.qty_sold)}</span> },
    { key: 'revenue', header: 'إجمالي الإيراد', render: (r) => <span className="font-bold text-emerald-700">{fmtMoney(r.revenue)}</span> },
    { key: 'gross_margin', header: 'مجمل الربح (الهامش)', render: (r) => <span className="font-bold text-brand-700">{fmtMoney(r.gross_margin)}</span> },
  ]

  // --- TAB 3: Employee Sales Columns ---
  const employeeSalesColumns: Column<any>[] = [
    { key: 'full_name', header: 'الموظف / البائع', render: (r) => <span className="font-bold text-stone-900">{r.full_name || 'غير محدد'}</span> },
    { key: 'month', header: 'الشهر', render: (r) => fmtDate(r.month) },
    { key: 'invoices_count', header: 'عدد الفواتير', render: (r) => <span>{fmtNum(r.invoices_count)}</span> },
    { key: 'total_sales', header: 'إجمالي المبيعات', render: (r) => <span className="font-bold text-emerald-700 text-base">{fmtMoney(r.total_sales)}</span> },
  ]

  // --- TAB 4: Stock Status Columns ---
  const stockColumns: Column<any>[] = [
    { key: 'product_name', header: 'المنتج', render: (r) => <div><div className="font-bold text-stone-900">{r.product_name}</div><div className="text-xs text-stone-400">{r.sku}</div></div> },
    { key: 'branch_name', header: 'الفرع', render: (r) => <span>{r.branch_name}</span> },
    { key: 'qty_on_hand', header: 'الرصيد الفعلي', render: (r) => <Badge tone={r.is_out ? 'red' : r.is_low ? 'amber' : 'green'}>{fmtNum(r.qty_on_hand)}</Badge> },
    { key: 'qty_available', header: 'المتاح للبيع', render: (r) => <span className="font-bold">{fmtNum(r.qty_available)}</span> },
    { key: 'avg_cost', header: 'متوسط التكلفة', render: (r) => fmtMoney(r.avg_cost) },
    { key: 'stock_value', header: 'قيمة المخزون', render: (r) => <span className="font-bold text-stone-900">{fmtMoney(r.stock_value)}</span> },
  ]

  // --- TAB 5: Branch P&L Columns ---
  const pnlColumns: Column<any>[] = [
    { key: 'month', header: 'الشهر', render: (r) => <span className="font-bold text-stone-900">{fmtDate(r.month)}</span> },
    { key: 'branch', header: 'الفرع', render: (r) => <span>{r.branch?.name || '—'}</span> },
    { key: 'net_sales', header: 'صافي المبيعات', render: (r) => fmtMoney(r.net_sales) },
    { key: 'cogs', header: 'تكلفة البضاعة المباعة', render: (r) => <span className="text-rose-700">{fmtMoney(r.cogs)}</span> },
    { key: 'gross_profit', header: 'مجمل الربح', render: (r) => <span className="font-semibold text-brand-700">{fmtMoney(r.gross_profit)}</span> },
    { key: 'total_expenses', header: 'المصروفات', render: (r) => <span className="text-rose-700">{fmtMoney(r.total_expenses)}</span> },
    { key: 'other_income', header: 'إيرادات أخرى', render: (r) => <span className="text-emerald-700">+{fmtMoney(r.other_income)}</span> },
    {
      key: 'net_profit',
      header: 'صافي الربح النهائي',
      render: (r) => (
        <span className={`font-bold text-base ${Number(r.net_profit) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          {fmtMoney(r.net_profit)}
        </span>
      ),
    },
  ]

  // --- TAB 6: Supplier Balances Columns ---
  const supplierColumns: Column<any>[] = [
    { key: 'name', header: 'المورد', render: (r) => <span className="font-bold text-stone-900">{r.name}</span> },
    { key: 'phone', header: 'الهاتف', render: (r) => <span dir="ltr">{r.phone || '—'}</span> },
    { key: 'total_purchases', header: 'إجمالي المشتريات', render: (r) => fmtMoney(r.total_purchases) },
    { key: 'total_paid', header: 'المسدد للمورد', render: (r) => <span className="text-emerald-700">{fmtMoney(r.total_paid)}</span> },
    { key: 'total_returns', header: 'المرتجعات', render: (r) => fmtMoney(r.total_returns) },
    { key: 'balance', header: 'الرصيد المستحق للمورد', render: (r) => <span className="font-bold text-rose-700 text-base">{fmtMoney(r.balance)}</span> },
  ]

  // --- TAB 7: Customer Balances Columns ---
  const customerColumns: Column<any>[] = [
    { key: 'name', header: 'العميل', render: (r) => <span className="font-bold text-stone-900">{r.name}</span> },
    { key: 'phone', header: 'الهاتف', render: (r) => <span dir="ltr">{r.phone || '—'}</span> },
    { key: 'total_sales', header: 'إجمالي المبيعات', render: (r) => fmtMoney(r.total_sales) },
    { key: 'total_paid', header: 'المحصل من العميل', render: (r) => <span className="text-emerald-700">{fmtMoney(r.total_paid)}</span> },
    { key: 'balance_due', header: 'المديونية المتبقية (لنا)', render: (r) => <span className="font-bold text-amber-800 text-base">{fmtMoney(r.balance_due)}</span> },
  ]

  // Summary Metrics per active tab
  const totalDailySales = salesDaily.reduce((s, r) => s + Number(r.total || 0), 0)
  const totalDailyInvoices = salesDaily.reduce((s, r) => s + Number(r.invoices_count || 0), 0)
  const totalDailyTax = salesDaily.reduce((s, r) => s + Number(r.tax || 0), 0)

  const totalStockVal = stockStatus.reduce((s, r) => s + Number(r.stock_value || 0), 0)
  const lowStockCount = stockStatus.filter((r) => r.is_low || r.is_out).length

  const totalNetProfit = branchPnl.reduce((s, r) => s + Number(r.net_profit || 0), 0)

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="مركز التقارير والتحليلات"
        subtitle="تقارير مالية، مخزنية، مبيعات، أرباح وخسائر وإقرارات ضريبية شاملة"
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4 ml-1 inline" /> طباعة التقرير
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (activeTab === 'sales_daily') {
                  exportCsv('sales_report', ['التاريخ', 'الفواتير', 'المبيعات', 'الخصم', 'الضريبة', 'الإجمالي'], salesDaily.map((r) => [r.day, r.invoices_count, r.subtotal, r.discount, r.tax, r.total]))
                } else if (activeTab === 'top_products') {
                  exportCsv('top_products', ['المنتج', 'الكمية المباعة', 'الإيراد', 'الهامش'], topProducts.map((r) => [r.product_name, r.qty_sold, r.revenue, r.gross_margin]))
                } else if (activeTab === 'stock_status') {
                  exportCsv('stock_report', ['المنتج', 'الفرع', 'الرصيد', 'المتاح', 'التكلفة', 'القيمة'], stockStatus.map((r) => [r.product_name, r.branch_name, r.qty_on_hand, r.qty_available, r.avg_cost, r.stock_value]))
                } else if (activeTab === 'branch_pnl') {
                  exportCsv('pnl_report', ['الشهر', 'الفرع', 'صافي المبيعات', 'التكلفة', 'مجمل الربح', 'المصروفات', 'إيرادات أخرى', 'صافي الربح'], branchPnl.map((r) => [r.month, r.branch?.name, r.net_sales, r.cogs, r.gross_profit, r.total_expenses, r.other_income, r.net_profit]))
                }
              }}
            >
              <Download className="h-4 w-4 ml-1 inline" /> تصدير Excel (CSV)
            </Button>
          </div>
        }
      />

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        {[
          { id: 'sales_daily', label: 'المبيعات اليومية والدورية', icon: BarChart3 },
          { id: 'top_products', label: 'الأصناف الأكثر مبيعاً', icon: TrendingUp },
          { id: 'employee_sales', label: 'مبيعات الموظفين', icon: Users },
          { id: 'stock_status', label: 'تقييم المخزون والنواقص', icon: Package },
          { id: 'branch_pnl', label: 'الأرباح والخسائر (P&L)', icon: DollarSign },
          { id: 'suppliers', label: 'كشف أرصدة الموردين', icon: Building2 },
          { id: 'customers', label: 'مديونيات العملاء', icon: Users },
        ].map((t) => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as ReportTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                isActive
                  ? 'bg-brand-900 text-white shadow-sm'
                  : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          {seesAllBranches && (
            <div className="w-48">
              <BranchSelect
                value={branchFilter}
                onChange={setBranchFilter}
                includeAll
              />
            </div>
          )}

          {activeTab === 'sales_daily' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500">من:</span>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-36 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500">إلى:</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-36 text-xs"
                />
              </div>
            </>
          )}

          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              placeholder="بحث في نتائج التقرير..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9"
            />
          </div>
        </div>
      </div>

      {/* KPI Highlights based on Tab */}
      {activeTab === 'sales_daily' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={DollarSign}
            label="إجمالي مبيعات الفترة"
            value={fmtMoney(totalDailySales)}
            sub="شامل ضريبة القيمة المضافة"
          />
          <StatCard
            icon={FileText}
            label="عدد الفواتير المصدرة"
            value={fmtNum(totalDailyInvoices)}
            sub="إجمالي العمليات الناجحة"
          />
          <StatCard
            icon={Coins}
            label="إجمالي ضريبة المبيعات"
            value={fmtMoney(totalDailyTax)}
            sub="مستحقة الإقرار الضريبي"
          />
        </div>
      )}

      {activeTab === 'stock_status' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={Package}
            label="إجمالي قيمة المخزون الحالي"
            value={fmtMoney(totalStockVal)}
            sub="محسوبة على أساس متوسط التكلفة"
          />
          <StatCard
            icon={AlertTriangle}
            label="أصناف منخفضة / منتهية"
            value={String(lowStockCount)}
            sub="تحت حد الطلب الأدنى"
          />
          <StatCard
            icon={Layers}
            label="إجمالي عدد الأصناف"
            value={String(stockStatus.length)}
            sub="المسجلة في النظام"
          />
        </div>
      )}

      {activeTab === 'branch_pnl' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={DollarSign}
            label="إجمالي صافي الأرباح"
            value={fmtMoney(totalNetProfit)}
            sub="صافي الربح للفترات المسجلة"
          />
          <StatCard
            icon={TrendingUp}
            label="إجمالي المبيعات المحققة"
            value={fmtMoney(branchPnl.reduce((s, r) => s + Number(r.net_sales || 0), 0))}
            sub="بعد خصم المرتجعات"
          />
          <StatCard
            icon={ArrowDownRight}
            label="إجمالي المصروفات التشغيلية"
            value={fmtMoney(branchPnl.reduce((s, r) => s + Number(r.total_expenses || 0), 0))}
            sub="رواتب، إيجار، فواتير ومصروفات عامة"
          />
        </div>
      )}

      {/* Visual Chart for Sales Daily */}
      {activeTab === 'sales_daily' && salesDaily.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm">
          <h3 className="font-bold text-stone-900 mb-4 text-sm">منحنى المبيعات اليومية</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[...salesDaily].reverse()}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#78350f" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#78350f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [fmtMoney(Number(value)), 'المبيعات']} />
                <Area type="monotone" dataKey="total" stroke="#78350f" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Data Table per active tab */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        {activeTab === 'sales_daily' && (
          <DataTable
            columns={salesColumns}
            rows={salesDaily.filter((r) => !searchQuery || r.day.includes(searchQuery))}
            loading={loadingSales}
            empty="لا توجد بيانات مبيعات في الفترة المحددة"
          />
        )}

        {activeTab === 'top_products' && (
          <DataTable
            columns={topProductColumns}
            rows={topProducts.filter((r) => !searchQuery || r.product_name.toLowerCase().includes(searchQuery.toLowerCase()))}
            loading={loadingTopProducts}
            empty="لا توجد بيانات مبيعات منتجات"
          />
        )}

        {activeTab === 'employee_sales' && (
          <DataTable
            columns={employeeSalesColumns}
            rows={employeeSales.filter((r) => !searchQuery || (r.full_name && r.full_name.toLowerCase().includes(searchQuery.toLowerCase())))}
            loading={loadingEmployeeSales}
            empty="لا توجد بيانات مبيعات للموظفين"
          />
        )}

        {activeTab === 'stock_status' && (
          <DataTable
            columns={stockColumns}
            rows={stockStatus.filter((r) => !searchQuery || `${r.product_name} ${r.sku}`.toLowerCase().includes(searchQuery.toLowerCase()))}
            loading={loadingStock}
            empty="لا توجد بيانات مخزون"
          />
        )}

        {activeTab === 'branch_pnl' && (
          <DataTable
            columns={pnlColumns}
            rows={branchPnl.filter((r) => !searchQuery || (r.branch?.name && r.branch.name.toLowerCase().includes(searchQuery.toLowerCase())))}
            loading={loadingPnl}
            empty="لا توجد بيانات أرباح وخسائر"
          />
        )}

        {activeTab === 'suppliers' && (
          <DataTable
            columns={supplierColumns}
            rows={supplierBalances.filter((r) => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()))}
            loading={loadingSuppliers}
            empty="لا توجد بيانات موردين"
          />
        )}

        {activeTab === 'customers' && (
          <DataTable
            columns={customerColumns}
            rows={customerBalances.filter((r) => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()))}
            loading={loadingCustomers}
            empty="لا توجد بيانات عملاء"
          />
        )}
      </div>
    </div>
  )
}
