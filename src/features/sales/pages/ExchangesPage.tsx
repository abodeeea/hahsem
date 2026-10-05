import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Repeat, Plus, Search, Eye, Trash2, Store, User, CreditCard, ArrowLeftRight, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtMoney } from '@/lib/formatters'
import { toast } from '@/store/toast.store'
import { errMsg } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { BranchSelect } from '@/components/shared/BranchSelect'
import { ProductPicker, PickedProduct } from '@/components/shared/ProductPicker'
import { Field, Input, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'

export default function ExchangesPage() {
  const qc = useQueryClient()
  const [branch, setBranch] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedExchange, setSelectedExchange] = useState<any>(null)
  const [newExchangeModal, setNewExchangeModal] = useState(false)

  // Exchanges list
  const { data: exchanges, isLoading } = useQuery({
    queryKey: ['exchanges_list', branch, search, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('exchanges')
        .select(`
          *,
          branch:branches(name),
          customer:customers(name),
          method:payment_methods(name),
          invoice:sales_invoices(invoice_no)
        `)
        .order('created_at', { ascending: false })

      if (branch) q = q.eq('branch_id', branch)
      if (search) q = q.ilike('exchange_no', `%${search}%`)
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00Z`)
      if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59Z`)

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // Selected Exchange Items query
  const { data: exchangeItems, isLoading: loadingItems } = useQuery({
    queryKey: ['exchange_items', selectedExchange?.id],
    enabled: !!selectedExchange?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exchange_items')
        .select('*, product:products(name,barcode,sku)')
        .eq('exchange_id', selectedExchange.id)
      if (error) throw error
      return data || []
    },
  })

  // Payment methods for settlement
  const { data: paymentMethods } = useQuery({
    queryKey: ['payment_methods_active'],
    queryFn: async () => {
      const { data } = await supabase.from('payment_methods').select('id,name,is_cash').eq('is_active', true)
      return data || []
    },
  })

  // New Exchange Wizard State
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [returnedItems, setReturnedItems] = useState<any[]>([])
  const [givenItems, setGivenItems] = useState<any[]>([])
  const [settlementMethodId, setSettlementMethodId] = useState('')

  // Search invoice
  const { data: searchedInvoices, isFetching: searchingInvoices } = useQuery({
    queryKey: ['search_invoices_for_exchange', invoiceSearch],
    enabled: invoiceSearch.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_invoices')
        .select('id,invoice_no,invoice_date,total,branch_id,customer_id,customer:customers(name),items:sales_invoice_items(*, product:products(name,barcode,retail_price))')
        .eq('status', 'completed')
        .ilike('invoice_no', `%${invoiceSearch.trim()}%`)
        .limit(5)
      if (error) throw error
      return data || []
    },
  })

  // Calculations
  const returnedTotal = returnedItems.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unit_price) || 0), 0)
  const givenTotal = givenItems.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unit_price) || 0), 0)
  const difference = givenTotal - returnedTotal

  const postExchangeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice) throw new Error('يرجى اختيار الفاتورة الأصلية')
      if (returnedItems.length === 0 && givenItems.length === 0) throw new Error('يرجى تحديد الأصناف المسترجعة والبديلة')
      if (difference !== 0 && !settlementMethodId) throw new Error('يرجى اختيار طريقة تسوية الفارق المالي')

      const payload = {
        invoice_id: selectedInvoice.id,
        settlement_method_id: settlementMethodId || null,
        returned_items: returnedItems.map((it) => ({
          product_id: it.product_id,
          qty: Number(it.qty),
          unit_price: Number(it.unit_price),
          condition: it.condition || 'resalable',
        })),
        given_items: givenItems.map((it) => ({
          product_id: it.product_id,
          qty: Number(it.qty),
          unit_price: Number(it.unit_price),
        })),
      }

      const { data, error } = await supabase.rpc('fn_post_exchange', { p: payload })
      if (error) throw error
      return data
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['exchanges_list'] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
      toast.success(`تمت عملية الاستبدال بنجاح (${res.exchange_no})`)
      setNewExchangeModal(false)
      setSelectedInvoice(null)
      setReturnedItems([])
      setGivenItems([])
      setSettlementMethodId('')
      setInvoiceSearch('')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const addReturnedItemFromInvoice = (invItem: any) => {
    if (returnedItems.some((it) => it.invoice_item_id === invItem.id)) return
    setReturnedItems([
      ...returnedItems,
      {
        invoice_item_id: invItem.id,
        product_id: invItem.product_id,
        name: invItem.product?.name,
        barcode: invItem.product?.barcode,
        maxQty: invItem.qty,
        qty: 1,
        unit_price: invItem.unit_price,
        condition: 'resalable',
      },
    ])
  }

  const addGivenProduct = (prod: PickedProduct) => {
    const existing = givenItems.find((it) => it.product_id === prod.id)
    if (existing) {
      setGivenItems(
        givenItems.map((it) => (it.product_id === prod.id ? { ...it, qty: it.qty + 1 } : it)),
      )
    } else {
      setGivenItems([
        ...givenItems,
        {
          product_id: prod.id,
          name: prod.name,
          barcode: prod.barcode,
          qty: 1,
          unit_price: prod.retail_price,
        },
      ])
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="استبدال المنتجات"
        subtitle="إجراء عمليات استبدال الأصناف وحساب الفروقات المالية وتسوية المخزون آلياً"
        actions={
          <Button variant="gold" onClick={() => setNewExchangeModal(true)}>
            <Plus className="h-4 w-4" />
            عملية استبدال جديدة
          </Button>
        }
      />

      {/* Filters Bar */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم عملية الاستبدال..."
            className="ps-9"
          />
        </div>

        <BranchSelect includeAll value={branch} onChange={setBranch} />
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="من تاريخ" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="إلى تاريخ" />
      </div>

      {/* Exchanges Table */}
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-cream-200/70 border-b border-cream-300 text-xs font-bold text-brand-900">
                <tr>
                  <th className="px-4 py-3 text-start">رقم الاستبدال</th>
                  <th className="px-4 py-3 text-start">الفاتورة الأصلية</th>
                  <th className="px-4 py-3 text-start">الفرع</th>
                  <th className="px-4 py-3 text-start">العميل</th>
                  <th className="px-4 py-3 text-start">قيمة المرجع</th>
                  <th className="px-4 py-3 text-start">قيمة الجديد</th>
                  <th className="px-4 py-3 text-start">الفارق المالي</th>
                  <th className="px-4 py-3 text-start">طريقة التسوية</th>
                  <th className="px-4 py-3 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {exchanges && exchanges.length > 0 ? (
                  exchanges.map((ex) => {
                    const diff = Number(ex.difference || 0)
                    return (
                      <tr key={ex.id} className="hover:bg-cream-50/70 transition">
                        <td className="px-4 py-3 font-mono font-bold text-xs text-brand-900">{ex.exchange_no}</td>
                        <td className="px-4 py-3 font-mono text-xs text-stone-600">{ex.invoice?.invoice_no || '-'}</td>
                        <td className="px-4 py-3 text-xs">
                          <div className="flex items-center gap-1.5 text-stone-800">
                            <Store className="h-3.5 w-3.5 text-gold-600" />
                            {ex.branch?.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-700">{ex.customer?.name || 'عميل نقدي'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-red-600">{fmtMoney(ex.returned_total)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-emerald-700">{fmtMoney(ex.new_total)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-xs">
                          {diff > 0 ? (
                            <span className="text-emerald-700">+ {fmtMoney(diff)} (دفع عميل)</span>
                          ) : diff < 0 ? (
                            <span className="text-red-600">- {fmtMoney(Math.abs(diff))} (استرداد عميل)</span>
                          ) : (
                            <span className="text-stone-500">متعادل (0)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-600">{ex.method?.name || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedExchange(ex)}
                            className="btn border border-cream-400 bg-white hover:bg-cream-100 text-brand-800 !px-2.5 !py-1 text-xs inline-flex items-center gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>معاينة</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-stone-400">
                      لا توجد عمليات استبدال مسجلة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Exchange Modal */}
      <Modal
        open={newExchangeModal}
        onClose={() => setNewExchangeModal(false)}
        title="إنشاء عملية استبدال بضاعة"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewExchangeModal(false)}>
              إلغاء
            </Button>
            <Button
              variant="gold"
              loading={postExchangeMutation.isPending}
              disabled={!selectedInvoice || (returnedItems.length === 0 && givenItems.length === 0)}
              onClick={() => postExchangeMutation.mutate()}
            >
              <CheckCircle className="h-4 w-4" />
              تأكيد وتنفيذ عملية الاستبدال
            </Button>
          </>
        }
      >
        <div className="space-y-5 text-xs">
          {/* Step 1: Select Invoice */}
          {!selectedInvoice ? (
            <div className="space-y-3">
              <Field label="ابحث عن رقم الفاتورة الأصلية المراد استبدالها:">
                <Input
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="اكتب رقم الفاتورة (مثال: INV-MAIN-2026-000001)..."
                />
              </Field>

              {searchingInvoices && <Spinner />}

              {searchedInvoices && searchedInvoices.length > 0 && (
                <div className="space-y-2 border border-cream-300 rounded-xl p-2 bg-cream-50">
                  <div className="font-bold text-stone-700 px-2">اختر الفاتورة:</div>
                  {searchedInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className="p-3 bg-white hover:bg-gold-50 border border-cream-200 rounded-lg cursor-pointer flex items-center justify-between transition"
                    >
                      <div>
                        <div className="font-bold text-brand-900 font-mono text-sm">{inv.invoice_no}</div>
                        <div className="text-stone-500">
                          {new Date(inv.invoice_date).toLocaleDateString('ar-SA')} • العميل:{' '}
                          {(Array.isArray(inv.customer) ? inv.customer[0]?.name : (inv.customer as any)?.name) || 'نقدي'}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="font-bold font-mono text-brand-900">{fmtMoney(inv.total)}</div>
                        <span className="text-[11px] text-gold-700 font-semibold">اختيار الفاتورة ↵</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-cream-100 p-3 rounded-xl flex items-center justify-between border border-cream-300">
              <div>
                <span className="text-stone-500">الفاتورة المحددة: </span>
                <strong className="font-mono text-brand-900 text-sm">{selectedInvoice.invoice_no}</strong>
                <span className="text-stone-400 ms-3 font-mono">({fmtMoney(selectedInvoice.total)})</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedInvoice(null)
                  setReturnedItems([])
                }}
                className="text-gold-700 font-bold hover:underline"
              >
                تغيير الفاتورة
              </button>
            </div>
          )}

          {selectedInvoice && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left Column: Returned Items (من العميل) */}
              <div className="space-y-3 border border-red-200 rounded-xl p-4 bg-red-50/30">
                <div className="flex items-center justify-between font-bold text-red-800 text-sm">
                  <span>1. الأصناف المسترجعة (من العميل)</span>
                  <span className="font-mono font-bold text-red-600">{fmtMoney(returnedTotal)}</span>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-stone-600">بنود الفاتورة الأصلية (انقر للإضافة):</div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {selectedInvoice.items?.map((it: any) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => addReturnedItemFromInvoice(it)}
                        className="w-full text-start p-2 bg-white border border-cream-300 hover:border-red-300 rounded flex items-center justify-between text-xs transition"
                      >
                        <span>{it.product?.name}</span>
                        <span className="font-mono text-stone-500">
                          {it.qty} × {fmtMoney(it.unit_price)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Returned list */}
                {returnedItems.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-red-200">
                    <div className="font-bold text-stone-700">الأصناف المحددة للإرجاع:</div>
                    {returnedItems.map((item, idx) => (
                      <div key={item.product_id} className="p-2 bg-white rounded border border-red-200 space-y-2">
                        <div className="flex items-center justify-between font-bold">
                          <span>{item.name}</span>
                          <button
                            type="button"
                            onClick={() => setReturnedItems(returnedItems.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Field label="الكمية">
                            <Input
                              type="number"
                              min="1"
                              max={item.maxQty}
                              value={item.qty}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 1
                                setReturnedItems(
                                  returnedItems.map((it, i) => (i === idx ? { ...it, qty: val } : it)),
                                )
                              }}
                            />
                          </Field>
                          <Field label="سعر الوحدة">
                            <Input value={item.unit_price} readOnly />
                          </Field>
                          <Field label="الحالة">
                            <Select
                              value={item.condition}
                              onChange={(e) => {
                                const val = e.target.value
                                setReturnedItems(
                                  returnedItems.map((it, i) => (i === idx ? { ...it, condition: val } : it)),
                                )
                              }}
                            >
                              <option value="resalable">صالح للبيع</option>
                              <option value="damaged">تالف</option>
                            </Select>
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Given Replacement Items (للعميل) */}
              <div className="space-y-3 border border-emerald-200 rounded-xl p-4 bg-emerald-50/30">
                <div className="flex items-center justify-between font-bold text-emerald-800 text-sm">
                  <span>2. الأصناف البديلة (الجديدة للعميل)</span>
                  <span className="font-mono font-bold text-emerald-700">{fmtMoney(givenTotal)}</span>
                </div>

                <ProductPicker
                  placeholder="ابحث عن منتج بديل لإضافته..."
                  priceField="retail_price"
                  onPick={addGivenProduct}
                />

                {/* Selected Given list */}
                {givenItems.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="font-bold text-stone-700">الأصناف البديلة المختارة:</div>
                    {givenItems.map((item, idx) => (
                      <div key={item.product_id} className="p-2 bg-white rounded border border-emerald-200 space-y-2">
                        <div className="flex items-center justify-between font-bold">
                          <span>{item.name}</span>
                          <button
                            type="button"
                            onClick={() => setGivenItems(givenItems.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="الكمية المطلوبة">
                            <Input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 1
                                setGivenItems(
                                  givenItems.map((it, i) => (i === idx ? { ...it, qty: val } : it)),
                                )
                              }}
                            />
                          </Field>
                          <Field label="السعر">
                            <Input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0
                                setGivenItems(
                                  givenItems.map((it, i) => (i === idx ? { ...it, unit_price: val } : it)),
                                )
                              }}
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settlement Summary */}
          {selectedInvoice && (
            <div className="card p-4 bg-brand-50/60 border border-brand-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-200 pb-3">
                <div>
                  <div className="text-xs font-semibold text-stone-500">حساب الفارق المالي الصافي:</div>
                  <div className="text-base font-bold text-brand-900 mt-0.5">
                    {difference > 0 ? (
                      <span className="text-emerald-700">مطلوب تحصيل من العميل: {fmtMoney(difference)}</span>
                    ) : difference < 0 ? (
                      <span className="text-red-600">مطلوب إرجاع باقي للعميل: {fmtMoney(Math.abs(difference))}</span>
                    ) : (
                      <span className="text-stone-700">القيمة متعادلة تماماً (0 ريال)</span>
                    )}
                  </div>
                </div>

                {difference !== 0 && (
                  <div className="w-64">
                    <Field label="طريقة دفع / رد الفارق *">
                      <Select
                        value={settlementMethodId}
                        onChange={(e) => setSettlementMethodId(e.target.value)}
                      >
                        <option value="">اختر طريقة الدفع...</option>
                        {paymentMethods?.map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            {pm.name} {pm.is_cash ? '(نقدي)' : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Exchange Detail Modal */}
      {selectedExchange && (
        <Modal
          open={Boolean(selectedExchange)}
          onClose={() => setSelectedExchange(null)}
          title={`تفاصيل الاستبدال #${selectedExchange.exchange_no}`}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="bg-cream-100 p-4 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 border border-cream-300">
              <div>
                <span className="text-stone-400 block">الفاتورة الأصلية:</span>
                <span className="font-mono font-bold text-brand-900">{selectedExchange.invoice?.invoice_no || '-'}</span>
              </div>
              <div>
                <span className="text-stone-400 block">الفرع:</span>
                <span className="font-bold text-brand-900">{selectedExchange.branch?.name}</span>
              </div>
              <div>
                <span className="text-stone-400 block">العميل:</span>
                <span className="font-bold text-brand-900">{selectedExchange.customer?.name || 'نقدي'}</span>
              </div>
              <div>
                <span className="text-stone-400 block">الفارق المالي:</span>
                <span className="font-mono font-bold text-sm">
                  {Number(selectedExchange.difference) > 0
                    ? `+ ${fmtMoney(selectedExchange.difference)}`
                    : fmtMoney(selectedExchange.difference)}
                </span>
              </div>
            </div>

            {loadingItems ? (
              <Spinner />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Returned */}
                <div className="space-y-2">
                  <h4 className="font-bold text-red-800 flex items-center gap-1">
                    <span>الأصناف المسترجعة (وارد للمخزون)</span>
                  </h4>
                  <div className="card overflow-hidden border-red-200">
                    <table className="w-full text-start text-xs">
                      <thead className="bg-red-50 text-red-900 font-bold">
                        <tr>
                          <th className="p-2 text-start">المنتج</th>
                          <th className="p-2 text-center">الكمية</th>
                          <th className="p-2 text-end">القيمة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {exchangeItems
                          ?.filter((i) => i.direction === 'returned')
                          .map((i) => (
                            <tr key={i.id}>
                              <td className="p-2 font-semibold">{i.product?.name}</td>
                              <td className="p-2 text-center font-mono">{i.qty}</td>
                              <td className="p-2 text-end font-mono">{fmtMoney(Number(i.qty) * Number(i.unit_price))}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Given */}
                <div className="space-y-2">
                  <h4 className="font-bold text-emerald-800 flex items-center gap-1">
                    <span>الأصناف البديلة (صادر للعميل)</span>
                  </h4>
                  <div className="card overflow-hidden border-emerald-200">
                    <table className="w-full text-start text-xs">
                      <thead className="bg-emerald-50 text-emerald-900 font-bold">
                        <tr>
                          <th className="p-2 text-start">المنتج</th>
                          <th className="p-2 text-center">الكمية</th>
                          <th className="p-2 text-end">القيمة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100">
                        {exchangeItems
                          ?.filter((i) => i.direction === 'given')
                          .map((i) => (
                            <tr key={i.id}>
                              <td className="p-2 font-semibold">{i.product?.name}</td>
                              <td className="p-2 text-center font-mono">{i.qty}</td>
                              <td className="p-2 text-end font-mono">{fmtMoney(Number(i.qty) * Number(i.unit_price))}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
