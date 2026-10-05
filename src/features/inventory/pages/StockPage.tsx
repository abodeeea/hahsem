import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Layers, Coins, AlertTriangle, PackageX, Search, LayoutGrid, List, Package, Pencil, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMainWarehouse } from '@/hooks/useLookups'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/store/auth.store'
import { fmtMoney, fmtNum } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { BranchSelect } from '@/components/shared/BranchSelect'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Link } from 'react-router-dom'
import { AdjustStockModal } from '@/features/products/components/AdjustStockModal'

/** المخزن الرئيسي (mode=main) أو مخزون الفروع (mode=branches) */
export function StockPage({ mode }: { mode: 'main' | 'branches' }) {
  const qc = useQueryClient()
  const { data: main } = useMainWarehouse()
  const { can, seesAllBranches } = usePermission()
  const myBranch = useAuth((s) => s.profile?.branch_id) ?? ''
  const [branchId, setBranchId] = useState('')
  const [search, setSearch] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [adjustingItem, setAdjustingItem] = useState<{
    product: any
    branchId: string
  } | null>(null)

  useEffect(() => {
    if (mode === 'main' && main) setBranchId(main.id)
    if (mode === 'branches' && !branchId) setBranchId(seesAllBranches ? '' : myBranch)
  }, [mode, main, seesAllBranches, myBranch]) // eslint-disable-line

  const { data, isLoading } = useQuery({
    queryKey: ['stock-status', branchId, mode],
    enabled: mode === 'main' ? !!branchId : true,
    queryFn: async () => {
      let q = supabase
        .from('v_stock_status')
        .select('*')
        .order('product_name')
        .limit(1000)
      if (branchId) q = q.eq('branch_id', branchId)
      else if (mode === 'branches' && main) q = q.neq('branch_id', main.id)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  // Load product images lookup for cards view
  const { data: productImages = {} } = useQuery({
    queryKey: ['products_images_map'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, image_url')
      if (error) return {}
      const map: Record<string, string | null> = {}
      data?.forEach((p) => {
        map[p.id] = p.image_url
      })
      return map
    },
  })

  const rows = (data ?? []).filter(
    (r) =>
      (!search ||
        `${r.product_name} ${r.barcode ?? ''} ${r.sku}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!onlyLow || r.is_low || r.is_out)
  )

  const totalQty = rows.reduce((s, r) => s + Number(r.qty_on_hand), 0)
  const totalVal = rows.reduce((s, r) => s + Number(r.stock_value), 0)

  const cols: Column<any>[] = [
    {
      key: 'product_name',
      header: 'المنتج',
      render: (r) => (
        <Link
          className="font-bold text-stone-900 hover:text-brand-700"
          to={`/products/${r.product_id}/movements`}
        >
          {r.product_name}
        </Link>
      ),
    },
    ...(mode === 'branches' ? [{ key: 'branch_name', header: 'الفرع' } as Column<any>] : []),
    {
      key: 'barcode',
      header: 'الباركود',
      render: (r) => (
        <span dir="ltr" className="text-xs font-mono">
          {r.barcode ?? '—'}
        </span>
      ),
    },
    {
      key: 'qty_on_hand',
      header: 'الكمية الحالية',
      render: (r) => (
        <Badge tone={r.is_out ? 'red' : r.is_low ? 'amber' : 'green'}>
          {fmtNum(r.qty_on_hand)}
        </Badge>
      ),
    },
    {
      key: 'qty_reserved',
      header: 'محجوزة للتحويلات',
      render: (r) => fmtNum(r.qty_reserved),
    },
    {
      key: 'qty_available',
      header: 'المتاحة للبيع',
      render: (r) => <b className="text-stone-900">{fmtNum(r.qty_available)}</b>,
    },
    {
      key: 'avg_cost',
      header: 'متوسط التكلفة',
      render: (r) => fmtMoney(r.avg_cost),
    },
    {
      key: 'stock_value',
      header: 'قيمة المخزون',
      render: (r) => <b className="text-emerald-700">{fmtMoney(r.stock_value)}</b>,
    },
    {
      key: '_actions',
      header: 'الإجراءات',
      className: 'text-end',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {can('inventory', 'update') && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setAdjustingItem({
                  product: {
                    id: r.product_id,
                    name: r.product_name,
                    sku: r.sku,
                    barcode: r.barcode,
                    cost_price: Number(r.avg_cost || 0),
                  },
                  branchId: r.branch_id,
                })
              }
              className="text-xs text-brand-900 bg-brand-50 hover:bg-brand-100 border-brand-200"
            >
              <Boxes className="h-3.5 w-3.5 ml-1 inline text-brand-700" />
              تعديل الرصيد
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title={mode === 'main' ? 'المخزن الرئيسي (المستودع المركزي)' : 'مخزون الفروع ونقاط البيع'}
        subtitle={
          mode === 'main'
            ? 'مراقبة وإدارة أرصدة المنتجات في المستودع المركزي وتغذية الفروع'
            : 'متابعة كميات وتوافر الأصناف في كافة فروع البيع المباشر'
        }
        actions={
          <div className="flex items-center gap-2">
            {mode === 'branches' && seesAllBranches && (
              <BranchSelect
                includeAll
                onlyBranches
                value={branchId}
                onChange={setBranchId}
                className="w-52"
              />
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['stock-status'] })
              }}
            >
              <RefreshCw className="h-4 w-4 ml-1 inline" /> تحديث
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="إجمالي المنتجات" value={fmtNum(rows.length)} icon={Boxes} />
        <StatCard label="إجمالي الكميات" value={fmtNum(totalQty)} icon={Layers} tone="blue" />
        <StatCard label="قيمة المخزون" value={fmtMoney(totalVal)} icon={Coins} tone="green" />
        <StatCard
          label="منخفضة / نافدة"
          value={`${rows.filter((r) => r.is_low).length} / ${rows.filter((r) => r.is_out).length}`}
          icon={AlertTriangle}
          tone="red"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[220px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              className="ps-9"
              placeholder="بحث بالمنتج، الباركود أو الرمز..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer bg-stone-50 px-3 py-2 rounded-lg border border-stone-200 hover:bg-stone-100">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-700 rounded"
              checked={onlyLow}
              onChange={(e) => setOnlyLow(e.target.checked)}
            />
            <PackageX className="h-4 w-4 text-red-500" />
            <span>عرض النواقص والنافدة فقط</span>
          </label>
        </div>

        {/* View mode toggle */}
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
      </div>

      {/* Cards or Table */}
      {viewMode === 'cards' ? (
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="bg-white p-4 rounded-xl border border-stone-200 animate-pulse h-60" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="card p-12 text-center text-stone-500">
            <Package className="h-12 w-12 mx-auto text-stone-300 mb-2" />
            <p className="font-semibold">لا توجد منتجات مطابقة في هذا المخزن</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {rows.map((r) => {
              const img = productImages[r.product_id]
              return (
                <div
                  key={`${r.branch_id}-${r.product_id}`}
                  className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow group"
                >
                  <div className="relative aspect-[4/3] bg-stone-100 overflow-hidden flex items-center justify-center">
                    {img ? (
                      <img
                        src={img}
                        alt={r.product_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <Package className="h-16 w-16 text-stone-300" />
                    )}

                    <div className="absolute top-2 start-2">
                      <span className="bg-stone-900/80 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-0.5 rounded-md">
                        {r.branch_name}
                      </span>
                    </div>

                    <div className="absolute bottom-2 start-2">
                      <Badge tone={r.is_out ? 'red' : r.is_low ? 'amber' : 'green'}>
                        الرصيد: {fmtNum(r.qty_on_hand)}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <Link
                        to={`/products/${r.product_id}/movements`}
                        className="font-bold text-stone-900 text-sm hover:text-brand-800 line-clamp-1 block"
                      >
                        {r.product_name}
                      </Link>
                      <div className="text-xs text-stone-400 mt-0.5 flex justify-between">
                        <span>SKU: {r.sku}</span>
                        {r.barcode && <span dir="ltr">{r.barcode}</span>}
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                      <div className="flex justify-between">
                        <span className="text-stone-500">المتاح للبيع:</span>
                        <b className="text-stone-900">{fmtNum(r.qty_available)}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">متوسط التكلفة:</span>
                        <span>{fmtMoney(r.avg_cost)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-stone-200">
                        <span className="text-stone-500 font-semibold">إجمالي القيمة:</span>
                        <b className="text-emerald-700">{fmtMoney(r.stock_value)}</b>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-stone-100">
                      {can('inventory', 'update') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setAdjustingItem({
                              product: {
                                id: r.product_id,
                                name: r.product_name,
                                sku: r.sku,
                                barcode: r.barcode,
                                cost_price: Number(r.avg_cost || 0),
                              },
                              branchId: r.branch_id,
                            })
                          }
                          className="flex-1 text-xs bg-brand-50 text-brand-900 border-brand-200 hover:bg-brand-100"
                        >
                          <Boxes className="h-3.5 w-3.5 ml-1 inline text-brand-700" />
                          تعديل الرصيد
                        </Button>
                      )}

                      <Link
                        to={`/products/${r.product_id}/movements`}
                        className="p-1.5 rounded-lg border border-stone-200 text-stone-500 hover:text-brand-900 hover:bg-stone-50"
                        title="كشف حركة المنتج"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
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
          rows={rows}
          loading={isLoading}
          rowKey={(r) => `${r.branch_id}-${r.product_id}`}
        />
      )}

      {/* Adjust Stock Modal */}
      {adjustingItem && (
        <AdjustStockModal
          isOpen={!!adjustingItem}
          product={adjustingItem.product}
          branchId={adjustingItem.branchId}
          onClose={() => setAdjustingItem(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['stock-status'] })
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['products', 'stock-sum'] })
          }}
        />
      )}
    </div>
  )
}

export const MainWarehousePage = () => <StockPage mode="main" />
export const BranchStockPage = () => <StockPage mode="branches" />
