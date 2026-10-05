import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Search, Eye, Filter, ArrowRight, User as UserIcon, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/shared/PageHeader'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import type { Tone } from '@/lib/status'

const ACTION_BADGES: Record<string, { label: string; tone: Tone }> = {
  insert: { label: 'إضافة جديدة', tone: 'green' },
  update: { label: 'تعديل', tone: 'amber' },
  delete: { label: 'حذف', tone: 'red' },
}

const MODULE_NAMES: Record<string, string> = {
  sales: 'المبيعات',
  purchases: 'المشتريات',
  transfers: 'التحويلات',
  requests: 'طلبات البضاعة',
  stock_counts: 'الجرد',
  expenses: 'المصروفات',
  income: 'الإيرادات',
  branch_accounts: 'حسابات الفروع',
  payroll: 'الرواتب',
  employees: 'الموظفون',
  users: 'المستخدمون',
  roles: 'الأدوار',
  products: 'المنتجات',
  returns: 'المرتجعات',
  exchanges: 'الاستبدال',
  damaged: 'التالف',
  settings: 'الإعدادات',
  shifts: 'الورديات',
  customers: 'العملاء',
  suppliers: 'الموردون',
}

export default function AuditLogPage() {
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedLog, setSelectedLog] = useState<any>(null)

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit_logs', moduleFilter, actionFilter, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (moduleFilter) q = q.eq('module', moduleFilter)
      if (actionFilter) q = q.eq('action', actionFilter)
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00Z`)
      if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59Z`)

      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // Get user profiles mapping for user IDs in logs
  const userIds = Array.from(new Set(logs?.map((l) => l.user_id).filter(Boolean) || []))

  const { data: usersMap } = useQuery({
    queryKey: ['audit_users_map', userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id,full_name,username').in('id', userIds)
      const map: Record<string, any> = {}
      data?.forEach((u) => {
        map[u.id] = u
      })
      return map
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل العمليات والرقابة (Audit Log)"
        subtitle="تتبع كامل لكافة الإدخالات والتعديلات وعمليات الحذف عبر النظام"
      />

      {/* Filters */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="القسم / الموديول">
          <Select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
            <option value="">جميع الأقسام</option>
            {Object.entries(MODULE_NAMES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="نوع العملية">
          <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">جميع العمليات</option>
            <option value="insert">إضافة (Insert)</option>
            <option value="update">تعديل (Update)</option>
            <option value="delete">حذف (Delete)</option>
          </Select>
        </Field>

        <Field label="من تاريخ">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>

        <Field label="إلى تاريخ">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>

      {/* Logs Table */}
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-cream-200/70 border-b border-cream-300 text-xs font-bold text-brand-900">
                <tr>
                  <th className="px-4 py-3 text-start">الوقت والتاريخ</th>
                  <th className="px-4 py-3 text-start">المستخدم المنفذ</th>
                  <th className="px-4 py-3 text-start">القسم</th>
                  <th className="px-4 py-3 text-start">الجدول</th>
                  <th className="px-4 py-3 text-center">نوع الإجراء</th>
                  <th className="px-4 py-3 text-start">معرّف السجل</th>
                  <th className="px-4 py-3 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {logs && logs.length > 0 ? (
                  logs.map((log) => {
                    const badge = ACTION_BADGES[log.action] || { label: log.action, variant: 'default' }
                    const user = usersMap?.[log.user_id]
                    return (
                      <tr key={log.id} className="hover:bg-cream-50/70 transition">
                        <td className="px-4 py-3 text-xs text-stone-600 font-mono">
                          {new Date(log.created_at).toLocaleString('ar-SA')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
                            <UserIcon className="h-3.5 w-3.5 text-stone-400" />
                            <span>{user?.full_name || user?.username || 'النظام / تلقائي'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-brand-900">
                          {MODULE_NAMES[log.module] || log.module || '-'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-stone-500">{log.table_name || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-stone-400">
                          {log.record_id ? log.record_id.slice(0, 8) + '...' : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="btn border border-cream-400 bg-white hover:bg-cream-100 text-brand-700 !px-2.5 !py-1 text-xs inline-flex items-center gap-1"
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
                    <td colSpan={7} className="text-center p-8 text-stone-400">
                      لا توجد سجلات مطابقة لمعايير البحث
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Diff View Modal */}
      {selectedLog && (
        <Modal
          open={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title={`تفاصيل العملية #${selectedLog.id} (${MODULE_NAMES[selectedLog.module] || selectedLog.module})`}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-cream-100 p-3 rounded-xl">
              <div>
                <span className="text-stone-400 block">الإجراء:</span>
                <span className="font-bold text-brand-900">{selectedLog.action}</span>
              </div>
              <div>
                <span className="text-stone-400 block">الجدول:</span>
                <span className="font-mono text-brand-900">{selectedLog.table_name}</span>
              </div>
              <div>
                <span className="text-stone-400 block">المستخدم:</span>
                <span className="font-bold text-brand-900">
                  {usersMap?.[selectedLog.user_id]?.full_name || selectedLog.user_id || 'تلقائي'}
                </span>
              </div>
              <div>
                <span className="text-stone-400 block">التاريخ والوقت:</span>
                <span className="font-mono text-stone-700">{new Date(selectedLog.created_at).toLocaleString('ar-SA')}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Old Data */}
              <div className="space-y-1">
                <span className="font-bold text-stone-700 block">البيانات السابقة (Before):</span>
                <pre className="bg-stone-900 text-stone-100 p-3 rounded-xl overflow-x-auto text-[11px] font-mono max-h-80">
                  {selectedLog.old_data
                    ? JSON.stringify(selectedLog.old_data, null, 2)
                    : 'لا توجد بيانات سابقة (عملية إضافة جديدة)'}
                </pre>
              </div>

              {/* New Data */}
              <div className="space-y-1">
                <span className="font-bold text-stone-700 block">البيانات الجديدة (After):</span>
                <pre className="bg-stone-900 text-stone-100 p-3 rounded-xl overflow-x-auto text-[11px] font-mono max-h-80">
                  {selectedLog.new_data
                    ? JSON.stringify(selectedLog.new_data, null, 2)
                    : 'تم حذف السجل بالكامل'}
                </pre>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
