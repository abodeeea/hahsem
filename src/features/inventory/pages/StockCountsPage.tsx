import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Plus, Search, CheckCircle2, Clock, XCircle, Printer, Save, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/store/auth.store'
import { fmtMoney, fmtNum, fmtDateTime } from '@/lib/formatters'
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

interface StockCount {
  id: string
  count_no: string
  branch_id: string
  branch?: { id: string; name: string }
  status: 'draft' | 'in_progress' | 'approved' | 'cancelled'
  started_at: string
  approved_by?: string
  approver?: { full_name: string }
  approved_at?: string
  note?: string
  created_at: string
  items_count?: number
}

interface StockCountItem {
  id: string
  count_id: string
  product_id: string
  product?: { name: string; sku: string; barcode?: string; cost_price: number }
  system_qty: number
  actual_qty: number | null
  diff_qty: number | null
  diff_value?: number | null
  reason?: string
}

export default function StockCountsPage() {
  const qc = useQueryClient()
  const { can, seesAllBranches } = usePermission()
  const userBranchId = useAuth((s) => s.profile?.branch_id) ?? ''

  const [branchFilter, setBranchFilter] = useState(seesAllBranches ? '' : userBranchId)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Create count modal
  const [isStartOpen, setIsStartOpen] = useState(false)
  const [startBranchId, setStartBranchId] = useState(userBranchId)
  const [startNote, setStartNote] = useState('')
  const [startLoading, setStartLoading] = useState(false)

  // Manage / view count modal
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null)
  const [itemSearch, setItemSearch] = useState('')
  const [editedItems, setEditedItems] = useState<Record<string, { actual_qty: number | ''; reason: string }>>({})
  const [savingItems, setSavingItems] = useState(false)
  const [approving, setApproving] = useState(false)

  const canCreate = can('stock_counts', 'create')
  const canApprove = can('stock_counts', 'approve')

  // Load stock counts list
  const { data: counts = [], isLoading } = useQuery<StockCount[]>({
    queryKey: ['stock_counts_list', branchFilter, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('stock_counts')
        .select(`
          id,
          count_no,
          branch_id,
          status,
          started_at,
          approved_at,
          note,
          created_at,
          branch:branches(id, name),
          approver:profiles!approved_by(full_name),
          stock_count_items(count)
        `)
        .order('created_at', { ascending: false })

      if (branchFilter) q = q.eq('branch_id', branchFilter)
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)

      const { data, error } = await q
      if (error) throw error
      return (data || []).map((row: any) => ({
        ...row,
        items_count: row.stock_count_items?.[0]?.count || 0,
      }))
    },
  })

  // Load single count detail
  const { data: currentCount } = useQuery<StockCount | null>({
    queryKey: ['stock_count_detail', selectedCountId],
    enabled: !!selectedCountId,
    queryFn: async () => {
      if (!selectedCountId) return null
      const { data, error } = await supabase
        .from('stock_counts')
        .select(`
          id,
          count_no,
          branch_id,
          status,
          started_at,
          approved_at,
          note,
          created_at,
          branch:branches(id, name),
          approver:profiles!approved_by(full_name)
        `)
        .eq('id', selectedCountId)
        .single()
      if (error) throw error
      return (data as any) as StockCount
    },
  })

  // Load items of selected count
  const { data: countItems = [], isLoading: isLoadingItems } = useQuery<StockCountItem[]>({
    queryKey: ['stock_count_items', selectedCountId],
    enabled: !!selectedCountId,
    queryFn: async () => {
      if (!selectedCountId) return []
      const { data, error } = await supabase
        .from('stock_count_items')
        .select(`
          id,
          count_id,
          product_id,
          system_qty,
          actual_qty,
          diff_qty,
          diff_value,
          reason,
          product:products(name, sku, barcode, cost_price)
        `)
        .eq('count_id', selectedCountId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []) as any
    },
  })

  // Handle starting a new stock count
  const handleStartCount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startBranchId) return toast.error('يرجى اختيار الفرع أولاً')
    setStartLoading(true)
    try {
      const { data, error } = await supabase.rpc('fn_start_stock_count', {
        p_branch: startBranchId,
        p_note: startNote || null,
      })
      if (error) throw error
      toast.success('تم بدء عملية الجرد بنجاح وحصر الكميات الحالية بالنظام')
      setIsStartOpen(false)
      setStartNote('')
      qc.invalidateQueries({ queryKey: ['stock_counts_list'] })
      if (data) {
        setSelectedCountId(data)
        setEditedItems({})
      }
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setStartLoading(false)
    }
  }

  // Handle item change
  const handleActualQtyChange = (itemId: string, val: string, defaultReason = '') => {
    const num = val === '' ? '' : Math.max(0, Number(val))
    setEditedItems((prev) => ({
      ...prev,
      [itemId]: {
        actual_qty: num,
        reason: prev[itemId]?.reason ?? defaultReason,
      },
    }))
  }

  const handleReasonChange = (itemId: string, reason: string, defaultQty: number | null) => {
    setEditedItems((prev) => ({
      ...prev,
      [itemId]: {
        actual_qty: prev[itemId]?.actual_qty ?? (defaultQty ?? ''),
        reason,
      },
    }))
  }

  // Save modified items
  const handleSaveItems = async () => {
    const keys = Object.keys(editedItems)
    if (keys.length === 0) return toast.info('لم يتم إجراء أي تعديلات')
    setSavingItems(true)
    try {
      for (const id of keys) {
        const item = editedItems[id]
        if (item.actual_qty === '') continue
        const { error } = await supabase
          .from('stock_count_items')
          .update({
            actual_qty: Number(item.actual_qty),
            reason: item.reason || null,
          })
          .eq('id', id)
        if (error) throw error
      }
      toast.success('تم حفظ التعديلات بنجاح')
      setEditedItems({})
      qc.invalidateQueries({ queryKey: ['stock_count_items', selectedCountId] })
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setSavingItems(false)
    }
  }

  // Approve stock count
  const handleApproveCount = async () => {
    if (!selectedCountId) return
    const uncounted = countItems.filter((i) => {
      const ed = editedItems[i.id]
      if (ed && ed.actual_qty !== '') return false
      return i.actual_qty === null
    })
    if (uncounted.length > 0) {
      return toast.error(`لا يمكن الاعتماد قبل إدخال الكميات الفعلية لكافة الأصناف (${uncounted.length} صنف متبقي)`)
    }

    if (!window.confirm('هل أنت متأكد من اعتماد الجرد؟ سيتم توليد حركات تسوية مخزنية آلية بالفروقات وتحديث الأرصدة.')) {
      return
    }

    setApproving(true)
    try {
      if (Object.keys(editedItems).length > 0) {
        for (const id of Object.keys(editedItems)) {
          const item = editedItems[id]
          if (item.actual_qty !== '') {
            await supabase.from('stock_count_items').update({
              actual_qty: Number(item.actual_qty),
              reason: item.reason || null,
            }).eq('id', id)
          }
        }
      }

      const { data, error } = await supabase.rpc('fn_approve_stock_count', {
        p_count: selectedCountId,
      })
      if (error) throw error

      toast.success(`تم اعتماد الجرد بنجاح وتسوية ${data?.adjusted_items ?? 0} صنف!`)
      qc.invalidateQueries({ queryKey: ['stock_counts_list'] })
      qc.invalidateQueries({ queryKey: ['stock_count_detail', selectedCountId] })
      qc.invalidateQueries({ queryKey: ['stock_count_items', selectedCountId] })
      setEditedItems({})
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setApproving(false)
    }
  }

  // Filtered rows for table
  const filteredCounts = counts.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      c.count_no.toLowerCase().includes(q) ||
      c.branch?.name.toLowerCase().includes(q) ||
      (c.note && c.note.toLowerCase().includes(q))
    )
  })

  // Filtered count items inside modal
  const filteredItems = countItems.filter((item) => {
    if (!itemSearch) return true
    const q = itemSearch.toLowerCase()
    const p = item.product
    return (
      (p?.name && p.name.toLowerCase().includes(q)) ||
      (p?.sku && p.sku.toLowerCase().includes(q)) ||
      (p?.barcode && p.barcode.toLowerCase().includes(q))
    )
  })

  // Summary stats
  const totalCounts = counts.length
  const inProgressCounts = counts.filter((c) => c.status === 'in_progress').length
  const approvedCounts = counts.filter((c) => c.status === 'approved').length

  const getStatusBadge = (status: StockCount['status']) => {
    switch (status) {
      case 'in_progress':
        return <Badge tone="amber"><Clock className="h-3 w-3 inline ml-1" /> قيد الجرد</Badge>
      case 'approved':
        return <Badge tone="green"><CheckCircle2 className="h-3 w-3 inline ml-1" /> معتمد ومسوّى</Badge>
      case 'cancelled':
        return <Badge tone="red"><XCircle className="h-3 w-3 inline ml-1" /> ملغي</Badge>
      default:
        return <Badge tone="gray">مسودة</Badge>
    }
  }

  const columns: Column<StockCount>[] = [
    {
      key: 'count_no',
      header: 'رقم الجرد',
      render: (r) => (
        <button
          type="button"
          onClick={() => {
            setSelectedCountId(r.id)
            setEditedItems({})
          }}
          className="font-bold text-brand-700 hover:text-brand-900 underline text-right"
        >
          {r.count_no}
        </button>
      ),
    },
    {
      key: 'branch',
      header: 'الفرع',
      render: (r) => <span className="font-medium text-stone-800">{r.branch?.name || '—'}</span>,
    },
    {
      key: 'items_count',
      header: 'عدد الأصناف',
      render: (r) => <span>{fmtNum(r.items_count || 0)} صنف</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (r) => getStatusBadge(r.status),
    },
    {
      key: 'started_at',
      header: 'تاريخ البدء',
      render: (r) => <span className="text-xs text-stone-500">{fmtDateTime(r.started_at)}</span>,
    },
    {
      key: 'approved_at',
      header: 'الاعتماد',
      render: (r) =>
        r.approved_at ? (
          <div className="text-xs">
            <span className="text-stone-700 font-medium block">{r.approver?.full_name || 'المدير'}</span>
            <span className="text-stone-400">{fmtDateTime(r.approved_at)}</span>
          </div>
        ) : (
          <span className="text-stone-400 text-xs">في الانتظار</span>
        ),
    },
    {
      key: 'actions',
      header: 'الإجراء',
      render: (r) => (
        <Button
          size="sm"
          variant={r.status === 'in_progress' ? 'primary' : 'secondary'}
          onClick={() => {
            setSelectedCountId(r.id)
            setEditedItems({})
          }}
        >
          {r.status === 'in_progress' ? 'متابعة الجرد' : 'عرض المحضر'}
        </Button>
      ),
    },
  ]

  // Compute stats of items inside selected count
  const itemsStats = {
    total: countItems.length,
    entered: countItems.filter((i) => editedItems[i.id]?.actual_qty !== '' && (editedItems[i.id]?.actual_qty !== undefined || i.actual_qty !== null)).length,
    matched: countItems.filter((i) => {
      const val = editedItems[i.id]?.actual_qty !== undefined ? Number(editedItems[i.id].actual_qty) : i.actual_qty
      return val !== null && val === Number(i.system_qty)
    }).length,
    surplus: countItems.filter((i) => {
      const val = editedItems[i.id]?.actual_qty !== undefined ? Number(editedItems[i.id].actual_qty) : i.actual_qty
      return val !== null && val > Number(i.system_qty)
    }).length,
    shortage: countItems.filter((i) => {
      const val = editedItems[i.id]?.actual_qty !== undefined ? Number(editedItems[i.id].actual_qty) : i.actual_qty
      return val !== null && val < Number(i.system_qty)
    }).length,
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="الجرد المخزني"
        subtitle="حصر ومطابقة أرصدة المنتجات الفعلية بالفروع والمخزن الرئيسي وتسوية الفروقات"
        actions={
          canCreate ? (
            <Button onClick={() => {
              setStartBranchId(userBranchId || '')
              setIsStartOpen(true)
            }}>
              <Plus className="h-4 w-4 ml-1 inline" /> بدء جرد جديد
            </Button>
          ) : undefined
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={ClipboardList}
          label="إجمالي محاضر الجرد"
          value={String(totalCounts)}
          sub="كافة عمليات الجرد المسجلة بالنظام"
        />
        <StatCard
          icon={Clock}
          label="جرد قيد التنفيذ"
          value={String(inProgressCounts)}
          sub="محاضر مفتوحة بحاجة لإدخال الأرصدة والاعتماد"
        />
        <StatCard
          icon={CheckCircle2}
          label="محاضر معتمدة ومسوّاة"
          value={String(approvedCounts)}
          sub="تم اعتمادها وترحيل تسويات المخزون"
        />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              placeholder="بحث برقم الجرد أو الملاحظة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9"
            />
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

          <div className="w-40">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">كافة الحالات</option>
              <option value="in_progress">قيد الجرد</option>
              <option value="approved">معتمد</option>
              <option value="cancelled">ملغي</option>
            </Select>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['stock_counts_list'] })}
        >
          <RefreshCw className="h-4 w-4 ml-1 inline" /> تحديث
        </Button>
      </div>

      {/* Stock Counts Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          rows={filteredCounts}
          loading={isLoading}
          empty="لا توجد محاضر جرد تطابق معايير البحث"
        />
      </div>

      {/* Modal: Start New Stock Count */}
      {isStartOpen && (
        <Modal
          open
          onClose={() => setIsStartOpen(false)}
          title="بدء عملية جرد مخزني جديدة"
          size="md"
        >
          <form onSubmit={handleStartCount} className="space-y-4">
            <p className="text-sm text-stone-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
              💡 عند بدء الجرد، سيقوم النظام تلقائياً بتسجيل الأرصدة الحالية لجميع المنتجات في الفرع ككميات مسجلة (System Qty) لحساب الفروقات لاحقاً.
            </p>

            <Field label="الفرع المستهدف للجرد">
              <BranchSelect
                value={startBranchId}
                onChange={setStartBranchId}
              />
            </Field>

            <Field label="ملاحظات / سبب الجرد">
              <Textarea
                rows={2}
                placeholder="مثلاً: جرد ربع سنوي دوري لفرع الرياض..."
                value={startNote}
                onChange={(e) => setStartNote(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsStartOpen(false)}
              >
                إلغاء
              </Button>
              <Button type="submit" loading={startLoading}>
                بدء وحصر الأرصدة
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Count Entry & Inspector */}
      {selectedCountId && currentCount && (
        <Modal
          open
          onClose={() => {
            setSelectedCountId(null)
            setEditedItems({})
          }}
          title={`محضر جرد: ${currentCount.count_no} — ${currentCount.branch?.name || ''}`}
          size="xl"
        >
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200 text-sm">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-stone-500 block text-xs">الحالة</span>
                  <div className="mt-0.5">{getStatusBadge(currentCount.status)}</div>
                </div>
                <div>
                  <span className="text-stone-500 block text-xs">تاريخ البدء</span>
                  <span className="font-semibold text-stone-800">{fmtDateTime(currentCount.started_at)}</span>
                </div>
                {currentCount.approved_at && (
                  <div>
                    <span className="text-stone-500 block text-xs">تاريخ الاعتماد</span>
                    <span className="font-semibold text-emerald-700">
                      {fmtDateTime(currentCount.approved_at)} ({currentCount.approver?.full_name})
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4 ml-1 inline" /> طباعة المحضر
                </Button>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-stone-100 p-2.5 rounded-lg text-center">
                <div className="text-xs text-stone-500">إجمالي الأصناف</div>
                <div className="text-lg font-bold text-stone-800">{itemsStats.total}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-center">
                <div className="text-xs text-emerald-700">أصناف متطابقة</div>
                <div className="text-lg font-bold text-emerald-800">{itemsStats.matched}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg text-center">
                <div className="text-xs text-blue-700">أصناف بها زيادة (+)</div>
                <div className="text-lg font-bold text-blue-800">+{itemsStats.surplus}</div>
              </div>
              <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-lg text-center">
                <div className="text-xs text-rose-700">أصناف بها عجز (-)</div>
                <div className="text-lg font-bold text-rose-800">-{itemsStats.shortage}</div>
              </div>
            </div>

            {/* Item search & Save Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-stone-400" />
                <Input
                  placeholder="بحث في أصناف المحضر..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="pr-9"
                />
              </div>

              {currentCount.status === 'in_progress' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    loading={savingItems}
                    disabled={Object.keys(editedItems).length === 0}
                    onClick={handleSaveItems}
                  >
                    <Save className="h-4 w-4 ml-1 inline" /> حفظ التعديلات ({Object.keys(editedItems).length})
                  </Button>
                  {canApprove && (
                    <Button
                      variant="primary"
                      loading={approving}
                      onClick={handleApproveCount}
                    >
                      <CheckCircle2 className="h-4 w-4 ml-1 inline" /> اعتماد الجرد وتسوية المخزون
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Items Grid / Table */}
            <div className="max-h-[50vh] overflow-y-auto border border-stone-200 rounded-lg">
              <table className="w-full text-right text-xs">
                <thead className="bg-stone-100 text-stone-700 sticky top-0 border-b border-stone-200 z-10">
                  <tr>
                    <th className="p-2.5 font-bold">المنتج / الباركود</th>
                    <th className="p-2.5 font-bold w-24">الكمية بالنظام</th>
                    <th className="p-2.5 font-bold w-32">الكمية الفعلية</th>
                    <th className="p-2.5 font-bold w-24">الفرق</th>
                    {currentCount.status === 'approved' && (
                      <th className="p-2.5 font-bold w-28">قيمة الفرق</th>
                    )}
                    <th className="p-2.5 font-bold">سبب الفرق / ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {isLoadingItems ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-stone-400">
                        جاري تحميل أصناف الجرد...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-stone-400">
                        لا توجد منتجات مطابقة
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const editState = editedItems[item.id]
                      const isEdited = editState !== undefined
                      const currentVal = isEdited
                        ? editState.actual_qty
                        : item.actual_qty !== null
                        ? item.actual_qty
                        : ''
                      const diff =
                        currentVal !== ''
                          ? Number(currentVal) - Number(item.system_qty)
                          : item.diff_qty

                      const currentReason = isEdited
                        ? editState.reason
                        : item.reason || ''

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-stone-50/80 transition-colors ${
                            isEdited ? 'bg-amber-50/40' : ''
                          }`}
                        >
                          <td className="p-2.5">
                            <div className="font-bold text-stone-900">
                              {item.product?.name || '—'}
                            </div>
                            <div className="text-[11px] text-stone-400 flex gap-2">
                              <span>SKU: {item.product?.sku}</span>
                              {item.product?.barcode && (
                                <span dir="ltr">({item.product.barcode})</span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 font-semibold text-stone-700">
                            {fmtNum(item.system_qty)}
                          </td>
                          <td className="p-2.5">
                            {currentCount.status === 'in_progress' ? (
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                placeholder="أدخل الفعلي"
                                value={currentVal}
                                onChange={(e) =>
                                  handleActualQtyChange(
                                    item.id,
                                    e.target.value,
                                    currentReason
                                  )
                                }
                                className="h-8 text-xs font-bold text-center w-full"
                              />
                            ) : (
                              <span className="font-bold text-stone-900">
                                {item.actual_qty !== null
                                  ? fmtNum(item.actual_qty)
                                  : '—'}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {diff === null || diff === undefined ? (
                              <span className="text-stone-400 text-xs">لم يُحصر</span>
                            ) : diff === 0 ? (
                              <span className="text-stone-500 font-medium">0 (مطابق)</span>
                            ) : diff > 0 ? (
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded text-xs">
                                +{fmtNum(diff)}
                              </span>
                            ) : (
                              <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded text-xs">
                                {fmtNum(diff)}
                              </span>
                            )}
                          </td>
                          {currentCount.status === 'approved' && (
                            <td className="p-2.5 font-semibold">
                              {item.diff_value ? fmtMoney(item.diff_value) : '0'}
                            </td>
                          )}
                          <td className="p-2.5">
                            {currentCount.status === 'in_progress' ? (
                              <Input
                                type="text"
                                placeholder="سبب العجز أو الزيادة..."
                                value={currentReason}
                                onChange={(e) =>
                                  handleReasonChange(
                                    item.id,
                                    e.target.value,
                                    item.actual_qty
                                  )
                                }
                                className="h-8 text-xs"
                              />
                            ) : (
                              <span className="text-stone-600 text-xs">
                                {item.reason || '—'}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
