import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, ShieldCheck, Plus, Check, Save, Lock, Building2, Store } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/store/toast.store'
import { errMsg } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { Field, Input, Textarea, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  products: 'المنتجات',
  categories: 'التصنيفات',
  inventory: 'المخزون والمستودعات',
  requests: 'طلبات البضاعة',
  transfers: 'التحويلات بين الفروع',
  stock_counts: 'الجرد والتسويات',
  damaged: 'إدارة التالف',
  suppliers: 'الموردون',
  purchases: 'المشتريات',
  pos: 'نقطة البيع (POS)',
  sales: 'فواتير المبيعات',
  customers: 'العملاء',
  returns: 'المرتجعات',
  exchanges: 'الاستبدال',
  shifts: 'الورديات',
  expenses: 'المصروفات',
  income: 'الإيرادات الأخرى',
  cashbox: 'الصندوق وطرق الدفع',
  branch_accounts: 'حسابات الفروع والتسويات',
  taxes: 'الضرائب',
  profit_loss: 'الأرباح والخسائر',
  employees: 'الموظفون',
  payroll: 'الرواتب والأجور',
  commissions: 'العمولات',
  reports: 'التقارير الشاملة',
  branches: 'الفروع',
  users: 'المستخدمون',
  roles: 'الأدوار والصلاحيات',
  audit: 'سجل العمليات',
  settings: 'إعدادات النظام',
}

const ACTION_LABELS: Record<string, string> = {
  view: 'عرض',
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  print: 'طباعة',
  export: 'تصدير',
  approve: 'اعتماد',
  cancel: 'إلغاء',
}

