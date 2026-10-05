import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, Search, Trash2, Calendar, FileText, TrendingDown, Layers, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/store/auth.store'
import { fmtMoney, fmtNum, fmtDate } from '@/lib/formatters'
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

interface DamagedItemRow {
  id: string
  branch_id: string
  branch?: { id: string; name: string }
  product_id: string
  product?: { name: string; sku: string; barcode?: string; cost_price: number }
  qty: number
  unit_cost: number
  total_value: number
  reason?: string
  source_type: 'manual' | 'sales_return' | 'count'
  source_id?: string
  damaged_at: string
  created_at: string
  reporter?: { full_name: string }
}

export default function DamagedItemsPage() {
  const qc = useQueryClient()
  const { can, seesAllBranches } = usePermission()
  const userBranchId = useAuth((s) => s.profile?.branch_id) ?? ''

  const [branchFilter, setBranchFilter] = useState(seesAllBranches ? '' : userBranchId)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // New Damage Modal State
  const [isNewOpen, setIsNewOpen] = useState(false)
  const [formBranchId, setFormBranchId] = useState(userBranchId || '')
  const [formProductId, setFormProductId] = useState('')
  const [formQty, setFormQty] = useState('')
  const [formUnitCost, setFormUnitCost] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formReason, setFormReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canCreate = can('damaged', 'create')

  // Load damaged items
  const { data: damagedItems = [], isLoading } = useQuery<DamagedItemRow[]>({
    queryKey: ['damaged_items_list', branchFilter, sourceFilter],
    queryFn: async () => {
      let q = supabase
        .from('damaged_items')
        .select(`
          id,
          branch_id,
          product_id,
          qty,
          unit_cost,
          total_value,
          reason,
          source_type,
          source_id,
          damaged_at,
          created_at,
          branch:branches(id, name),
          product:products(name, sku, barcode, cost_price),
          reporter:profiles!reported_by(full_name)
        `)
        .order('damaged_at', { ascending: false })

      if (branchFilter) q = q.eq('branch_id', branchFilter)
      if (sourceFilter !== 'all') q = q.eq('source_type', sourceFilter)

      const { data, error } = await q
      if (error) throw error
      return (data || []) as any
    },
  })

  // Load products list for dropdown
  const { data: products = [] } = useQuery({
    queryKey: ['products_lookup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, barcode, cost_price')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data || []
    },
  })

  // Load stock on hand for selected product and branch in form
  const { data: currentStock } = useQuery({
    queryKey: ['product_stock_for_damage', formBranchId, formProductId],
    enabled: !!formBranchId && !!formProductId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand, avg_cost')
        .eq('branch_id', formBranchId)
        .eq('product_id', formProductId)
        .maybeSingle()
      if (error) throw error
      return data || { qty_on_hand: 0, avg_cost: 0 }
    },
  })

  // When product changes, pre-fill unit cost
  const handleProductSelect = (pId: string) => {
    setFormProductId(pId)
    const p = products.find((x) => x.id === pId)
    if (p) {
      setFormUnitCost(String(p.cost_price || 0))
    }
  }

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formBranchId) return toast.error('يرجى اختيار الفرع')
    if (!formProductId) return toast.error('يرجى اختيار المنتج')
    const qtyNum = Number(formQty)
    if (!qtyNum || qtyNum <= 0) return toast.error('الكمية يجب أن تكون أكبر من الصفر')

    const availableStock = currentStock?.qty_on_hand ?? 0
    if (qtyNum > availableStock) {
      return toast.error(`الكمية التالفة (${qtyNum}) تتجاوز الرصيد المتاح في الفرع (${availableStock})`)
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('damaged_items').insert({
        branch_id: formBranchId,
        product_id: formProductId,
        qty: qtyNum,
        unit_cost: formUnitCost ? Number(formUnitCost) : (currentStock?.avg_cost || 0),
        reason: formReason || null,
        source_type: 'manual',
        damaged_at: formDate,
      })

      if (error) throw error

      toast.success('تم تسجيل التالف وخصمه من المخزون بنجاح')
      setIsNewOpen(false)
      setFormProductId('')
      setFormQty('')
      setFormReason('')
      qc.invalidateQueries({ queryKey: ['damaged_items_list'] })
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered rows
  const filteredRows = damagedItems.filter((item) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const p = item.product
    return (
      (p?.name && p.name.toLowerCase().includes(q)) ||
      (p?.sku && p.sku.toLowerCase().includes(q)) ||
      (p?.barcode && p.barcode.toLowerCase().includes(q)) ||
      (item.branch?.name && item.branch.name.toLowerCase().includes(q)) ||
      (item.reason && item.reason.toLowerCase().includes(q))
    )
  })

  // KPI Calculations
  const totalItemsCount = damagedItems.length
  const totalQtyDamaged = damagedItems.reduce((acc, cur) => acc + Number(cur.qty || 0), 0)
  const totalValueDamaged = damagedItems.reduce((acc, cur) => acc + Number(cur.total_value || 0), 0)

  const getSourceBadge = (type: DamagedItemRow['source_type']) => {
    switch (type) {
      case 'manual':
        return <Badge tone="amber">تسجيل يدوي (هالك)</Badge>
      case 'sales_return':
        return <Badge tone="purple">مرتجع مبيعات تالف</Badge>
      case 'count':
        return <Badge tone="blue">تسوية جرد</Badge>
      default:
        return <Badge tone="gray">{type}</Badge>
    }
  }

  const columns: Column<DamagedItemRow>[] = [
    {
      key: 'damaged_at',
      header: 'التاريخ',
      render: (r) => <span className="font-semibold text-stone-800">{fmtDate(r.damaged_at)}</span>,
    },
    {
      key: 'branch',
      header: 'الفرع',
      render: (r) => <span>{r.branch?.name || '—'}</span>,
    },
    {
      key: 'product',
      header: 'المنتج',
      render: (r) => (
        <div>
          <div className="font-bold text-stone-900">{r.product?.name || '—'}</div>
          <div className="text-[11px] text-stone-400 flex gap-2">
            <span>SKU: {r.product?.sku}</span>
            {r.product?.barcode && <span dir="ltr">({r.product.barcode})</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'الكمية التالفة',
      render: (r) => <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">{fmtNum(r.qty)}</span>,
    },
    {
      key: 'unit_cost',
      header: 'سعر التكلفة',
      render: (r) => fmtMoney(r.unit_cost),
    },
    {
      key: 'total_value',
      header: 'إجمالي القيمة',
      render: (r) => <span className="font-bold text-stone-900">{fmtMoney(r.total_value)}</span>,
    },
    {
      key: 'source_type',
      header: 'المصدر',
      render: (r) => getSourceBadge(r.source_type),
    },
    {
      key: 'reason',
      header: 'السبب / الملاحظات',
      render: (r) => <span className="text-xs text-stone-600">{r.reason || '—'}</span>,
    },
    {
      key: 'reported_by',
      header: 'المسؤول',
      render: (r) => <span className="text-xs text-stone-500">{r.reporter?.full_name || '—'}</span>,
    },
  ]

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="التالف والهالك"
        subtitle="سجل المنتجات التالفة والمنتهية الصلاحية وإدارتها وخصمها من المخزون"
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setFormBranchId(userBranchId || '')
                setIsNewOpen(true)
              }}
            >
              <Plus className="h-4 w-4 ml-1 inline" /> تسجيل تالف جديد
            </Button>
          ) : undefined
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={AlertTriangle}
          label="إجمالي قيمة التالف"
          value={fmtMoney(totalValueDamaged)}
          sub="إجمالي الخسارة الناتجة عن المنتجات التالفة"
        />
        <StatCard
          icon={TrendingDown}
          label="إجمالي الكميات التالفة"
          value={fmtNum(totalQtyDamaged)}
          sub="مجموع عدد الوحدات والقطع التالفة"
        />
        <StatCard
          icon={FileText}
          label="عدد سجلات التالف"
          value={String(totalItemsCount)}
          sub="كافة العمليات المسجلة"
        />
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              placeholder="بحث بالمنتج، الباركود، الفرع أو السبب..."
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

          <div className="w-44">
            <Select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="all">كافة المصادر</option>
              <option value="manual">تسجيل يدوي (هالك)</option>
              <option value="sales_return">مرتجع مبيعات</option>
              <option value="count">تسوية جرد</option>
            </Select>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['damaged_items_list'] })}
        >
          <RefreshCw className="h-4 w-4 ml-1 inline" /> تحديث
        </Button>
      </div>

      {/* Damaged Items Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          rows={filteredRows}
          loading={isLoading}
          empty="لا توجد سجلات تالف تطابق معايير البحث"
        />
      </div>

      {/* Modal: New Damaged Item */}
      {isNewOpen && (
        <Modal
          open
          onClose={() => setIsNewOpen(false)}
          title="تسجيل صنف تالف / هالك جديد"
          size="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="الفرع">
              <BranchSelect
                value={formBranchId}
                onChange={setFormBranchId}
              />
            </Field>

            <Field label="المنتج">
              <Select
                value={formProductId}
                onChange={(e) => handleProductSelect(e.target.value)}
              >
                <option value="">-- اختر المنتج --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.sku ? `(${p.sku})` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            {formProductId && (
              <div className="bg-stone-50 border border-stone-200 p-3 rounded-lg text-xs flex justify-between">
                <span className="text-stone-500">الرصيد المتاح حالياً بالفرع:</span>
                <span className="font-bold text-stone-800">
                  {fmtNum(currentStock?.qty_on_hand ?? 0)} وحدة
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="الكمية التالفة">
                <Input
                  type="number"
                  step="any"
                  min={1}
                  placeholder="مثلاً: 2"
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                />
              </Field>

              <Field label="تكلفة الوحدة (SAR)">
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={formUnitCost}
                  onChange={(e) => setFormUnitCost(e.target.value)}
                />
              </Field>
            </div>

            {Number(formQty) > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg flex justify-between items-center text-sm font-bold text-rose-800">
                <span>إجمالي الخسارة المقدرة:</span>
                <span>{fmtMoney(Number(formQty) * (Number(formUnitCost) || 0))}</span>
              </div>
            )}

            <Field label="تاريخ التلف">
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </Field>

            <Field label="سبب التلف / ملاحظات">
              <Textarea
                rows={2}
                placeholder="مثلاً: كسر في الزجاجة أثناء الترتيب، انتهاء الصلاحية..."
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsNewOpen(false)}
              >
                إلغاء
              </Button>
              <Button type="submit" variant="danger" loading={submitting}>
                تسجيل التالف والخصم
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
