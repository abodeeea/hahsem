import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Package, Warehouse, Boxes, Pencil, History, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { toast } from '@/store/toast.store'
import { fmtMoney, fmtNum } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useBranches, useMainWarehouse } from '@/hooks/useLookups'
import { AdjustStockModal } from '../components/AdjustStockModal'

const num = (label: string) => z.number({ invalid_type_error: `${label}: أدخل رقماً` }).min(0, `${label}: لا يقل عن صفر`)

const schema = z.object({
  name: z.string().min(2, 'اسم المنتج مطلوب'),
  sku: z.string().min(1, 'رمز المنتج مطلوب'),
  barcode: z.string().optional(),
  category_id: z.string().min(1, 'اختر التصنيف'),
  unit_id: z.string().min(1, 'اختر الوحدة'),
  size_label: z.string().optional(),
  cost_price: num('سعر الشراء'),
  wholesale_price: num('سعر الجملة'),
  retail_price: num('سعر البيع'),
  min_stock: num('الحد الأدنى'),
  tax_rate_id: z.string().optional(),
  is_active: z.boolean(),
  initial_quantity: z.number().min(0).optional(),
  initial_branch_id: z.string().optional(),
})
type Form = z.infer<typeof schema>

export default function ProductFormPage() {
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const qc = useQueryClient()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [adjustingBranchId, setAdjustingBranchId] = useState<string | null>(null)

  const { data: mainWarehouse } = useMainWarehouse()
  const { data: branches = [] } = useBranches()

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      is_active: true,
      cost_price: 0,
      wholesale_price: 0,
      retail_price: 0,
      min_stock: 0,
      initial_quantity: 0,
      initial_branch_id: '',
    },
  })

  // Set default initial branch to main warehouse or first active branch
  useEffect(() => {
    if (!editing && mainWarehouse?.id) {
      setValue('initial_branch_id', mainWarehouse.id)
    } else if (!editing && branches.length > 0) {
      setValue('initial_branch_id', branches[0].id)
    }
  }, [editing, mainWarehouse, branches, setValue])

  const lookups = useQuery({
    queryKey: ['product-form-lookups'],
    queryFn: async () => {
      const [c, u, t] = await Promise.all([
        supabase.from('categories').select('id,name').eq('is_active', true).order('sort_order'),
        supabase.from('units').select('id,name').eq('is_active', true).order('name'),
        supabase.from('tax_rates').select('id,name,rate').eq('is_active', true).order('name'),
      ])
      return { cats: c.data ?? [], units: u.data ?? [], taxes: t.data ?? [] }
    },
  })

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    enabled: editing,
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*, unit:units(name)').eq('id', id!).single()
      if (error) throw error
      return data
    },
  })

  // Load current branch balances for editing mode
  const { data: branchStocks = [], refetch: refetchStocks } = useQuery({
    queryKey: ['product_stocks_all', id],
    enabled: editing && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_stock_status')
        .select('*')
        .eq('product_id', id!)
        .order('branch_name')
      if (error) throw error
      return data ?? []
    },
  })

  useEffect(() => {
    if (product) {
      reset({
        ...product,
        barcode: product.barcode ?? '',
        size_label: product.size_label ?? '',
        tax_rate_id: product.tax_rate_id ?? '',
        cost_price: Number(product.cost_price),
        wholesale_price: Number(product.wholesale_price),
        retail_price: Number(product.retail_price),
        min_stock: Number(product.min_stock),
        initial_quantity: 0,
        initial_branch_id: '',
      })
      setImageUrl(product.image_url)
    }
  }, [product, reset])

  const uploadImage = async (file: File) => {
    setUploading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { cacheControl: '3600' })
    setUploading(false)
    if (error) return toast.error(errMsg(error))
    setImageUrl(supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl)
  }

  const onSubmit = async (v: Form) => {
    const { initial_quantity = 0, initial_branch_id, ...prodFields } = v
    const payload = {
      ...prodFields,
      barcode: prodFields.barcode || null,
      size_label: prodFields.size_label || null,
      tax_rate_id: prodFields.tax_rate_id || null,
      image_url: imageUrl,
    }

    if (editing) {
      const { error } = await supabase.from('products').update(payload).eq('id', id!)
      if (error) return toast.error(errMsg(error))
      toast.success('تم حفظ بيانات المنتج بنجاح')
    } else {
      const { data: created, error } = await supabase
        .from('products')
        .insert(payload)
        .select('id, name')
        .single()

      if (error) return toast.error(errMsg(error))

      // Register initial stock quantity if specified via fn_adjust_stock RPC
      if (created && initial_branch_id) {
        const { error: adjustErr } = await supabase.rpc('fn_adjust_stock', {
          p_product_id: created.id,
          p_branch_id: initial_branch_id,
          p_new_quantity: Number(initial_quantity || 0),
          p_unit_cost: Number(v.cost_price || 0),
          p_reason: initial_quantity > 0 ? 'رصيد أول المدة عند إضافة المنتج' : 'تهيئة رصيد المنتج',
        })
        if (adjustErr) {
          console.error('Failed to adjust initial stock:', adjustErr)
          toast.error('تمت إضافة المنتج ولكن حدث خطأ في تسجيل رصيد المخزن: ' + errMsg(adjustErr))
        }
      }

      toast.success('تمت إضافة المنتج بنجاح وتحديث رصيد المخزن')
    }

    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['stock-status'] })
    qc.invalidateQueries({ queryKey: ['products_lookup'] })
    qc.invalidateQueries({ queryKey: ['products', 'stock-sum'] })
    nav('/products')
  }

  if (editing && isLoading) return <Spinner />
  const L = lookups.data

  const initialQtyVal = watch('initial_quantity') || 0
  const costPriceVal = watch('cost_price') || 0

  const totalStockAcrossBranches = branchStocks.reduce((sum, r) => sum + Number(r.qty_on_hand || 0), 0)
  const totalValueAcrossBranches = branchStocks.reduce((sum, r) => sum + Number(r.stock_value || 0), 0)

  return (
    <>
      <PageHeader
        title={editing ? `تعديل منتج: ${product?.name || ''}` : 'إضافة منتج جديد'}
        subtitle={editing ? 'تعديل البيانات الأساسية، الأسعار، وإدارة أرصدة المخازن' : 'إدخال مواصفات الصنف، الأسعار، ورصيد البداية'}
        actions={
          editing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => nav(`/products/${id}/movements`)}
            >
              <History className="h-4 w-4 ml-1 inline" /> كشف حركة المخزون
            </Button>
          )
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="card grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
        <div>
          <div className="mb-2 text-xs font-semibold text-stone-600">صورة المنتج</div>
          <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-cream-100 hover:border-brand-500 transition-colors">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="text-center text-stone-400">
                <ImagePlus className="mx-auto h-8 w-8" />
                <span className="text-xs">{uploading ? 'جارٍ الرفع...' : 'اضغط للرفع'}</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المنتج *" error={errors.name?.message} className="sm:col-span-2">
            <Input {...register('name')} placeholder="مثال: عطر مسك الختام 50 مل" />
          </Field>
          <Field label="رمز المنتج (SKU) *" error={errors.sku?.message}>
            <Input dir="ltr" {...register('sku')} placeholder="مثال: PRD-001" />
          </Field>
          <Field label="الباركود" error={errors.barcode?.message}>
            <Input dir="ltr" {...register('barcode')} placeholder="مثال: 628110001001" />
          </Field>
          <Field label="التصنيف *" error={errors.category_id?.message}>
            <Select {...register('category_id')}>
              <option value="">— اختر التصنيف —</option>
              {L?.cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الوحدة *" error={errors.unit_id?.message}>
            <Select {...register('unit_id')}>
              <option value="">— اختر الوحدة —</option>
              {L?.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الحجم / السعة / النوع">
            <Input placeholder="مثال: 100 مل / توله" {...register('size_label')} />
          </Field>
          <Field label="الضريبة">
            <Select {...register('tax_rate_id')}>
              <option value="">بدون ضريبة</option>
              {L?.taxes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.rate}%)
                </option>
              ))}
            </Select>
          </Field>

          <Field label="سعر الشراء / التكلفة (SAR) *" error={errors.cost_price?.message}>
            <Input
              type="number"
              step="any"
              {...register('cost_price', { valueAsNumber: true })}
            />
          </Field>
          <Field label="سعر الجملة (SAR)" error={errors.wholesale_price?.message}>
            <Input
              type="number"
              step="any"
              {...register('wholesale_price', { valueAsNumber: true })}
            />
          </Field>
          <Field label="سعر البيع للمستهلك (SAR) *" error={errors.retail_price?.message}>
            <Input
              type="number"
              step="any"
              {...register('retail_price', { valueAsNumber: true })}
            />
          </Field>
          <Field label="الحد الأدنى للمخزون (تنبيه النواقص)" error={errors.min_stock?.message}>
            <Input
              type="number"
              step="any"
              {...register('min_stock', { valueAsNumber: true })}
            />
          </Field>

          {/* Initial Stock Section (When creating a new product) */}
          {!editing && (
            <div className="sm:col-span-2 p-4 bg-brand-50/50 border border-brand-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-brand-900 font-bold text-sm">
                <Package className="h-4 w-4 text-brand-700" />
                <span>رصيد أول المدة والمخزون الابتدائي</span>
              </div>
              <p className="text-xs text-stone-500">
                حدد الكمية المتوفرة حالياً ليتم إيداعها وتحديث رصيد المخزن المختار تلقائياً عند حفظ المنتج.
              </p>

              <div className="grid sm:grid-cols-2 gap-3 pt-1">
                <Field label="الكمية الابتدائية المتوفرة">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="0"
                    {...register('initial_quantity', { valueAsNumber: true })}
                  />
                </Field>

                <Field label="المخزن / الفرع المستلم">
                  <Select {...register('initial_branch_id')}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.type === 'main_warehouse' ? '(المخزن الرئيسي)' : '(فرع)'}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {initialQtyVal > 0 && (
                <div className="text-xs text-brand-800 font-semibold bg-white p-2.5 rounded-lg border border-brand-200 flex justify-between">
                  <span>إجمالي قيمة المخزون الابتدائي:</span>
                  <span className="font-bold">{fmtMoney(initialQtyVal * costPriceVal)}</span>
                </div>
              )}
            </div>
          )}

          {/* Branch Stock Management (When editing an existing product) */}
          {editing && (
            <div className="sm:col-span-2 p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                  <Warehouse className="h-4 w-4 text-brand-700" />
                  <span>أرصدة المخزون والكميات في الفروع والمخازن</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-stone-500">إجمالي الكميات:</span>
                  <Badge tone={totalStockAcrossBranches <= 0 ? 'red' : 'green'}>
                    {fmtNum(totalStockAcrossBranches)} {product?.unit?.name || ''}
                  </Badge>
                  <span className="text-stone-400">|</span>
                  <span className="text-stone-500">إجمالي القيمة:</span>
                  <b className="text-emerald-700">{fmtMoney(totalValueAcrossBranches)}</b>
                </div>
              </div>

              <div className="overflow-x-auto border border-stone-200 rounded-lg bg-white">
                <table className="w-full text-xs text-right">
                  <thead className="bg-stone-100 text-stone-600 font-semibold border-b border-stone-200">
                    <tr>
                      <th className="p-2.5">المخزن / الفرع</th>
                      <th className="p-2.5">الرصيد الفعلي</th>
                      <th className="p-2.5">المتاح للبيع</th>
                      <th className="p-2.5">متوسط التكلفة</th>
                      <th className="p-2.5">قيمة المخزون</th>
                      <th className="p-2.5 text-center">إدارة الكمية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {branchStocks.map((b) => (
                      <tr key={b.branch_id} className="hover:bg-stone-50/80">
                        <td className="p-2.5 font-semibold text-stone-900">
                          {b.branch_name}
                        </td>
                        <td className="p-2.5">
                          <Badge tone={b.is_out ? 'red' : b.is_low ? 'amber' : 'green'}>
                            {fmtNum(b.qty_on_hand)}
                          </Badge>
                        </td>
                        <td className="p-2.5 font-bold text-stone-800">
                          {fmtNum(b.qty_available)}
                        </td>
                        <td className="p-2.5 text-stone-600">
                          {fmtMoney(b.avg_cost)}
                        </td>
                        <td className="p-2.5 font-semibold text-emerald-700">
                          {fmtMoney(b.stock_value)}
                        </td>
                        <td className="p-2.5 text-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setAdjustingBranchId(b.branch_id)}
                            className="text-xs"
                          >
                            <Boxes className="h-3.5 w-3.5 ml-1 inline text-brand-700" />
                            تعديل الكمية
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {branchStocks.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-stone-400">
                          جارٍ تحميل بيانات المخزون...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-700 rounded"
              {...register('is_active')}
            />
            <span className="font-semibold text-stone-800">المنتج نشط ومتاح في نقاط البيع والعمليات</span>
          </label>

          <div className="flex justify-end gap-2 sm:col-span-2 pt-2 border-t border-stone-100">
            <Button variant="secondary" onClick={() => nav('/products')}>
              إلغاء
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? 'حفظ التعديلات' : 'إضافة المنتج وإيداع الرصيد'}
            </Button>
          </div>
        </div>
      </form>

      {/* Adjust Stock Modal */}
      {editing && product && adjustingBranchId && (
        <AdjustStockModal
          isOpen={!!adjustingBranchId}
          branchId={adjustingBranchId}
          product={{
            id: product.id,
            name: product.name,
            sku: product.sku,
            barcode: product.barcode,
            cost_price: Number(product.cost_price),
            unit: product.unit,
          }}
          onClose={() => setAdjustingBranchId(null)}
          onSuccess={() => {
            refetchStocks()
            qc.invalidateQueries({ queryKey: ['stock-status'] })
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['products', 'stock-sum'] })
          }}
        />
      )}
    </>
  )
}
