import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Search, Eye, Store, User, Calendar, CreditCard, AlertCircle, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtMoney } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { BranchSelect } from '@/components/shared/BranchSelect'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'

export default function ReturnsPage() {
  const [branch, setBranch] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedReturn, setSelectedReturn] = useState<any>(null)

  const { data: returns, isLoading } = useQuery({
    queryKey: ['sales_returns_list', branch, search, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('sales_returns')
        .select(`
          *,
          branch:branches(name),
          customer:customers(name,phone),
          method:payment_methods(name),
          approver:profiles!approved_by(full_name),
          invoice:sales_invoices(invoice_no),
          items:sales_return_items(id)
        `)
        .order('return_date', { ascending: false })

      if (branch) q = q.eq('branch_id', branch)
      if (search) q = q.or(`return_no.ilike.%${search}%,reason.ilike.%${search}%`)
      if (dateFrom) q = q.gte('return_date', `${dateFrom}T00:00:00Z`)
      if (dateTo) q = q.lte('return_date', `${dateTo}T23:59:59Z`)

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // Selected Return Items query
  const { data: returnItems, isLoading: loadingItems } = useQuery({
    queryKey: ['sales_return_items', selectedReturn?.id],
    enabled: !!selectedReturn?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_return_items')
        .select('*, product:products(name,barcode,sku)')
        .eq('return_id', selectedReturn.id)
      if (error) throw error
      return data || []
    },
  })

  const totalRefunds = returns?.reduce((acc, r) => acc + Number(r.refund_amount || 0), 0) || 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل مرتجعات المبيعات"
        subtitle="متابعة طلبات وفواتير إرجاع المنتجات واسترداد المبالغ للعملاء"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-stone-500">إجمالي المبالغ المستردة للمرتجعات</div>
            <div className="text-xl font-bold text-red-600 mt-1 font-mono">{fmtMoney(totalRefunds)}</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center text-red-700">
            <RotateCcw className="h-5 w-5" />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-stone-500">عدد عمليات الإرجاع المسجلة</div>
            <div className="text-xl font-bold text-brand-900 mt-1 font-mono">{returns?.length || 0} عملية</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-gold-100 flex items-center justify-center text-gold-700">
            <FileText className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم المرتجع أو السبب..."
            className="ps-9"
          />
        </div>

        <BranchSelect includeAll value={branch} onChange={setBranch} />
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="من تاريخ" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="إلى تاريخ" />
      </div>

      {/* Returns Table */}
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-cream-200/70 border-b border-cream-300 text-xs font-bold text-brand-900">
                <tr>
                  <th className="px-4 py-3 text-start">رقم المرتجع</th>
                  <th className="px-4 py-3 text-start">الفاتورة الأصلية</th>
                  <th className="px-4 py-3 text-start">الفرع</th>
                  <th className="px-4 py-3 text-start">العميل</th>
                  <th className="px-4 py-3 text-start">تاريخ الإرجاع</th>
                  <th className="px-4 py-3 text-start">طريقة الرد</th>
                  <th className="px-4 py-3 text-start">المبلغ المسترد</th>
                  <th className="px-4 py-3 text-center">المعتمد</th>
                  <th className="px-4 py-3 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {returns && returns.length > 0 ? (
                  returns.map((r) => (
                    <tr key={r.id} className="hover:bg-cream-50/70 transition">
                      <td className="px-4 py-3 font-mono font-bold text-xs text-brand-900">{r.return_no}</td>
                      <td className="px-4 py-3 font-mono text-xs text-stone-600">{r.invoice?.invoice_no || '-'}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1.5 text-stone-800">
                          <Store className="h-3.5 w-3.5 text-gold-600" />
                          {r.branch?.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.customer?.name ? (
                          <div className="font-semibold text-brand-800">{r.customer.name}</div>
                        ) : (
                          <span className="text-stone-400">عميل نقدي</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-stone-600">
                        {new Date(r.return_date).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="inline-flex items-center gap-1 text-stone-700">
                          <CreditCard className="h-3.5 w-3.5 text-stone-400" />
                          {r.method?.name || 'نقدي'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-red-600">{fmtMoney(r.refund_amount)}</td>
                      <td className="px-4 py-3 text-xs text-center text-stone-600">
                        {r.approver?.full_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedReturn(r)}
                          className="btn border border-cream-400 bg-white hover:bg-cream-100 text-brand-800 !px-2.5 !py-1 text-xs inline-flex items-center gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>معاينة</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-stone-400">
                      لا توجد عمليات إرجاع مطابقة لخيارات البحث
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Return Detail Modal */}
      {selectedReturn && (
        <Modal
          open={Boolean(selectedReturn)}
          onClose={() => setSelectedReturn(null)}
          title={`تفاصيل المرتجع: ${selectedReturn.return_no}`}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="bg-cream-100 p-4 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 border border-cream-300">
              <div>
                <span className="text-stone-400 block">الفاتورة الأصلية:</span>
                <span className="font-mono font-bold text-brand-900">{selectedReturn.invoice?.invoice_no || '-'}</span>
              </div>
              <div>
                <span className="text-stone-400 block">الفرع:</span>
                <span className="font-bold text-brand-900">{selectedReturn.branch?.name}</span>
              </div>
              <div>
                <span className="text-stone-400 block">طريقة الاسترداد:</span>
                <span className="font-bold text-brand-900">{selectedReturn.method?.name || 'نقدي'}</span>
              </div>
              <div>
                <span className="text-stone-400 block">إجمالي المبلغ:</span>
                <span className="font-mono font-bold text-red-600 text-sm">{fmtMoney(selectedReturn.refund_amount)}</span>
              </div>
            </div>

            {selectedReturn.reason && (
              <div className="card p-3 bg-amber-50/50 border border-amber-200">
                <span className="font-bold text-stone-700">سبب الإرجاع: </span>
                <span className="text-stone-600">{selectedReturn.reason}</span>
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              <h4 className="font-bold text-brand-900 text-sm">الأصناف المسترجعة:</h4>
              {loadingItems ? (
                <Spinner />
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-start text-xs">
                    <thead className="bg-cream-200/70 border-b border-cream-300 font-bold text-brand-900">
                      <tr>
                        <th className="px-3 py-2 text-start">المنتج</th>
                        <th className="px-3 py-2 text-center">الكمية</th>
                        <th className="px-3 py-2 text-center">حالة الصنف</th>
                        <th className="px-3 py-2 text-start">سبب إرجاع الصنف</th>
                        <th className="px-3 py-2 text-start">المبلغ المسترد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cream-200">
                      {returnItems?.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">
                            <div className="font-bold text-brand-900">{item.product?.name}</div>
                            <div className="font-mono text-[10px] text-stone-400">{item.product?.barcode}</div>
                          </td>
                          <td className="px-3 py-2 text-center font-mono font-bold">{item.qty}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge tone={item.condition === 'resalable' ? 'green' : 'red'}>
                              {item.condition === 'resalable' ? 'صالح للبيع (أعيد للمخزون)' : 'تالف (أُدرج في التوالف)'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-stone-500">{item.reason || '-'}</td>
                          <td className="px-3 py-2 font-mono font-bold text-red-600">{fmtMoney(item.refund_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