export default function RolesPage() {
  const qc = useQueryClient()
  const [selectedRole, setSelectedRole] = useState<string>('super_admin')
  const [createRoleModal, setCreateRoleModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    code: '',
    name: '',
    description: '',
    all_branches: false,
  })

  // 1. Roles list
  const { data: roles, isLoading: loadingRoles } = useQuery({
    queryKey: ['roles_catalog'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('*').order('created_at')
      if (error) throw error
      return data || []
    },
  })

  // 2. All Permissions catalog
  const { data: allPermissions, isLoading: loadingPerms } = useQuery({
    queryKey: ['permissions_catalog'],
    queryFn: async () => {
      const { data, error } = await supabase.from('permissions').select('*').order('module')
      if (error) throw error
      return data || []
    },
  })

  // 3. Current Role Permissions
  const activeRoleObj = roles?.find((r) => r.code === selectedRole || r.id === selectedRole)

  const { data: rolePermissions, isLoading: loadingRolePerms } = useQuery({
    queryKey: ['role_permissions', activeRoleObj?.id],
    enabled: !!activeRoleObj?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', activeRoleObj!.id)
      if (error) throw error
      return new Set(data?.map((p) => p.permission_id) || [])
    },
  })

  // Group permissions by module
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, any[]> = {}
    allPermissions?.forEach((p) => {
      if (!groups[p.module]) groups[p.module] = []
      groups[p.module].push(p)
    })
    return groups
  }, [allPermissions])

  // Toggle permission mutation
  const togglePermissionMutation = useMutation({
    mutationFn: async ({ permissionId, has }: { permissionId: string; has: boolean }) => {
      if (!activeRoleObj) return
      if (activeRoleObj.code === 'super_admin') {
        throw new Error('لا يمكن تعديل صلاحيات مدير النظام الافتراضية')
      }

      if (has) {
        // remove
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', activeRoleObj.id)
          .eq('permission_id', permissionId)
        if (error) throw error
      } else {
        // add
        const { error } = await supabase
          .from('role_permissions')
          .insert([{ role_id: activeRoleObj.id, permission_id: permissionId }])
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role_permissions', activeRoleObj?.id] })
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async () => {
      if (!createForm.code || !createForm.name) {
        throw new Error('يرجى كتابة رمز واسم الدور')
      }
      const { data, error } = await supabase.from('roles').insert([createForm]).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (newRole) => {
      qc.invalidateQueries({ queryKey: ['roles_catalog'] })
      toast.success('تم إنشاء الدور الجديد بنجاح')
      setCreateRoleModal(false)
      setSelectedRole(newRole.code)
      setCreateForm({ code: '', name: '', description: '', all_branches: false })
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (loadingRoles || loadingPerms) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader
        title="الأدوار ومصفوفة الصلاحيات"
        subtitle="تحديد أذونات الوصول والعمليات لكل دور وظيفي في النظام"
        actions={
          <Button variant="gold" onClick={() => setCreateRoleModal(true)}>
            <Plus className="h-4 w-4" />
            إنشاء دور مخصص
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Roles List */}
        <div className="lg:col-span-1 space-y-2">
          <div className="text-xs font-bold text-brand-800 uppercase tracking-wider px-1">الأدوار المعتمدة</div>
          <div className="space-y-1.5">
            {roles?.map((r) => {
              const isSelected = selectedRole === r.code || selectedRole === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRole(r.code)}
                  className={`w-full text-start p-3.5 rounded-2xl border transition flex flex-col gap-1 ${
                    isSelected
                      ? 'border-gold-500 bg-gradient-to-br from-gold-50 to-cream-100 shadow-soft ring-2 ring-gold-300/60'
                      : 'border-cream-300 bg-white hover:border-gold-300 hover:bg-cream-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-bold text-sm ${isSelected ? 'text-brand-900' : 'text-brand-800'}`}>
                      {r.name}
                    </span>
                    {r.is_system && (
                      <span className="text-[10px] bg-brand-100 text-brand-800 px-1.5 py-0.5 rounded font-mono">
                        نظامي
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 line-clamp-1">{r.description || r.code}</p>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-stone-400">
                    {r.all_branches ? (
                      <span className="flex items-center gap-1 text-emerald-700">
                        <Building2 className="h-3 w-3" /> يرى كل الفروع والمخزن
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-stone-500">
                        <Store className="h-3 w-3" /> فرع محدد فقط
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Permissions Matrix */}
        <div className="lg:col-span-3 card p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-cream-300 pb-4 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-gold-600" />
                <h3 className="text-base font-bold text-brand-900">
                  صلاحيات دور: {activeRoleObj?.name}
                </h3>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">{activeRoleObj?.description || activeRoleObj?.code}</p>
            </div>

            {activeRoleObj?.code === 'super_admin' && (
              <div className="flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-xl">
                <Lock className="h-3.5 w-3.5" />
                <span>مدير النظام يمتلك صلاحيات شاملة تلقائياً</span>
              </div>
            )}
          </div>

          {loadingRolePerms ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-cream-200/70 border-b border-cream-300 font-bold text-brand-900">
                  <tr>
                    <th className="px-3 py-2.5 text-start w-1/4">القسم / الموديول</th>
                    {['view', 'create', 'update', 'delete', 'approve', 'print', 'export', 'cancel'].map((action) => (
                      <th key={action} className="px-2 py-2.5 text-center font-semibold">
                        {ACTION_LABELS[action] || action}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  {Object.entries(groupedPermissions).map(([moduleKey, perms]) => (
                    <tr key={moduleKey} className="hover:bg-cream-50/70 transition">
                      <td className="px-3 py-2.5 font-bold text-brand-800">
                        {MODULE_LABELS[moduleKey] || moduleKey}
                      </td>
                      {['view', 'create', 'update', 'delete', 'approve', 'print', 'export', 'cancel'].map((action) => {
                        const perm = perms.find((p) => p.action === action)
                        if (!perm) {
                          return <td key={action} className="px-2 py-2 text-center text-stone-200">-</td>
                        }

                        const isGranted =
                          activeRoleObj?.code === 'super_admin' || (rolePermissions?.has(perm.id) ?? false)

                        return (
                          <td key={action} className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={isGranted}
                              disabled={activeRoleObj?.code === 'super_admin'}
                              onChange={() =>
                                togglePermissionMutation.mutate({
                                  permissionId: perm.id,
                                  has: rolePermissions?.has(perm.id) ?? false,
                                })
                              }
                              className="h-4 w-4 rounded border-cream-400 text-gold-600 focus:ring-gold-400 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Custom Role Modal */}
      <Modal
        open={createRoleModal}
        onClose={() => setCreateRoleModal(false)}
        title="إنشاء دور وظيفي مخصص"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateRoleModal(false)}>
              إلغاء
            </Button>
            <Button
              variant="gold"
              loading={createRoleMutation.isPending}
              onClick={() => createRoleMutation.mutate()}
            >
              حفظ الدور
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="رمز الدور (Code) *" hint="رمز إنجليزي بدون مسافات، مثال: quality_auditor">
            <Input
              value={createForm.code}
              onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toLowerCase().trim() })}
              placeholder="custom_role"
            />
          </Field>

          <Field label="اسم الدور باللغة العربية *">
            <Input
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="مثال: مدقق الجودة"
            />
          </Field>

          <Field label="الوصف">
            <Textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="وصف مختصر للمسؤوليات..."
              rows={2}
            />
          </Field>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="all_branches"
              checked={createForm.all_branches}
              onChange={(e) => setCreateForm({ ...createForm, all_branches: e.target.checked })}
              className="h-4 w-4 rounded border-cream-400 text-gold-600 focus:ring-gold-400"
            />
            <label htmlFor="all_branches" className="text-xs font-semibold text-brand-900 cursor-pointer">
              منح صلاحية الاطلاع على كل الفروع والمخزن الرئيسي
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
