import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Pencil, Barcode, History, Power, LayoutGrid, List, Package, RefreshCw, Boxes } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { toast } from '@/store/toast.store'
import { usePermission } from '@/hooks/usePermission'
import { useDebounce } from '@/hooks/useDebounce'
import { useCategories } from '@/hooks/useLookups'
import { fmtMoney, fmtNum } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Field'
import { BarcodePrintDialog } from '../components/BarcodePrintDialog'
import { AdjustStockModal } from '../components/AdjustStockModal'

export default function ProductsListPage() {
  const { can } = usePermission()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [barcodeFor, setBarcodeFor] = useState<any | null>(null)
  const [adjustingProduct, setAdjustingProduct] = useState<any | null>(null)
  const dSearch = useDebounce(search.trim())
  const { data: cats } = useCategories()

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', 'list', dSearch, category],
    queryFn: async () => {
      let q = supabase
        .from('products')
        .select('*, category:categories(name), unit:units(name)')
        .order('name')
        .limit(300)
      if (category) q = q.eq('category_id', category)
      if (dSearch) q = q.or(`name.ilike.%${dSearch}%,barcode.ilike.%${dSearch}%,sku.ilike.%${dSearch}%`)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  // مجموع الكميات في كافة المخازن والفروع
  const { data: stock = {} } = useQuery({
    queryKey: ['products', 'stock-sum'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_balances').select('product_id,qty_on_hand')
      if (error) return {} as Record<string, number>
      const m: Record<string, number> = {}
      data?.forEach((r) => {
        m[r.product_id] = (m[r.product_id] ?? 0) + Number(r.qty_on_hand)
      })
      return m
    },
  })

  const toggle = async (p: any) => {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) return toast.error(errMsg(error))
    toast.success(p.is_active ? 'تم إيقاف المنتج' : 'تم تفعيل المنتج')
    qc.invalidateQueries({ queryKey: ['products'] })
  }

  const cols: Column<any>[] = [
    {
      key: 'image',
      header: '',
      className: 'w-14',
      render: (p) =>
        p.image_url ? (
          <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover border border-stone-200" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-cream-200 flex items-center justify-center text-stone-400">
            <Package className="h-5 w-5" />
          </div>
        ),
    },
    {
      key: 'name',
      header: 'المنتج',
      render: (p) => (
        <div>
          <div className="font-bold text-stone-900">{p.name}</div>
          <div className="text-xs text-stone-400 flex gap-2">
            <span>SKU: {p.sku}</span>
            {p.size_label && <span>· {p.size_label}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'barcode',
      header: 'الباركود',
      render: (p) => <span dir="ltr" className="text-xs font-mono">{p.barcode ?? '—'}</span>,
    },
    { key: 'category', header: 'التصنيف', render: (p) => p.category?.name ?? '—' },
    {
      key: 'qty',
      header: 'إجمالي المخزون',
      render: (p) => {
        const q = stock[p.id] ?? 0
        return <Badge tone={q <= 0 ? 'red' : q <= Number(p.min_stock) ? 'amber' : 'green'}>{fmtNum(q)} {p.unit?.name || ''}</Badge>
      },
    },
    { key: 'cost_price', header: 'الشراء', render: (p) => fmtMoney(p.cost_price) },
    { key: 'wholesale_price', header: 'الجملة', render: (p) => fmtMoney(p.wholesale_price) },
    { key: 'retail_price', header: 'البيع', render: (p) => <b className="text-stone-900">{fmtMoney(p.retail_price)}</b> },
    {
      key: 'is_active',
      header: 'الحالة',
      render: (p) => <Badge tone={p.is_active ? 'green' : 'gray'}>{p.is_active ? 'نشط' : 'موقوف'}</Badge>,
    },
    {
      key: '_a',
      header: 'الإجراءات',
      className: 'text-end',
      render: (p) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {can('inventory', 'update') && (
            <Button
              size="sm"
              variant="ghost"
              title="تعديل كمية المخزون"
              onClick={() => setAdjustingProduct(p)}
              className="text-brand-800 hover:text-brand-900 hover:bg-brand-50"
            >
              <Boxes className="h-4 w-4" />
            </Button>
          )}
          {can('products', 'update') && (
            <Button size="sm" variant="ghost" title="تعديل بيانات المنتج" onClick={() => nav(`/products/${p.id}/edit`)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            title="طباعة الباركود"
            disabled={!p.barcode}
            onClick={() => setBarcodeFor(p)}
          >
            <Barcode className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" title="حركة المنتج" onClick={() => nav(`/products/${p.id}/movements`)}>
            <History className="h-4 w-4" />
          </Button>
          {can('products', 'update') && (
            <Button
              size="sm"
              variant="ghost"
              title={p.is_active ? 'إيقاف' : 'تفعيل'}
              onClick={() => toggle(p)}
            >
              <Power className={p.is_active ? 'h-4 w-4 text-red-500' : 'h-4 w-4 text-emerald-600'} />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="دليل المنتجات والأصناف"
        subtitle="إدارة كافة العطور، الطيب، الزيوت والمنتجات المتاحة بالنظام والمخازن"
        actions={
          can('products', 'create') ? (
            <Link to="/products/new">
              <Button>
                <Plus className="h-4 w-4 ml-1 inline" /> إضافة منتج جديد
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/* Filter and View Mode Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              className="ps-9"
              placeholder="بحث بالاسم أو الباركود أو الرمز (SKU)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="w-52">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">كافة التصنيفات</option>
              {cats?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-stone-100 p-1 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-brand-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>بطاقات</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-brand-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>جدول</span>
            </button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['products'] })
              qc.invalidateQueries({ queryKey: ['products', 'stock-sum'] })
            }}
          >
            <RefreshCw className="h-4 w-4 ml-1 inline" /> تحديث
          </Button>
        </div>
      </div>

      {/* Content: Cards View or Table View */}
      {viewMode === 'cards' ? (
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="bg-white p-4 rounded-xl border border-stone-200 animate-pulse h-64" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="card p-12 text-center text-stone-500">
            <Package className="h-12 w-12 mx-auto text-stone-300 mb-2" />
            <p className="font-semibold">لا توجد منتجات تطابق معايير البحث</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => {
              const currentStock = stock[p.id] ?? 0
              const isLow = currentStock > 0 && currentStock <= Number(p.min_stock || 0)
              const isOut = currentStock <= 0

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow group"
                >
                  {/* Image container */}
                  <div className="relative aspect-[4/3] bg-stone-100 overflow-hidden flex items-center justify-center">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <Package className="h-16 w-16 text-stone-300" />
                    )}

                    <div className="absolute top-2 start-2 flex flex-col gap-1">
                      {p.category?.name && (
                        <span className="bg-brand-900/80 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-0.5 rounded-md">
                          {p.category.name}
                        </span>
                      )}
                    </div>

                    <div className="absolute top-2 end-2">
                      <Badge tone={p.is_active ? 'green' : 'gray'}>
                        {p.is_active ? 'نشط' : 'موقوف'}
                      </Badge>
                    </div>

                    {/* Stock badge */}
                    <div className="absolute bottom-2 start-2">
                      <Badge tone={isOut ? 'red' : isLow ? 'amber' : 'green'}>
                        المخزون: {fmtNum(currentStock)} {p.unit?.name || ''}
                      </Badge>
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <h3 className="font-bold text-stone-900 text-sm line-clamp-1 group-hover:text-brand-800 transition-colors">
                          {p.name}
                        </h3>
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5 flex items-center justify-between">
                        <span>SKU: {p.sku}</span>
                        {p.size_label && <span>{p.size_label}</span>}
                      </div>
                      {p.barcode && (
                        <div className="text-[11px] text-stone-500 font-mono mt-0.5" dir="ltr">
                          {p.barcode}
                        </div>
                      )}
                    </div>

                    {/* Prices */}
                    <div className="pt-2 border-t border-stone-100 flex items-baseline justify-between text-xs">
                      <div>
                        <span className="text-stone-400 block text-[10px]">سعر البيع</span>
                        <span className="text-base font-bold text-emerald-700">{fmtMoney(p.retail_price)}</span>
                      </div>
                      <div className="text-end">
                        <span className="text-stone-400 block text-[10px]">التكلفة</span>
                        <span className="text-xs font-semibold text-stone-600">{fmtMoney(p.cost_price)}</span>
                      </div>
                    </div>

                    {/* Quick Actions Bar */}
                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-1">
                      {can('inventory', 'update') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setAdjustingProduct(p)}
                          title="تعديل كمية المخزون"
                          className="text-xs bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                        >
                          <Boxes className="h-3.5 w-3.5 ml-1 inline text-amber-700" /> تعديل الكمية
                        </Button>
                      )}

                      {can('products', 'update') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => nav(`/products/${p.id}/edit`)}
                          title="تعديل المنتج"
                          className="text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5 ml-1 inline" /> تعديل
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!p.barcode}
                        onClick={() => setBarcodeFor(p)}
                        title="طباعة الباركود"
                      >
                        <Barcode className="h-4 w-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => nav(`/products/${p.id}/movements`)}
                        title="حركة المخزون"
                      >
                        <History className="h-4 w-4" />
                      </Button>

                      {can('products', 'update') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggle(p)}
                          title={p.is_active ? 'إيقاف المنتج' : 'تفعيل المنتج'}
                        >
                          <Power
                            className={
                              p.is_active ? 'h-4 w-4 text-red-500' : 'h-4 w-4 text-emerald-600'
                            }
                          />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        <DataTable
          columns={cols}
          rows={products}
          loading={isLoading}
          onRowClick={(p) => can('products', 'update') && nav(`/products/${p.id}/edit`)}
        />
      )}

      {/* Adjust Stock Modal */}
      {adjustingProduct && (
        <AdjustStockModal
          isOpen={!!adjustingProduct}
          product={{
            id: adjustingProduct.id,
            name: adjustingProduct.name,
            sku: adjustingProduct.sku,
            barcode: adjustingProduct.barcode,
            cost_price: Number(adjustingProduct.cost_price),
            unit: adjustingProduct.unit,
          }}
          onClose={() => setAdjustingProduct(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['products', 'stock-sum'] })
            qc.invalidateQueries({ queryKey: ['stock-status'] })
          }}
        />
      )}

      <BarcodePrintDialog product={barcodeFor} onClose={() => setBarcodeFor(null)} />
    </div>
  )
}
