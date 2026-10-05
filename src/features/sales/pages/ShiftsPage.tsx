import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Search, Store, User, ArrowUpRight, ArrowDownRight, Eye, Printer, CheckCircle, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtMoney, toISODate } from '@/lib/formatters'
import { toast } from '@/store/toast.store'
import { errMsg } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { BranchSelect } from '@/components/shared/BranchSelect'
import { Field, Input, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { CloseShiftDialog } from '@/features/pos/components/CloseShiftDialog'

export default function ShiftsPage() {
  const qc = useQueryClient()
  const [branch, setBranch] = useState('')
  const [status, setStatus] = useState<'all' | 'open' | 'closed'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedShift, setSelectedShift] = useState<any>(null)
  const [closingShiftId, setClosingShiftId] = useState<string | null>(null)

  const { data: shifts, isLoading } = useQuery({
    queryKey: ['shifts_list', branch, status, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('shifts')
        .select('*, branch:branches(name), user:profiles(full_name,username), employee:employees(full_name)')
        .order('opened_at', { ascending: false })

      if (branch) q = q.eq('branch_id', branch)
      if (status !== 'all') q = q.eq('status', status)
      if (dateFrom) q = q.gte('opened_at', `${dateFrom}T00:00:00Z`)
      if (dateTo) q = q.lte('opened_at', `${dateTo}T23:59:59Z`)

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // Totals
  const totalSales = shifts?.reduce((acc, s) => acc + Number(s.total_sales || 0), 0) || 0
  const openCount = shifts?.filter((s) => s.status === 'open').length || 0
  const totalDifference = shifts?.filter((s) => s.status === 'closed').reduce((acc, s) => acc + Number(s.difference || 0), 0) || 0

  const printZReport = (s: any) => {
    window.print()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل الورديات والصناديق"
        subtitle="متابعة ورديات الكاشير، المبيعات النقدية والإلكترونية، والعجز والفائض"
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-stone-500">إجمالي مبيعات الورديات المعروضة</div>
            <div className="text-xl font-bold text-brand-900 mt-1 font-mono">{fmtMoney(totalSales)}</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-gold-100 flex items-center justify-center text-gold-700">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-stone-500">الورديات المفتوحة حالياً</div>
            <div className="text-xl font-bold text-emerald-700 mt-1 font-mono">{openCount} وردية</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
            <CheckCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-stone-500">صافي فروقات الصناديق (عجز / فائض)</div>
            <div className={`text-xl font-bold mt-1 font-mono ${totalDifference < 0 ? 'text-red-600' : totalDifference > 0 ? 'text-emerald-700' : 'text-stone-700'}`}>
              {fmtMoney(totalDifference)}
            </div>
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${totalDifference < 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <BranchSelect includeAll value={branch} onChange={setBranch} />

        <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">جميع الحالات</option>
          <option value="open">المفتوحة حالياً فقط</option>
          <option value="closed">المغلقة فقط</option>
        </Select>

        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="من تاريخ" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="إلى تاريخ" />
      </div>

      {/* Shifts Table */}
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-cream-200/70 border-b border-cream-300 text-xs font-bold text-brand-900">
                <tr>
                  <th className="px-4 py-3 text-start">الفرع</th>
                  <th className="px-4 py-3 text-start">الكاشير / الموظف</th>
                  <th className="px-4 py-3 text-start">وقت الفتح</th>
                  <th className="px-4 py-3 text-start">وقت الإغلاق</th>
                  <th className="px-4 py-3 text-start">افتتاحي الصندوق</th>
                  <th className="px-4 py-3 text-start">إجمالي المبيعات</th>
                  <th className="px-4 py-3 text-start">الفارق (عجز/فائض)</th>
                  <th className="px-4 py-3 text-center">الحالة</th>
                  <th className="px-4 py-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {shifts && shifts.length > 0 ? (
                  shifts.map((s) => {
                    const diff = Number(s.difference || 0)
                    return (
                      <tr key={s.id} className="hover:bg-cream-50/70 transition">
                        <td className="px-4 py-3">
                          <div className="font-bold text-brand-900 flex items-center gap-1.5">
                            <Store className="h-3.5 w-3.5 text-gold-600" />
                            {s.branch?.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-semibold text-brand-800">{s.employee?.full_name || s.user?.full_name}</div>
                          <div className="text-stone-400 font-mono text-[11px]">@{s.user?.username}</div>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-stone-600">
                          {new Date(s.opened_at).toLocaleString('ar-SA')}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-stone-600">
                          {s.closed_at ? new Date(s.closed_at).toLocaleString('ar-SA') : <span className="text-emerald-600 font-bold">مستمرة الآن...</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">{fmtMoney(s.opening_cash)}</td>
                        <td className="px-4 py-3 text-xs font-mono font-bold text-brand-900">{fmtMoney(s.total_sales)}</td>
                        <td className="px-4 py-3 text-xs font-mono">
                          {s.status === 'closed' ? (
                            <span className={diff < 0 ? 'text-red-600 font-bold' : diff > 0 ? 'text-emerald-700 font-bold' : 'text-stone-500'}>
                              {diff === 0 ? 'مطابق (0)' : fmtMoney(diff)}
                            </span>
                          ) : (
                            <span className="text-stone-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge tone={s.status === 'open' ? 'green' : 'gray'}>
                            {s.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedShift(s)}
                              title="عرض التفاصيل وتقرير Z-Report"
                              className="btn border border-cream-400 bg-white hover:bg-cream-100 text-brand-800 !px-2.5 !py-1 text-xs inline-flex items-center gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>تقرير</span>
                            </button>
                            {s.status === 'open' && (
                              <button
                                onClick={() => setClosingShiftId(s.id)}
                                className="btn bg-brand-800 hover:bg-brand-900 text-cream-50 !px-2.5 !py-1 text-xs"
                              >
                                إغلاق
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-stone-400">
                      لا توجد ورديات مسجلة تطابق خيارات البحث
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shift Details & Z-Report Modal */}
      {selectedShift && (
        <Modal
          open={Boolean(selectedShift)}
          onClose={() => setSelectedShift(null)}
          title={`تقرير الوردية #${selectedShift.id.slice(0, 8)}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setSelectedShift(null)}>
                إغلاق
              </Button>
              <Button variant="gold" onClick={() => printZReport(selectedShift)}>
                <Printer className="h-4 w-4" />
                طباعة تقرير الإغلاق (Z-Report)
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs" id="print-area">
            {/* Header info */}
            <div className="bg-cream-100 p-4 rounded-xl space-y-2 border border-cream-300">
              <div className="flex justify-between items-center text-sm font-bold text-brand-900">
                <span>الفرع: {selectedShift.branch?.name}</span>
                <Badge tone={selectedShift.status === 'open' ? 'green' : 'gray'}>
                  {selectedShift.status === 'open' ? 'وردية مفتوحة' : 'وردية مغلقة'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-stone-600">
                <div>الكاشير: <strong>{selectedShift.user?.full_name}</strong></div>
                <div>تاريخ الفتح: {new Date(selectedShift.opened_at).toLocaleString('ar-SA')}</div>
                {selectedShift.closed_at && (
                  <div>تاريخ الإغلاق: {new Date(selectedShift.closed_at).toLocaleString('ar-SA')}</div>
                )}
              </div>
            </div>

            {/* Financial breakdown */}
            <div className="card p-4 divide-y divide-cream-200">
              <div className="py-2 flex justify-between">
                <span className="text-stone-600">الرصيد الافتتاحي للصندوق</span>
                <span className="font-mono font-bold">{fmtMoney(selectedShift.opening_cash)}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-stone-600">إجمالي المبيعات</span>
                <span className="font-mono font-bold text-brand-900">{fmtMoney(selectedShift.total_sales)}</span>
              </div>
              <div className="py-2 flex justify-between ps-4 text-stone-500">
                <span>• مبيعات نقدية (Cash)</span>
                <span className="font-mono">{fmtMoney(selectedShift.cash_sales)}</span>
              </div>
              <div className="py-2 flex justify-between ps-4 text-stone-500">
                <span>• مبيعات إلكترونية (شبكة / مدى)</span>
                <span className="font-mono">{fmtMoney(selectedShift.other_sales)}</span>
              </div>
              <div className="py-2 flex justify-between text-red-600">
                <span>إجمالي المرتجعات المستردة نقدياً</span>
                <span className="font-mono font-bold">-{fmtMoney(selectedShift.returns_total)}</span>
              </div>
              {selectedShift.status === 'closed' && (
                <>
                  <div className="py-2 flex justify-between bg-cream-50 font-semibold px-2 rounded">
                    <span>النقد المتوقع في الدرج (Expected Cash)</span>
                    <span className="font-mono">{fmtMoney(selectedShift.expected_cash)}</span>
                  </div>
                  <div className="py-2 flex justify-between bg-cream-50 font-semibold px-2 rounded">
                    <span>النقد الفعلي المعدود (Actual Cash)</span>
                    <span className="font-mono text-brand-900">{fmtMoney(selectedShift.actual_cash)}</span>
                  </div>
                  <div className="py-2.5 flex justify-between text-sm font-bold px-2 rounded">
                    <span>الفارق النهائي (عجز / زيادة)</span>
                    <span className={`font-mono ${Number(selectedShift.difference) < 0 ? 'text-red-600' : Number(selectedShift.difference) > 0 ? 'text-emerald-700' : 'text-stone-700'}`}>
                      {fmtMoney(selectedShift.difference)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Close Shift Dialog */}
      {closingShiftId && (
        <CloseShiftDialog
          shiftId={closingShiftId}
          onClose={() => {
            setClosingShiftId(null)
            qc.invalidateQueries({ queryKey: ['shifts_list'] })
          }}
        />
      )}
    </div>
  )
}
