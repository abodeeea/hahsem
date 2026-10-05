import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Banknote, Plus, Search, Store, Calendar, CreditCard, Upload, Paperclip } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtMoney } from '@/lib/formatters'
import { toast } from '@/store/toast.store'
import { errMsg } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { BranchSelect } from '@/components/shared/BranchSelect'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'

export default function OtherIncomePage() {
  const qc = useQueryClient()
  const [branch, setBranch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [createModal, setCreateModal] = useState(false)

  // Incomes list
  const { data: incomes, isLoading } = useQuery({
    queryKey: ['other_incomes_list', branch, typeFilter, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('other_incomes')
        .select('*, branch:branches(name), income_type:income_types(name), method:payment_methods(name)')
        .order('income_date', { ascending: false })

      if (branch) q = q.eq('branch_id', branch)
      if (typeFilter) q = q.eq('income_type_id', typeFilter)
      if (dateFrom) q = q.gte('income_date', dateFrom)
      if (dateTo) q = q.lte('income_date', dateTo)

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // Income Types
  const { data: incomeTypes } = useQuery({
    queryKey: ['income_types_catalog'],
    queryFn: async () => {
      const { data } = await supabase.from('income_types').select('*').eq('is_active', true).order('name')
      return data || []
    },
  })

  // Payment Methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['payment_methods_active'],
    queryFn: async () => {
      const { data } = await supabase.from('payment_methods').select('id,name,is_cash').eq('is_active', true)
      return data || []
    },
  })

  const [form, setForm] = useState({
    branch_id: '',
    income_type_id: '',
    amount: '',
    income_date: new Date().toISOString().split('T')[0],
    payment_method_id: '',
    description: '',
    attachment_url: '',
  })

  const [uploading, setUploading] = useState(false)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `income-receipt-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(fileName)
      setForm((prev) => ({ ...prev, attachment_url: publicUrl }))
      toast.success('تم رفع المرفق بنجاح')
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setUploading(false)
    }
  }

  const createIncomeMutation = useMutation({
    mutationFn: async () => {
      if (!form.branch_id || !form.income_type_id || !form.amount || !form.payment_method_id) {
        throw new Error('يرجى ملء جميع الحقول الإلزامية')
      }
      const { error } = await supabase.from('other_incomes').insert([
        {
          branch_id: form.branch_id,
          income_type_id: form.income_type_id,
          amount: Number(form.amount),
          income_date: form.income_date,
          payment_method_id: form.payment_method_id,
          description: form.description || null,
          attachment_url: form.attachment_url || null,
        },
      ])
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['other_incomes_list'] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
      toast.success('تم تسجيل الإيراد وقيده في الصندوق بنجاح')
      setCreateModal(false)
      setForm({
        branch_id: '',
        income_type_id: '',
        amount: '',
        income_date: new Date().toISOString().split('T')[0],
        payment_method_id: '',
        description: '',
        attachment_url: '',
      })
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const totalIncome = incomes?.reduce((acc, it) => acc + Number(it.amount || 0), 0) || 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإيرادات والمقبوضات الأخرى"
        subtitle="تسجيل عوائد ومقبوضات المنشأة غير المرتبطة بمبيعات المنتجات"
        actions={
          <Button variant="gold" onClick={() => setCreateModal(true)}>
            <Plus className="h-4 w-4" />
            تسجيل إيراد جديد
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-stone-500">إجمالي الإيرادات الأخرى المحصلة</div>
            <div className="text-xl font-bold text-emerald-700 mt-1 font-mono">{fmtMoney(totalIncome)}</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
            <Banknote className="h-5 w-5" />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-stone-500">عدد العمليات المسجلة</div>
            <div className="text-xl font-bold text-brand-900 mt-1 font-mono">{incomes?.length || 0} عملية</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-gold-100 flex items-center justify-center text-gold-700">
            <Calendar className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <BranchSelect includeAll value={branch} onChange={setBranch} />

        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">جميع أنواع الإيرادات</option>
          {incomeTypes?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>

        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="من تاريخ" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="إلى تاريخ" />
      </div>

      {/* Table */}
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-cream-200/70 border-b border-cream-300 text-xs font-bold text-brand-900">
                <tr>
                  <th className="px-4 py-3 text-start">التاريخ</th>
                  <th className="px-4 py-3 text-start">الفرع</th>
                  <th className="px-4 py-3 text-start">نوع الإيراد</th>
                  <th className="px-4 py-3 text-start">طريقة الاستلام</th>
                  <th className="px-4 py-3 text-start">البيان / الوصف</th>
                  <th className="px-4 py-3 text-start">المبلغ</th>
                  <th className="px-4 py-3 text-center">المرفق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {incomes && incomes.length > 0 ? (
                  incomes.map((it) => (
                    <tr key={it.id} className="hover:bg-cream-50/70 transition">
                      <td className="px-4 py-3 text-xs font-mono text-stone-600">{it.income_date}</td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1.5 text-stone-800">
                          <Store className="h-3.5 w-3.5 text-gold-600" />
                          {it.branch?.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-brand-900">{it.income_type?.name}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="inline-flex items-center gap-1 text-stone-700">
                          <CreditCard className="h-3.5 w-3.5 text-stone-400" />
                          {it.method?.name || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-600">{it.description || '-'}</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-700">{fmtMoney(it.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        {it.attachment_url ? (
                          <a
                            href={it.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-gold-600 hover:text-gold-800 inline-block"
                            title="عرض المرفق"
                          >
                            <Paperclip className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-stone-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-stone-400">
                      لا توجد إيرادات مسجلة مطابقة لخيارات البحث
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="تسجيل إيراد مالي جديد"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModal(false)}>
              إلغاء
            </Button>
            <Button
              variant="gold"
              loading={createIncomeMutation.isPending}
              onClick={() => createIncomeMutation.mutate()}
            >
              <Plus className="h-4 w-4" />
              حفظ وقيد في الصندوق
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="الفرع المستلم *">
              <BranchSelect
                value={form.branch_id}
                onChange={(b) => setForm({ ...form, branch_id: b })}
              />
            </Field>

            <Field label="نوع / بند الإيراد *">
              <Select
                value={form.income_type_id}
                onChange={(e) => setForm({ ...form, income_type_id: e.target.value })}
              >
                <option value="">اختر النوع...</option>
                {incomeTypes?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="المبلغ (ريال) *">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </Field>

            <Field label="طريقة الاستلام / الحساب *">
              <Select
                value={form.payment_method_id}
                onChange={(e) => setForm({ ...form, payment_method_id: e.target.value })}
              >
                <option value="">اختر الطريقة...</option>
                {paymentMethods?.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name} {pm.is_cash ? '(نقدي - صندوق)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="تاريخ التحصيل">
            <Input
              type="date"
              value={form.income_date}
              onChange={(e) => setForm({ ...form, income_date: e.target.value })}
            />
          </Field>

          <Field label="بيان / تفاصيل الإيراد">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="اكتب ملاحظات أو سبب التحصيل..."
              rows={2}
            />
          </Field>

          <div>
            <label className="text-xs font-semibold text-stone-600 block mb-1">المرفق / الإيصال</label>
            <label className="btn border border-cream-400 bg-white hover:bg-cream-100 text-brand-700 cursor-pointer text-xs inline-flex items-center gap-2">
              <Upload className="h-4 w-4 text-gold-600" />
              {uploading ? 'جارٍ الرفع...' : form.attachment_url ? 'تم إرفاق الملف ✓' : 'رفع سند أو إيصال'}
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
