import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Package, Save, AlertCircle, ArrowUpRight, ArrowDownRight, RefreshCw, Warehouse } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { toast } from '@/store/toast.store'
import { fmtMoney, fmtNum } from '@/lib/formatters'
import { useBranches } from '@/hooks/useLookups'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'

export interface AdjustStockProduct {
  id: string
  name: string
  sku: string
  barcode?: string | null
  cost_price?: number | null
  unit?: { name: string } | null
  unit_name?: string | null
}

interface AdjustStockModalProps {
  product: AdjustStockProduct | null
  branchId?: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const COMMON_REASONS = [
  'تسوية مخزنية وتصحيح رصيد',
  'رصيد أول المدة / افتتاحي',
  'جرد يدوي ومطابقة المخزن',
  'بضاعة واردة إضافية',
  'تعديل خطأ إدخال سابق',
  'إتلاف / هالك غير مسجل',
]

export function AdjustStockModal({
  product,
  branchId: initialBranchId,
  isOpen,
  onClose,
  onSuccess,
}: AdjustStockModalProps) {
  const qc = useQueryClient()
  const { data: branches = [] } = useBranches()
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [newQuantity, setNewQuantity] = useState<number | string>(0)
  const [reason, setReason] = useState<string>('تسوية مخزنية وتصحيح رصيد')
  const [submitting, setSubmitting] = useState(false)

  // Initialize selected branch when opened
  useEffect(() => {
    if (isOpen) {
      if (initialBranchId) {
        setSelectedBranchId(initialBranchId)
      } else if (branches.length > 0 && !selectedBranchId) {
        setSelectedBranchId(branches[0].id)
      }
    }
  }, [isOpen, initialBranchId, branches, selectedBranchId])

  // Fetch current stock for this product in the selected branch
  const { data: currentStock = 0, isLoading: loadingStock, refetch } = useQuery({
    queryKey: ['product_branch_stock', product?.id, selectedBranchId],
    enabled: isOpen && !!product?.id && !!selectedBranchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balances')
        .select('qty_on_hand')
        .eq('product_id', product!.id)
        .eq('branch_id', selectedBranchId)
        .maybeSingle()

      if (error) {
        console.error('Error fetching stock balance:', error)
        return 0
      }
      return Number(data?.qty_on_hand ?? 0)
    },
  })

  // When currentStock changes and modal just opened or branch switched, default newQuantity to currentStock
  useEffect(() => {
    if (isOpen && !loadingStock) {
      setNewQuantity(currentStock)
    }
  }, [isOpen, currentStock, loadingStock, selectedBranchId])

  if (!product) return null

