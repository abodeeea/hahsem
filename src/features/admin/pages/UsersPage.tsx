import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Search, KeyRound, Edit, ShieldCheck, UserX, CheckCircle, Store, Phone, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/store/toast.store'
import { errMsg } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { Field, Input, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'

export default function UsersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  // Users query
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin_users', search, branchFilter, roleFilter],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('*, role:roles(id,code,name), branch:branches(id,name,code,type)')
        .order('created_at', { ascending: false })

      if (branchFilter) q = q.eq('branch_id', branchFilter)
      if (roleFilter) q = q.eq('role_id', roleFilter)
      if (search) q = q.or(`full_name.ilike.%${search}%,username.ilike.%${search}%,phone.ilike.%${search}%`)

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // Branches & Roles for selectors
  const { data: branches } = useQuery({
    queryKey: ['branches_list'],
    queryFn: async () => {
      const { data } = await supabase.from('branches').select('id,name,type').eq('is_active', true).order('name')
      return data || []
    },
  })

  const { data: roles } = useQuery({
    queryKey: ['roles_list'],
    queryFn: async () => {
      const { data } = await supabase.from('roles').select('id,code,name').order('name')
      return data || []
    },
  })

  // Modals state
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState<any>(null)
  const [pwdModal, setPwdModal] = useState<any>(null)

  const [createForm, setCreateForm] = useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
    phone: '',
    role_id: '',
    branch_id: '',
  })

  const [pwdForm, setPwdForm] = useState({ new_password: '' })

  const createUserMutation = useMutation({
    mutationFn: async () => {
      if (!createForm.full_name || !createForm.username || !createForm.password || !createForm.role_id || !createForm.branch_id) {
        throw new Error('يرجى ملء كافة الحقول الإلزامية')
      }
      const { data, error } = await supabase.rpc('fn_admin_create_user', {
        p_email: createForm.email || `${createForm.username.trim().toLowerCase()}@hashim.local`,
        p_password: createForm.password,
        p_full_name: createForm.full_name,
        p_username: createForm.username,
        p_role_id: createForm.role_id,
        p_branch_id: createForm.branch_id,
        p_phone: createForm.phone || null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_users'] })
      toast.success('تم إنشاء المستخدم بنجاح')
      setCreateModal(false)
      setCreateForm({
        full_name: '',
        username: '',
        email: '',
        password: '',
        phone: '',
        role_id: '',
        branch_id: '',
      })
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const editUserMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editModal.full_name,
          username: editModal.username,
          phone: editModal.phone,
          role_id: editModal.role_id,
          branch_id: editModal.branch_id,
          is_active: editModal.is_active,
        })
        .eq('id', editModal.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_users'] })
      toast.success('تم تحديث بيانات المستخدم بنجاح')
      setEditModal(null)
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const changePwdMutation = useMutation({
    mutationFn: async () => {
      if (!pwdForm.new_password || pwdForm.new_password.length < 6) {
        throw new Error('كلمة المرور يجب أن لا تقل عن 6 أحرف')
      }
      const { error } = await supabase.rpc('fn_admin_update_password', {
        p_user_id: pwdModal.id,
        p_new_password: pwdForm.new_password,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور بنجاح')
      setPwdModal(null)
      setPwdForm({ new_password: '' })
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const toggleUserStatus = async (user: any) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['admin_users'] })
      toast.success(user.is_active ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب')
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة المستخدمين"
        subtitle="حسابات الموظفين، الأدوار، وتعيينات الفروع"
        actions={
          <Button variant="gold" onClick={() => setCreateModal(true)}>
            <UserPlus className="h-4 w-4" />
            إضافة مستخدم جديد
          </Button>
        }
      />

      {/* Filters Bar */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم، اسم المستخدم، أو الهاتف..."
            className="ps-9"
          />
        </div>

        <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="">جميع الفروع والمخزن</option>
          {branches?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} {b.type === 'main_warehouse' ? '(المخزن الرئيسي)' : ''}
            </option>
          ))}
        </Select>

        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">جميع الأدوار</option>
          {roles?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Users Table */}
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-cream-200/70 border-b border-cream-300 text-xs font-bold text-brand-900">
                <tr>
                  <th className="px-4 py-3 text-start">المستخدم</th>
                  <th className="px-4 py-3 text-start">اسم المستخدم</th>
                  <th className="px-4 py-3 text-start">الدور الوظيفي</th>
                  <th className="px-4 py-3 text-start">الفرع / الموقع</th>
                  <th className="px-4 py-3 text-start">الهاتف</th>
                  <th className="px-4 py-3 text-center">الحالة</th>
                  <th className="px-4 py-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {users && users.length > 0 ? (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-cream-50/70 transition">
                      <td className="px-4 py-3">
                        <div className="font-bold text-brand-900">{u.full_name}</div>
                        {u.last_login_at && (
                          <div className="text-[11px] text-stone-400">
                            آخر دخول: {new Date(u.last_login_at).toLocaleDateString('ar-SA')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-brand-700">{u.username || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gold-50 border border-gold-300/60 text-xs font-semibold text-brand-900">
                          <ShieldCheck className="h-3.5 w-3.5 text-gold-600" />
                          {u.role?.name || 'غير محدد'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-stone-700">
                          <Store className="h-3.5 w-3.5 text-brand-600" />
                          {u.branch?.name || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-600 dir-ltr">{u.phone || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge tone={u.is_active ? 'green' : 'gray'}>
                          {u.is_active ? 'نشط' : 'موقوف'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditModal({ ...u })}
                            title="تعديل المستخدم"
                            className="p-1.5 rounded-lg text-stone-500 hover:bg-cream-200 hover:text-brand-800 transition"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setPwdModal(u)
                              setPwdForm({ new_password: '' })
                            }}
                            title="تغيير كلمة المرور"
                            className="p-1.5 rounded-lg text-stone-500 hover:bg-amber-100 hover:text-amber-800 transition"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleUserStatus(u)}
                            title={u.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                            className={`p-1.5 rounded-lg transition ${
                              u.is_active
                                ? 'text-stone-400 hover:bg-red-50 hover:text-red-700'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {u.is_active ? <UserX className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-stone-400">
                      لا يوجد مستخدمون مطابقون لمعايير البحث
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="إضافة حساب مستخدم جديد"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModal(false)}>
              إلغاء
            </Button>
            <Button
              variant="gold"
              loading={createUserMutation.isPending}
              onClick={() => createUserMutation.mutate()}
            >
              <UserPlus className="h-4 w-4" />
              إنشاء الحساب
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="الاسم الكامل *" hint="الاسم المعروض للموظف في الفواتير والعمليات">
            <Input
              value={createForm.full_name}
              onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
              placeholder="مثال: أحمد عبد الله"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="اسم المستخدم *" hint="يستخدم لتسجيل الدخول السريع">
              <Input
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                placeholder="ahmed.sales"
              />
            </Field>

            <Field label="كلمة المرور *" hint="6 أحرف أو أرقام على الأقل">
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="******"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="الدور والصلاحيات *">
              <Select
                value={createForm.role_id}
                onChange={(e) => setCreateForm({ ...createForm, role_id: e.target.value })}
              >
                <option value="">اختر الدور...</option>
                {roles?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="الفرع المرتبط *">
              <Select
                value={createForm.branch_id}
                onChange={(e) => setCreateForm({ ...createForm, branch_id: e.target.value })}
              >
                <option value="">اختر الفرع...</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="البريد الإلكتروني (اختياري)">
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="user@domain.com"
              />
            </Field>

            <Field label="رقم الهاتف (اختياري)">
              <Input
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                placeholder="05XXXXXXXX"
              />
            </Field>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      {editModal && (
        <Modal
          open={Boolean(editModal)}
          onClose={() => setEditModal(null)}
          title={`تعديل المستخدم: ${editModal.full_name}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditModal(null)}>
                إلغاء
              </Button>
              <Button
                variant="gold"
                loading={editUserMutation.isPending}
                onClick={() => editUserMutation.mutate()}
              >
                حفظ التعديلات
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="الاسم الكامل *">
              <Input
                value={editModal.full_name || ''}
                onChange={(e) => setEditModal({ ...editModal, full_name: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="اسم المستخدم *">
                <Input
                  value={editModal.username || ''}
                  onChange={(e) => setEditModal({ ...editModal, username: e.target.value })}
                />
              </Field>

              <Field label="رقم الهاتف">
                <Input
                  value={editModal.phone || ''}
                  onChange={(e) => setEditModal({ ...editModal, phone: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="الدور الوظيفي *">
                <Select
                  value={editModal.role_id || ''}
                  onChange={(e) => setEditModal({ ...editModal, role_id: e.target.value })}
                >
                  {roles?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="الفرع *">
                <Select
                  value={editModal.branch_id || ''}
                  onChange={(e) => setEditModal({ ...editModal, branch_id: e.target.value })}
                >
                  {branches?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="حالة الحساب">
              <Select
                value={editModal.is_active ? 'true' : 'false'}
                onChange={(e) => setEditModal({ ...editModal, is_active: e.target.value === 'true' })}
              >
                <option value="true">نشط (يمكنه تسجيل الدخول)</option>
                <option value="false">موقوف</option>
              </Select>
            </Field>
          </div>
        </Modal>
      )}

      {/* Change Password Modal */}
      {pwdModal && (
        <Modal
          open={Boolean(pwdModal)}
          onClose={() => setPwdModal(null)}
          title={`تعيين كلمة مرور جديدة لـ ${pwdModal.full_name}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPwdModal(null)}>
                إلغاء
              </Button>
              <Button
                variant="gold"
                loading={changePwdMutation.isPending}
                onClick={() => changePwdMutation.mutate()}
              >
                تحديث كلمة المرور
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-stone-500">
              سيتم تغيير كلمة المرور فوراً وسيتمكن المستخدم من الدخول بكلمة المرور الجديدة.
            </p>
            <Field label="كلمة المرور الجديدة *" hint="6 خانات على الأقل">
              <Input
                type="password"
                value={pwdForm.new_password}
                onChange={(e) => setPwdForm({ new_password: e.target.value })}
                placeholder="******"
              />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
