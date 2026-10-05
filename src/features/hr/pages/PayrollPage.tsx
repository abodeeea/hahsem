import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Plus, Search, CheckCircle2, DollarSign, RefreshCw, Printer, ArrowUpRight, ArrowDownRight, CreditCard, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/store/auth.store'
import { fmtMoney, fmtDate } from '@/lib/formatters'
import { errMsg } from '@/lib/errors'
import { toast } from '@/store/toast.store'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { BranchSelect } from '@/components/shared/BranchSelect'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'

interface PayrollRow {
  id: string
  period_id: string
  employee_id: string
  branch_id: string
  base_salary: number
  commission_amount: number
  bonuses: number
  deductions: number
  advances: number
  net_salary: number
  status: 'draft' | 'approved' | 'paid'
  approved_by?: string
  paid_at?: string
  payment_method_id?: string
  employee?: { full_name: string; job_title?: string; phone?: string }
  branch?: { name: string }
  payment_method?: { name: string }
}

interface PayrollPeriod {
  id: string
  year: number
  month: number
  status: 'open' | 'calculated' | 'approved' | 'paid'
}

export default function PayrollPage() {
  const qc = useQueryClient()
  const { can, seesAllBranches } = usePermission()
  const userBranchId = useAuth((s) => s.profile?.branch_id) ?? ''

  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')
  const [branchFilter, setBranchFilter] = useState(seesAllBranches ? '' : userBranchId)
  const [searchQuery, setSearchQuery] = useState('')

  const [generating, setGenerating] = useState(false)

  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false)
  const [adjEmployeeId, setAdjEmployeeId] = useState('')
  const [adjType, setAdjType] = useState<'bonus' | 'deduction' | 'advance'>('bonus')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10))
  const [savingAdj, setSavingAdj] = useState(false)

  // Pay single modal
  const [payingPayroll, setPayingPayroll] = useState<PayrollRow | null>(null)
  const [payMethodId, setPayMethodId] = useState('')
  const [processingPay, setProcessingPay] = useState(false)

  // Single Payslip Modal
  const [slipRow, setSlipRow] = useState<PayrollRow | null>(null)

  const canCreate = can('payroll', 'create')
  const canUpdate = can('payroll', 'update')

  // Load periods
  const { data: periods = [] } = useQuery<PayrollPeriod[]>({
    queryKey: ['payroll_periods'],
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

  useEffect(() => {
    if (periods.length > 0 && !selectedPeriodId) {
      setSelectedPeriodId(periods[0].id)
    }
  }, [periods, selectedPeriodId])

  // Load payroll list for active period
  const { data: payrolls = [], isLoading } = useQuery<PayrollRow[]>({
    queryKey: ['payrolls_list', selectedPeriodId, branchFilter],
    enabled: !!selectedPeriodId,
    queryFn: async () => {
      let q = supabase
        .from('payrolls')
        .select(`
          id,
          period_id,
          employee_id,
          branch_id,
          base_salary,
          commission_amount,
          bonuses,
          deductions,
          advances,
          net_salary,
          status,
          paid_at,
          payment_method_id,
          employee:employees(full_name, job_title, phone),
          branch:branches(name),
          payment_method:payment_methods(name)
        `)
        .eq('period_id', selectedPeriodId)
        .order('net_salary', { ascending: false })

      if (branchFilter) q = q.eq('branch_id', branchFilter)

      const { data, error } = await q
      if (error) throw error
      return (data || []) as any
    },
  })

  // Load active employees
  const { data: employees = [] } = useQuery({
    queryKey: ['active_employees_for_payroll'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, branch_id, base_salary, status')
        .eq('status', 'active')
        .order('full_name')
      if (error) throw error
      return data || []
    },
  })

  // Load payment methods
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment_methods_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name')
        .eq('is_active', true)
      if (error) throw error
      return data || []
    },
  })

  // Set default payment method
  useEffect(() => {
    if (paymentMethods.length > 0 && !payMethodId) {
      setPayMethodId(paymentMethods[0].id)
    }
  }, [paymentMethods, payMethodId])

  // Generate / Recalculate Payroll Sheet for Period
  const handleGeneratePayroll = async () => {
    if (!selectedPeriodId) return toast.error('يرجى اختيار الفترة')
    setGenerating(true)
    try {
      const activePeriod = periods.find((p) => p.id === selectedPeriodId)
      if (!activePeriod) throw new Error('الفترة غير صالحة')

      const startOfMonth = `${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}-01`
      const nextMonth = activePeriod.month === 12 ? 1 : activePeriod.month + 1
      const nextYear = activePeriod.month === 12 ? activePeriod.year + 1 : activePeriod.year
      const endOfMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

      const { data: commsData } = await supabase
        .from('commissions')
        .select('employee_id, amount')
        .eq('period_id', selectedPeriodId)

      const commMap: Record<string, number> = {}
      for (const c of commsData || []) {
        commMap[c.employee_id] = (commMap[c.employee_id] || 0) + Number(c.amount || 0)
      }

      const { data: adjsData } = await supabase
        .from('employee_adjustments')
        .select('employee_id, adj_type, amount')
        .gte('adj_date', startOfMonth)
        .lt('adj_date', endOfMonth)

      const adjMap: Record<string, { bonuses: number; deductions: number; advances: number }> = {}
      for (const a of adjsData || []) {
        if (!adjMap[a.employee_id]) {
          adjMap[a.employee_id] = { bonuses: 0, deductions: 0, advances: 0 }
        }
        if (a.adj_type === 'bonus') adjMap[a.employee_id].bonuses += Number(a.amount || 0)
        else if (a.adj_type === 'deduction') adjMap[a.employee_id].deductions += Number(a.amount || 0)
        else if (a.adj_type === 'advance') adjMap[a.employee_id].advances += Number(a.amount || 0)
      }

      const payrollRows = employees.map((emp) => {
        const base = Number(emp.base_salary || 0)
        const comm = commMap[emp.id] || 0
        const adjs = adjMap[emp.id] || { bonuses: 0, deductions: 0, advances: 0 }

        return {
          period_id: selectedPeriodId,
          employee_id: emp.id,
          branch_id: emp.branch_id,
          base_salary: base,
          commission_amount: comm,
          bonuses: adjs.bonuses,
          deductions: adjs.deductions,
          advances: adjs.advances,
          status: 'draft',
        }
      })

      if (payrollRows.length === 0) {
        return toast.info('لا يوجد موظفون نشطون لتوليد مسير لهم')
      }

      const { error: upsertErr } = await supabase
        .from('payrolls')
        .upsert(payrollRows, { onConflict: 'period_id,employee_id' })

      if (upsertErr) throw upsertErr

      toast.success(`تم توليد وتحديث مسير الرواتب لـ ${payrollRows.length} موظف بنجاح!`)
      qc.invalidateQueries({ queryKey: ['payrolls_list'] })
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setGenerating(false)
    }
  }

  // Save Adjustment
  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjEmployeeId) return toast.error('يرجى اختيار الموظف')
    const amtNum = Number(adjAmount)
    if (!amtNum || amtNum <= 0) return toast.error('المبلغ يجب أن يكون أكبر من الصفر')

    setSavingAdj(true)
    try {
      const { error } = await supabase.from('employee_adjustments').insert({
        employee_id: adjEmployeeId,
        adj_type: adjType,
        amount: amtNum,
        adj_date: adjDate,
        reason: adjReason || null,
      })
      if (error) throw error

      toast.success('تم تسجيل التعديل بنجاح')
      setIsAdjustmentOpen(false)
      setAdjAmount('')
      setAdjReason('')
      handleGeneratePayroll()
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setSavingAdj(false)
    }
  }

  // Approve Entire Payroll Sheet
  const handleApprovePayroll = async () => {
    if (!selectedPeriodId) return
    if (!window.confirm('هل أنت متأكد من اعتماد مسير الرواتب لهذه الفترة؟')) return
    try {
      const { error } = await supabase
        .from('payrolls')
        .update({ status: 'approved' })
        .eq('period_id', selectedPeriodId)
        .eq('status', 'draft')

      if (error) throw error

      toast.success('تم اعتماد مسير الرواتب بنجاح')
      qc.invalidateQueries({ queryKey: ['payrolls_list'] })
    } catch (err: any) {
      toast.error(errMsg(err))
    }
  }

  // Confirm Single Payment
  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payingPayroll) return
    if (!payMethodId) return toast.error('يرجى اختيار طريقة الدفع')

    setProcessingPay(true)
    try {
      const { error } = await supabase
        .from('payrolls')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method_id: payMethodId,
        })
        .eq('id', payingPayroll.id)

      if (error) throw error

      toast.success(`تم صرف راتب الموظف ${payingPayroll.employee?.full_name} بنجاح`)
      setPayingPayroll(null)
      qc.invalidateQueries({ queryKey: ['payrolls_list'] })
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setProcessingPay(false)
    }
  }

  // Filtered rows
  const filteredPayrolls = payrolls.filter((p) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (p.employee?.full_name && p.employee.full_name.toLowerCase().includes(q)) ||
      (p.branch?.name && p.branch.name.toLowerCase().includes(q))
    )
  })

  // KPIs
  const totalNetAll = payrolls.reduce((acc, p) => acc + Number(p.net_salary || 0), 0)
  const totalBaseAll = payrolls.reduce((acc, p) => acc + Number(p.base_salary || 0), 0)
  const totalCommsAll = payrolls.reduce((acc, p) => acc + Number(p.commission_amount || 0), 0)
  const totalDeductionsAll = payrolls.reduce((acc, p) => acc + Number(p.deductions || 0) + Number(p.advances || 0), 0)

  const getStatusBadge = (status: PayrollRow['status']) => {
    switch (status) {
      case 'paid':
        return <Badge tone="green"><CheckCircle2 className="h-3 w-3 inline ml-1" /> تم الصرف</Badge>
      case 'approved':
        return <Badge tone="blue"><ShieldCheck className="h-3 w-3 inline ml-1" /> معتمد للصرف</Badge>
      default:
        return <Badge tone="amber">مسودة</Badge>
    }
  }

  const columns: Column<PayrollRow>[] = [
    {
      key: 'employee',
      header: 'الموظف',
      render: (r) => (
        <div>
          <button
            type="button"
            onClick={() => setSlipRow(r)}
            className="font-bold text-brand-700 hover:text-brand-900 underline text-right"
          >
            {r.employee?.full_name || '—'}
          </button>
          <div className="text-xs text-stone-400">{r.employee?.job_title || 'موظف'}</div>
        </div>
      ),
    },
    {
      key: 'branch',
      header: 'الفرع',
      render: (r) => <span>{r.branch?.name || '—'}</span>,
    },
    {
      key: 'base_salary',
      header: 'الراتب الأساسي',
      render: (r) => fmtMoney(r.base_salary),
    },
    {
      key: 'commission_amount',
      header: 'العمولة',
      render: (r) => <span className="text-emerald-700 font-semibold">{fmtMoney(r.commission_amount)}</span>,
    },
    {
      key: 'bonuses',
      header: 'مكافآت (+)',
      render: (r) => Number(r.bonuses) > 0 ? <span className="text-emerald-600 font-medium">+{fmtMoney(r.bonuses)}</span> : '—',
    },
    {
      key: 'deductions',
      header: 'خصومات / سلف (-)',
      render: (r) => {
        const tot = Number(r.deductions || 0) + Number(r.advances || 0)
        return tot > 0 ? <span className="text-rose-600 font-medium">-{fmtMoney(tot)}</span> : '—'
      },
    },
    {
      key: 'net_salary',
      header: 'صافي الراتب',
      render: (r) => <span className="font-bold text-stone-900 text-base">{fmtMoney(r.net_salary)}</span>,
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
          {canUpdate && r.status !== 'paid' && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setPayingPayroll(r)}
            >
              صرف
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSlipRow(r)}
          >
            <Printer className="h-4 w-4 ml-1 inline" /> مسير
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="مسير الرواتب والمستحقات"
        subtitle="إدارة وحساب رواتب الموظفين الشهرية، البدلات، العمولات، الخصومات والسلف وصرف المستحقات"
        actions={
          <div className="flex gap-2">
            {canCreate && (
              <Button variant="secondary" onClick={() => setIsAdjustmentOpen(true)}>
                <Plus className="h-4 w-4 ml-1 inline" /> إضافة مكافأة / خصم / سلفة
              </Button>
            )}
            {canCreate && (
              <Button onClick={handleGeneratePayroll} loading={generating}>
                <Banknote className="h-4 w-4 ml-1 inline" /> توليد / تحديث المسير
              </Button>
            )}
            {canUpdate && (
              <Button variant="primary" onClick={handleApprovePayroll}>
                <CheckCircle2 className="h-4 w-4 ml-1 inline" /> اعتماد المسير
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          icon={Banknote}
          label="إجمالي صافي الرواتب"
          value={fmtMoney(totalNetAll)}
          sub="المبلغ الإجمالي المستحق للصرف"
        />
        <StatCard
          icon={DollarSign}
          label="الرواتب الأساسية"
          value={fmtMoney(totalBaseAll)}
          sub="مجموع الرواتب الثابتة"
        />
        <StatCard
          icon={ArrowUpRight}
          label="عمولات ومكافآت (+)"
          value={fmtMoney(totalCommsAll)}
          sub="إجمالي الإضافات الشهرية"
        />
        <StatCard
          icon={ArrowDownRight}
          label="خصومات وسلف (-)"
          value={fmtMoney(totalDeductionsAll)}
          sub="إجمالي المستقطعات"
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
                  شهر {p.month} / {p.year} {p.status === 'paid' ? '(مصروف)' : ''}
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

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4 ml-1 inline" /> طباعة الكشف
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['payrolls_list'] })}
          >
            <RefreshCw className="h-4 w-4 ml-1 inline" /> تحديث
          </Button>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          rows={filteredPayrolls}
          loading={isLoading}
          empty="لم يتم توليد مسير رواتب لهذه الفترة بعد. اضغط على 'توليد / تحديث المسير' للبدء."
        />
      </div>

      {/* Modal: New Adjustment (Bonus / Deduction / Advance) */}
      {isAdjustmentOpen && (
        <Modal
          open
          onClose={() => setIsAdjustmentOpen(false)}
          title="تسجيل تعديل راتب (مكافأة / خصم / سلفة)"
          size="md"
        >
          <form onSubmit={handleSaveAdjustment} className="space-y-4">
            <Field label="الموظف">
              <Select
                value={adjEmployeeId}
                onChange={(e) => setAdjEmployeeId(e.target.value)}
              >
                <option value="">-- اختر الموظف --</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="نوع التعديل">
                <Select
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value as any)}
                >
                  <option value="bonus">مكافأة تشجيعية (+)</option>
                  <option value="deduction">خصم / جزاء (-)</option>
                  <option value="advance">سلفة مالية (-)</option>
                </Select>
              </Field>

              <Field label="المبلغ (SAR)">
                <Input
                  type="number"
                  step="any"
                  min={1}
                  placeholder="مثلاً: 500"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                />
              </Field>
            </div>

            <Field label="تاريخ التعديل">
              <Input
                type="date"
                value={adjDate}
                onChange={(e) => setAdjDate(e.target.value)}
              />
            </Field>

            <Field label="السبب / البيان">
              <Textarea
                rows={2}
                placeholder="بيان سبب المكافأة أو الخصم أو السلفة..."
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAdjustmentOpen(false)}
              >
                إلغاء
              </Button>
              <Button type="submit" loading={savingAdj}>
                حفظ وإدراج في المسير
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Pay Employee Salary */}
      {payingPayroll && (
        <Modal
          open
          onClose={() => setPayingPayroll(null)}
          title={`صرف راتب: ${payingPayroll.employee?.full_name}`}
          size="sm"
        >
          <form onSubmit={handleConfirmPay} className="space-y-4">
            <div className="p-3 bg-stone-50 rounded-xl space-y-2 text-sm border border-stone-200">
              <div className="flex justify-between">
                <span className="text-stone-500">الراتب الأساسي</span>
                <b>{fmtMoney(payingPayroll.base_salary)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">العمولة والمكافآت</span>
                <b className="text-emerald-700">+{fmtMoney(Number(payingPayroll.commission_amount) + Number(payingPayroll.bonuses))}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">الخصومات والسلف</span>
                <b className="text-rose-700">-{fmtMoney(Number(payingPayroll.deductions) + Number(payingPayroll.advances))}</b>
              </div>
              <div className="flex justify-between pt-2 border-t border-stone-200 font-bold text-base">
                <span>صافي المستحق:</span>
                <span className="text-emerald-800">{fmtMoney(payingPayroll.net_salary)}</span>
              </div>
            </div>

            <Field label="طريقة الدفع / الصرف">
              <Select
                value={payMethodId}
                onChange={(e) => setPayMethodId(e.target.value)}
              >
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPayingPayroll(null)}
              >
                إلغاء
              </Button>
              <Button type="submit" loading={processingPay}>
                <CreditCard className="h-4 w-4 ml-1 inline" /> تأكيد صرف الراتب
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Printable Individual Payslip */}
      {slipRow && (
        <Modal
          open
          onClose={() => setSlipRow(null)}
          title={`قسيمة راتب: ${slipRow.employee?.full_name}`}
          size="md"
        >
          <div className="space-y-4 p-2 print:p-0">
            <div className="text-center border-b pb-3 border-stone-200">
              <h3 className="font-bold text-lg text-stone-900">هاشم للطيب والعطور</h3>
              <p className="text-xs text-stone-500">قسيمة استلام راتب ومستحقات شهرية</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-stone-50 p-3 rounded-lg border">
              <div>الموظف: <b>{slipRow.employee?.full_name}</b></div>
              <div>المهنة: <b>{slipRow.employee?.job_title || '—'}</b></div>
              <div>الفرع: <b>{slipRow.branch?.name || '—'}</b></div>
              <div>الحالة: <b>{slipRow.status === 'paid' ? 'مدفوع' : 'معتمد'}</b></div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span>الراتب الأساسي</span>
                <b>{fmtMoney(slipRow.base_salary)}</b>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>عمولة المبيعات</span>
                <span className="text-emerald-700 font-bold">+{fmtMoney(slipRow.commission_amount)}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>مكافآت أخرى</span>
                <span className="text-emerald-700 font-bold">+{fmtMoney(slipRow.bonuses)}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>خصومات وجزاءات</span>
                <span className="text-rose-700 font-bold">-{fmtMoney(slipRow.deductions)}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span>سلف مستردة</span>
                <span className="text-rose-700 font-bold">-{fmtMoney(slipRow.advances)}</span>
              </div>
              <div className="flex justify-between py-2 bg-stone-100 px-3 rounded-lg font-bold text-sm">
                <span>صافي الراتب المستلم:</span>
                <span className="text-stone-900">{fmtMoney(slipRow.net_salary)}</span>
              </div>
            </div>

            <div className="pt-6 grid grid-cols-2 text-center text-xs text-stone-500">
              <div>توقيع المحاسب / المدير: ....................</div>
              <div>توقيع الموظف المستلم: ....................</div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
              <Button
                variant="secondary"
                onClick={() => setSlipRow(null)}
              >
                إغلاق
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="h-4 w-4 ml-1 inline" /> طباعة القسيمة
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