  const unitName = product.unit?.name || product.unit_name || 'حبة'
  const currentQtyNum = Number(currentStock || 0)
  const targetQtyNum = newQuantity === '' ? 0 : Number(newQuantity)
  const diff = targetQtyNum - currentQtyNum
  const costPrice = Number(product.cost_price || 0)
  const totalValue = targetQtyNum * costPrice

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBranchId) {
      toast.error('يرجى اختيار الفرع أو المخزن')
      return
    }

    if (newQuantity === '' || isNaN(targetQtyNum) || targetQtyNum < 0) {
      toast.error('يرجى إدخال كمية صحيحة أكبر من أو تساوي صفر')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('fn_adjust_stock', {
        p_product_id: product.id,
        p_branch_id: selectedBranchId,
        p_new_quantity: targetQtyNum,
        p_unit_cost: costPrice,
        p_reason: reason.trim() || 'تسوية مخزنية وتصحيح رصيد',
      })

      if (error) throw error

      toast.success(
        `تم تحديث رصيد ${product.name} إلى ${fmtNum(targetQtyNum)} ${unitName} بنجاح`
      )

      // Invalidate relevant queries
      qc.invalidateQueries({ queryKey: ['stock-status'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['products', 'stock-sum'] })
      qc.invalidateQueries({ queryKey: ['product_branch_stock'] })
      qc.invalidateQueries({ queryKey: ['product_stocks_all', product.id] })
      qc.invalidateQueries({ queryKey: ['pos-stock'] })
      qc.invalidateQueries({ queryKey: ['pos-products'] })

      onSuccess?.()
      onClose()
    } catch (err: any) {
      toast.error(errMsg(err))
    } finally {
      setSubmitting(false)
    }
  }

  const applyDelta = (delta: number) => {
    const next = Math.max(0, targetQtyNum + delta)
    setNewQuantity(next)
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="تعديل وتحديث كمية المخزون"
      size="lg"
    >
      <form onSubmit={handleAdjust} className="space-y-4">
        {/* Product summary card */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-brand-700" />
              <h4 className="font-bold text-stone-900 text-sm">{product.name}</h4>
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-500 mt-1 font-mono">
              <span>SKU: {product.sku}</span>
              {product.barcode && <span>الباركود: {product.barcode}</span>}
              <span>التكلفة: {fmtMoney(costPrice)}</span>
            </div>
          </div>
          <Badge tone="blue">{unitName}</Badge>
        </div>

        {/* Branch selector */}
        <Field label="المخزن / الفرع المستهدف *">
          <Select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            disabled={submitting}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} {b.type === 'main_warehouse' ? '(المستودع الرئيسي)' : '(فرع بيع)'}
              </option>
            ))}
          </Select>
        </Field>

        {/* Current Stock Display */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-cream-100 border border-stone-200 text-xs">
          <span className="text-stone-600 font-medium">الرصيد الحالي المسجل بالفرع:</span>
          <div className="flex items-center gap-2 font-bold text-sm">
            {loadingStock ? (
              <RefreshCw className="h-4 w-4 animate-spin text-stone-400" />
            ) : (
              <>
                <span className={currentQtyNum === 0 ? 'text-red-600' : 'text-stone-900'}>
                  {fmtNum(currentQtyNum)} {unitName}
                </span>
                <Badge tone={currentQtyNum <= 0 ? 'red' : 'green'}>
                  {currentQtyNum <= 0 ? 'نافد' : 'متوفر'}
                </Badge>
              </>
            )}
          </div>
        </div>

        {/* New Quantity Input */}
        <div>
          <Field label="الكمية الجديدة الفعلية بالمخزن *">
            <Input
              type="number"
              min={0}
              step="any"
              className="text-lg font-bold text-brand-900"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              placeholder="0"
              autoFocus
              required
            />
          </Field>

          {/* Quick Increment/Decrement Buttons */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[11px] text-stone-400 self-center me-1">تعديل سريع:</span>
            {[+1, +5, +10, +50].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => applyDelta(d)}
                className="px-2 py-1 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
              >
                +{d}
              </button>
            ))}
            {[-1, -5, -10].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => applyDelta(d)}
                className="px-2 py-1 text-xs font-semibold rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setNewQuantity(0)}
              className="px-2 py-1 text-xs font-semibold rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
            >
              تصفير (0)
            </button>
          </div>
        </div>

        {/* Difference & Impact Summary */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs">
          <div>
            <span className="text-stone-500 block">الفارق عن المسجل:</span>
            <div className="flex items-center gap-1 font-bold mt-0.5">
              {diff > 0 ? (
                <>
                  <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                  <span className="text-emerald-700">+{fmtNum(diff)} {unitName} (إضافة)</span>
                </>
              ) : diff < 0 ? (
                <>
                  <ArrowDownRight className="h-4 w-4 text-red-600" />
                  <span className="text-red-700">{fmtNum(diff)} {unitName} (خصم)</span>
                </>
              ) : (
                <span className="text-stone-500">لا يوجد تغيير في الكمية</span>
              )}
            </div>
          </div>

          <div className="text-end">
            <span className="text-stone-500 block">إجمالي قيمة المخزون الجديد:</span>
            <span className="text-sm font-bold text-stone-900 mt-0.5 block">
              {fmtMoney(totalValue)}
            </span>
          </div>
        </div>

        {/* Reason */}
        <div>
          <Field label="سبب التعديل / ملاحظات">
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mb-2"
            >
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="أو اكتب سبباً مخصصاً..."
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
          <Button type="submit" loading={submitting}>
            <Save className="h-4 w-4 ml-1 inline" />
            حفظ وتحديث المخزون
          </Button>
        </div>
      </form>
    </Modal>
  )
}
