import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, Calculator, CheckCircle2, Search, Percent, DollarSign, Users, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/store/auth.store'
import { fmtMoney, fmtNum } from '@/lib/formatters'
import { errMsg } from '@/lib/errors'
import { toast } from '@/store/toast.store'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { BranchSelect } from '@/components/shared/BranchSelect'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select } from '@/components/ui/Field'

interface CommissionRow {
  id: string
  employee_id: string
  branch_id: string
  period_id: string
  total_sales: number
  eligible_sales: number
  rate: number
  amount: number
  status: 'pending' | 'approved' | 'paid'
  payroll_id?: string
  employee?: { full_name: string; job_title?: string; salary?: number }
  branch?: { name: string }
}

interface PayrollPeriod {
  id: string
  year: number
  month: number
  status: 'open' | 'calculated' | 'approved' | 'paid'
}

export default function CommissionsPage() {
  const qc = useQueryClient()
  const { can, seesAllBranches } = usePermission()
  const userBranchId = useAuth((s) => s.profile?.branch_id) ?? ''

  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')
  const [branchFilter, setBranchFilter] = useState(seesAllBranches ? '' : userBranchId)
  const [searchQuery, setSearchQuery] = useState('')

  // Calculate commissions modal
  const [isCalcOpen, setIsCalcOpen] = useState(false)
  const [calcRate, setCalcRate] = useState('2.5') // default commission rate %
  const [calculating, setCalculating] = useState(false)

  // Edit commission modal
  const [editingRow, setEditingRow] = useState<CommissionRow | null>(null)
  const [editRate, setEditRate] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const canCreate = can('commissions', 'create')
  const canUpdate = can('commissions', 'update')

  // Load payroll periods
  const { data: periods = [] } = useQuery<PayrollPeriod[]>({
    queryKey: ['payroll_periods_lookup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw error

      if (!data || data.length === 0) {
        const { data: newP } = await supabase
          .from('payroll_periods')
          .insert({ year: currentYear, month: currentMonth, status: 'open' })
          .select()
          .single()
        return newP ? [newP] : []
      }
      return data || []
    },
  })

  // Set default period once loaded
  useEffect(() => {
    if (periods.length > 0 && !selectedPeriodId) {
      setSelectedPeriodId(periods[0].id)
    }
  }, [periods, selectedPeriodId])

  // Load commissions
  const { data: commissions = [], isLoading } = useQuery<CommissionRow[]>({
    queryKey: ['commissions_list', selectedPeriodId, branchFilter],
    enabled: !!selectedPeriodId,
    queryFn: async () => {
      let q = supabase
        .from('commissions')
        .select(`
          id,
          employee_id,
          branch_id,
          period_id,
          total_sales,
          eligible_sales,
          rate,
          amount,
          status,
          payroll_id,
          employee:employees(full_name, job_title),
          branch:branches(name)
        `)
        .eq('period_id', selectedPeriodId)
        .order('amount', { ascending: false })

      if (branchFilter) q = q.eq('branch_id', branchFilter)

      const { data, error } = await q
      if (error) throw error
      return (data || []) as any
    },
  })

  // Calculate commissions for active period
  const handleCalculateCommissions = async () => {
    if (!selectedPeriodId) return toast.error('يرجى اختيار الفترة أولاً')
    const rateNum = Number(calcRate)
    if (isNaN(rateNum) || rateNum < 0) return toast.error('يرجى إدخال نسبة مئوية صالحة')

    setCalculating(true)
    try {
      const activePeriod = periods.find((p) => p.id === selectedPeriodId)
      if (!activePeriod) throw new Error('الفترة غير صالحة')

      const startOfMonth = `${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-01`
      const nextMonth = activePeriod.month === 12 ? 1 : activePeriod.month + 1
      const nextYear = activePeriod.month === 12 ? activePeriod.year + 1 : activePeriod.year
      const endOfMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

      const { data: salesData, error: salesErr } = await supabase
        .from('sales_invoices')
        .select('sold_by, branch_id, total')
        .gte('invoice_date', startOfMonth)
        .lt('invoice_date', endOfMonth)
        .neq('status', 'cancelled')
        .not('sold_by', 'is', null)

      if (salesErr) throw salesErr

      const employeeSalesMap: Record<string, { branch_id: string; total: number }> = {}
      for (const row of salesData || []) {
        if (!row.sold_by) continue
        if (!employeeSalesMap[row.sold_by]) {
          employeeSalesMap[row.sold_by] = { branch_id: row.branch_id, total: 0 }
        }
        employeeSalesMap[row.sold_by].total += Number(row.total || 0)
      }

      const { data: employeesList, error: empErr } = await supabase
        .from('employees')
        .select('id, branch_id, full_name')
        .eq('status', 'active')

      if (empErr) throw empErr

      const upsertRows = (employeesList || []).map((emp) => {
        const sales = employeeSalesMap[emp.id]?.total || 0
        const amount = Math.round((sales * rateNum) / 100)
        return {
          employee_id: emp.id,
          branch_id: employeeSalesMap[emp.id]?.branch_id || emp.branch_id,
          period_id: selectedPeriodId,
          total_sales: sales,
          eligible_sales: sales,
          rate: rateNum,
          amount,
          status: 'pending',
        }
      })

      if (upsertRows.length === 0) {
        toast.info('لا يوجد موظفون لحساب العمولات لهم')
        return
      }

      const { error: upsertErr } = await supabase
        .from('commissions')
        .upsert(upsertRows, { onConflict: 'period_id,employee_id' })

      if (upsertErr) throw upsertErr

      toast.success(`تم احتساب وتحديث عمولات ${upsertRows.length} موظف بنجاح!`)
      setIsCalcOpen(false)
      qc.invalidateQueries({ queryKey: ['commissions_list'] })
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setCalculating(false)
    }
  }

  // Save manual edit for a single commission
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingRow) return
    setSavingEdit(true)
    try {
      const { error } = await supabase
        .from('commissions')
        .update({
          rate: Number(editRate),
          amount: Number(editAmount),
        })
        .eq('id', editingRow.id)

      if (error) throw error

      toast.success('تم تحديث العمولة بنجاح')
      setEditingRow(null)
      qc.invalidateQueries({ queryKey: ['commissions_list'] })
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setSavingEdit(false)
    }
  }

  // Bulk approve commissions
  const handleApproveAll = async () => {
    if (!selectedPeriodId) return
    if (!window.confirm('هل أنت متأكد من اعتماد جميع عمولات هذه الفترة؟')) return
    try {
      const { error } = await supabase
        .from('commissions')
        .update({ status: 'approved' })
        .eq('period_id', selectedPeriodId)
        .eq('status', 'pending')

      if (error) throw error

      toast.success('تم اعتماد العمولات بنجاح')
      qc.invalidateQueries({ queryKey: ['commissions_list'] })
    } catch (err: any) {
      toast.error(errMsg(err))
    }
  }

  // Filter rows
  const filteredCommissions = commissions.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (c.employee?.full_name && c.employee.full_name.toLowerCase().includes(q)) ||
      (c.branch?.name && c.branch.name.toLowerCase().includes(q))
    )
  })

  // KPIs
  const totalSalesAll = commissions.reduce((acc, c) => acc + Number(c.total_sales || 0), 0)
  const totalCommissionsAll = commissions.reduce((acc, c) => acc + Number(c.amount || 0), 0)
  const pendingCount = commissions.filter((c) => c.status === 'pending').length

  const getStatusBadge = (status: CommissionRow['status']) => {
    switch (status) {
      case 'approved':
        return <Badge tone="green"><CheckCircle2 className="h-3 w-3 inline ml-1" /> معتمدة</Badge>
      case 'paid':
        return <Badge tone="purple">مصروفة مع الراتب</Badge>
      default:
        return <Badge tone="amber">قيد المراجعة</Badge>
    }
  }

  const columns: Column<CommissionRow>[] = [
    {
      key: 'employee',
      header: 'الموظف',
      render: (r) => (
        <div>
          <div className="font-bold text-stone-900">{r.employee?.full_name || '—'}</div>
          <div className="text-xs text-stone-400">{r.employee?.job_title || 'مبيعات'}</div>
        </div>
      ),
    },
    {
      key: 'branch',
      header: 'الفرع',
      render: (r) => <span>{r.branch?.name || '—'}</span>,
    },
    {
      key: 'total_sales',
      header: 'إجمالي المبيعات المحققة',
      render: (r) => <span className="font-bold text-stone-800">{fmtMoney(r.total_sales)}</span>,
    },
    {
      key: 'rate',
      header: 'نسبة العمولة',
      render: (r) => <span className="font-semibold text-brand-700">{fmtNum(r.rate)}%</span>,
    },
    {
      key: 'amount',
      header: 'مبلغ العمولة المستحق',
      render: (r) => <span className="font-bold text-emerald-700 text-base">{fmtMoney(r.amount)}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (r) => getStatusBadge(r.status),
    },
    {
      key: 'actions',
      header: 'الإجراء',
      render: (r) => (
        <div className="flex gap-2">
          {canUpdate && r.status === 'pending' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditingRow(r)
                setEditRate(String(r.rate))
                setEditAmount(String(r.amount))
              }}
            >
              تعديل
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="عمولات الموظفين"
        subtitle="حساب واعتماد عمولات المبيعات الشهرية للبائعين وربطها التلقائي مع مسير الرواتب"
        actions={
          <div className="flex gap-2">
            {canCreate && (
              <Button onClick={() => setIsCalcOpen(true)}>
                <Calculator className="h-4 w-4 ml-1 inline" /> احتساب العمولات
              </Button>
            )}
            {canUpdate && pendingCount > 0 && (
              <Button variant="secondary" onClick={handleApproveAll}>
                <CheckCircle2 className="h-4 w-4 ml-1 inline" /> اعتماد الكل ({pendingCount})
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Award}
          label="إجمالي العمولات المستحقة"
          value={fmtMoney(totalCommissionsAll)}
          sub="مجموع مبالغ العمولات لهذه الفترة"
        />
        <StatCard
          icon={DollarSign}
          label="إجمالي المبيعات المؤهلة"
          value={fmtMoney(totalSalesAll)}
          sub="مجموع مبيعات الموظفين بالفترة المختارة"
        />
        <StatCard
          icon={Users}
          label="عدد الموظفين المستحقين"
          value={String(commissions.length)}
          sub={`منهم ${pendingCount} بحاجة للاعتماد`}
        />
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          <div className="w-56">
            <Select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  شهر {p.month} / {p.year} {p.status === 'approved' ? '(معتمد)' : ''}
                </option>
              ))}
            </Select>
          </div>

          {seesAllBranches && (
            <div className="w-48">
              <BranchSelect
                value={branchFilter}
                onChange={setBranchFilter}
                includeAll
              />
            </div>
          )}

          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              placeholder="بحث بالموظف أو الفرع..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9"
            />
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['commissions_list'] })}
        >
          <RefreshCw className="h-4 w-4 ml-1 inline" /> تحديث
        </Button>
      </div>

      {/* Commissions Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          rows={filteredCommissions}
          loading={isLoading}
          empty="لم يتم احتساب عمولات لهذه الفترة بعد. اضغط على زر 'احتساب العمولات' للبدء."
        />
      </div>

      {/* Modal: Calculate Commissions */}
      {isCalcOpen && (
        <Modal
          open
          onClose={() => setIsCalcOpen(false)}
          title="احتساب وتوليد عمولات المبيعات للشهر"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-stone-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
              💡 سيقوم النظام بحساب إجمالي مبيعات كل موظف من فواتير المبيعات الصادرة خلال الفترة المحددة، ثم تطبيق نسبة العمولة المحددة أدناه.
            </p>

            <Field label="نسبة العمولة الافتراضية (%)" hint="تُطبق على مبيعات الموظفين المحققة">
              <div className="relative">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={calcRate}
                  onChange={(e) => setCalcRate(e.target.value)}
                  className="pl-8"
                />
                <Percent className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              </div>
            </Field>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsCalcOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleCalculateCommissions}
                loading={calculating}
              >
                <Calculator className="h-4 w-4 ml-1 inline" /> بدء الاحتساب والتوليد
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Edit Single Commission */}
      {editingRow && (
        <Modal
          open
          onClose={() => setEditingRow(null)}
          title={`تعديل عمولة: ${editingRow.employee?.full_name}`}
          size="sm"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="bg-stone-50 p-3 rounded-lg text-xs space-y-1 text-stone-600">
              <div>إجمالي المبيعات: <b>{fmtMoney(editingRow.total_sales)}</b></div>
              <div>الفرع: <b>{editingRow.branch?.name}</b></div>
            </div>

            <Field label="نسبة العمولة (%)">
              <Input
                type="number"
                step="0.1"
                min={0}
                value={editRate}
                onChange={(e) => {
                  setEditRate(e.target.value)
                  const r = Number(e.target.value) || 0
                  setEditAmount(String(Math.round((editingRow.total_sales * r) / 100)))
                }}
              />
            </Field>

            <Field label="مبلغ العمولة النهائي (SAR)">
              <Input
                type="number"
                step="any"
                min={0}
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingRow(null)}
              >
                إلغاء
              </Button>
              <Button type="submit" loading={savingEdit}>
                حفظ التعديل
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
