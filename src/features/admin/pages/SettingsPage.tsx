import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Printer, Shield, Save, Upload, Receipt as ReceiptIcon, Percent } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/store/toast.store'
import { errMsg } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { Field, Input, Textarea, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export default function SettingsPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'company' | 'pos' | 'policies'>('company')

  // Company Profile
  const { data: company, isLoading: loadingCompany } = useQuery({
    queryKey: ['company_profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_profile').select('*').limit(1).maybeSingle()
      if (error) throw error
      return data || {}
    },
  })

  // System Settings
  const { data: settingsList, isLoading: loadingSettings } = useQuery({
    queryKey: ['system_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*')
      if (error) throw error
      const map: Record<string, any> = {}
      data?.forEach((s) => {
        map[s.key] = s.value
      })
      return map
    },
  })

  const [companyForm, setCompanyForm] = useState<any>({
    name: '',
    logo_url: '',
    tax_number: '',
    phone: '',
    address: '',
    invoice_footer: 'شكراً لتسوقكم معنا',
  })

  const [settingsForm, setSettingsForm] = useState<any>({
    'invoice.print': { paper: '80mm', auto_print: true },
    'sales.allow_credit': { value: true },
    'inventory.allow_negative': { value: false },
    'commission.mode': { basis: 'net_sales', type: 'flat' },
  })

  useEffect(() => {
    if (company && Object.keys(company).length > 0) {
      setCompanyForm({
        name: company.name || '',
        logo_url: company.logo_url || '',
        tax_number: company.tax_number || '',
        phone: company.phone || '',
        address: company.address || '',
        invoice_footer: company.invoice_footer || 'شكراً لتسوقكم معنا',
      })
    }
  }, [company])

  useEffect(() => {
    if (settingsList) {
      setSettingsForm((prev: any) => ({
        ...prev,
        ...settingsList,
      }))
    }
  }, [settingsList])

  const [uploadingLogo, setUploadingLogo] = useState(false)
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `company-logo-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName)
      setCompanyForm((prev: any) => ({ ...prev, logo_url: publicUrl }))
      toast.success('تم رفع الشعار بنجاح')
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setUploadingLogo(false)
    }
  }

  const saveCompanyMutation = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase.from('company_profile').select('id').limit(1).maybeSingle()
      if (existing?.id) {
        const { error } = await supabase.from('company_profile').update(companyForm).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('company_profile').insert([companyForm])
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company_profile'] })
      qc.invalidateQueries({ queryKey: ['company'] })
      toast.success('تم حفظ بيانات المنشأة بنجاح')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      for (const [key, value] of Object.entries(settingsForm)) {
        const { data: existing } = await supabase.from('settings').select('id').eq('key', key).is('branch_id', null).maybeSingle()
        if (existing?.id) {
          const { error } = await supabase.from('settings').update({ value }).eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('settings').insert([{ key, value }])
          if (error) throw error
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system_settings'] })
      toast.success('تم حفظ إعدادات النظام بنجاح')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (loadingCompany || loadingSettings) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader
        title="إعدادات النظام والمنشأة"
        subtitle="تخصيص بيانات المتجر، سياسات الفواتير، الطباعة، وضوابط العمليات"
      />

      {/* Tabs */}
      <div className="flex border-b border-cream-300 gap-2">
        <button
          onClick={() => setActiveTab('company')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition ${
            activeTab === 'company'
              ? 'border-gold-500 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-brand-800'
          }`}
        >
          <Building2 className="h-4 w-4 text-gold-600" />
          بيانات المنشأة والهوية
        </button>
        <button
          onClick={() => setActiveTab('pos')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition ${
            activeTab === 'pos'
              ? 'border-gold-500 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-brand-800'
          }`}
        >
          <Printer className="h-4 w-4 text-gold-600" />
          إعدادات الطباعة ونقاط البيع
        </button>
        <button
          onClick={() => setActiveTab('policies')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition ${
            activeTab === 'policies'
              ? 'border-gold-500 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-brand-800'
          }`}
        >
          <Shield className="h-4 w-4 text-gold-600" />
          سياسات وقواعد النظام
        </button>
      </div>

      {/* Tab 1: Company Profile */}
      {activeTab === 'company' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6 space-y-4">
            <h3 className="text-base font-bold text-brand-800 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-gold-600" />
              البيانات الرسمية للمنشأة
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="اسم المنشأة / المتجر" hint="يظهر في رأس الفواتير والتقارير">
                <Input
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  placeholder="مثال: هاشم للطيب والعطور"
                />
              </Field>

              <Field label="الرقم الضريبي" hint="الرقم الضريبي المسجل بهيئة الزكاة والضريبة">
                <Input
                  value={companyForm.tax_number}
                  onChange={(e) => setCompanyForm({ ...companyForm, tax_number: e.target.value })}
                  placeholder="300XXXXXXXXXXXX"
                />
              </Field>

              <Field label="رقم الهاتف والتواصل">
                <Input
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  placeholder="05XXXXXXXX"
                />
              </Field>

              <Field label="العنوان والمدينة">
                <Input
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  placeholder="الرياض، المملكة العربية السعودية"
                />
              </Field>
            </div>

            <Field label="تذييل الفاتورة (ملاحظة أسفل الإيصال)">
              <Textarea
                value={companyForm.invoice_footer}
                onChange={(e) => setCompanyForm({ ...companyForm, invoice_footer: e.target.value })}
                placeholder="شكراً لزيارتكم • البضاعة المباعة تستبدل خلال 3 أيام"
                rows={2}
              />
            </Field>

            <div className="pt-2 flex justify-end">
              <Button
                variant="gold"
                loading={saveCompanyMutation.isPending}
                onClick={() => saveCompanyMutation.mutate()}
              >
                <Save className="h-4 w-4" />
                حفظ بيانات المنشأة
              </Button>
            </div>
          </div>

          {/* Logo & Preview */}
          <div className="card p-6 space-y-5 text-center">
            <h3 className="text-sm font-bold text-brand-800">شعار المنشأة</h3>
            <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-2xl border-2 border-dashed border-cream-400 bg-cream-50 overflow-hidden relative group">
              {companyForm.logo_url ? (
                <img src={companyForm.logo_url} alt="شعار المتجر" className="h-full w-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center text-stone-400 text-xs gap-1">
                  <Upload className="h-8 w-8 text-gold-500" />
                  <span>لا يوجد شعار</span>
                </div>
              )}
            </div>

            <div>
              <label className="btn border border-cream-400 bg-white text-brand-700 hover:bg-cream-100 cursor-pointer inline-flex items-center gap-2 text-xs">
                <Upload className="h-4 w-4 text-gold-600" />
                {uploadingLogo ? 'جارٍ الرفع...' : 'رفع شعار جديد'}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
              </label>
              <p className="text-[11px] text-stone-400 mt-2">يُفضل استخدام صورة بخلفية شفافة PNG بحجم أقل من 1 ميجابايت</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: POS & Print Settings */}
      {activeTab === 'pos' && (
        <div className="card p-6 space-y-6 max-w-3xl">
          <h3 className="text-base font-bold text-brand-800 flex items-center gap-2">
            <Printer className="h-5 w-5 text-gold-600" />
            خيارات الطباعة وإيصالات المبيعات
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="نوع مقاس ورق الفاتورة">
              <Select
                value={settingsForm['invoice.print']?.paper || '80mm'}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    'invoice.print': { ...settingsForm['invoice.print'], paper: e.target.value },
                  })
                }
              >
                <option value="80mm">طابعة إيصالات حرارية (80mm - الشائعة)</option>
                <option value="58mm">طابعة إيصالات صغيرة (58mm)</option>
                <option value="A4">طابعة مكتبية قياسية (A4)</option>
              </Select>
            </Field>

            <Field label="الطباعة التلقائية عند إتمام البيع">
              <Select
                value={settingsForm['invoice.print']?.auto_print ? 'true' : 'false'}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    'invoice.print': { ...settingsForm['invoice.print'], auto_print: e.target.value === 'true' },
                  })
                }
              >
                <option value="true">تلقائي (فتح نافذة الطباعة فوراً)</option>
                <option value="false">يدوي (حسب رغبة الكاشير)</option>
              </Select>
            </Field>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="gold"
              loading={saveSettingsMutation.isPending}
              onClick={() => saveSettingsMutation.mutate()}
            >
              <Save className="h-4 w-4" />
              حفظ إعدادات الطباعة
            </Button>
          </div>
        </div>
      )}

      {/* Tab 3: System Policies */}
      {activeTab === 'policies' && (
        <div className="card p-6 space-y-6 max-w-3xl">
          <h3 className="text-base font-bold text-brand-800 flex items-center gap-2">
            <Shield className="h-5 w-5 text-gold-600" />
            ضوابط وسياسات العمل
          </h3>

          <div className="space-y-4 divide-y divide-cream-200">
            <div className="pt-3 flex items-center justify-between">
              <div>
                <div className="font-semibold text-brand-800 text-sm">السماح بالبيع الآجل للعملاء</div>
                <div className="text-xs text-stone-500">إمكانية إصدار فاتورة بيع بآجل أو دفع جزئي واشتراط اختيار عميل مسجل</div>
              </div>
              <Select
                className="w-32"
                value={settingsForm['sales.allow_credit']?.value ? 'true' : 'false'}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    'sales.allow_credit': { value: e.target.value === 'true' },
                  })
                }
              >
                <option value="true">مفعّل</option>
                <option value="false">معطل</option>
              </Select>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-brand-800 text-sm">السماح بالرصيد السالب للمخزون</div>
                <div className="text-xs text-stone-500">منع البيع أو الصرف في حال كانت الكمية المتاحة في الفرع أقل من المطلوب</div>
              </div>
              <Select
                className="w-32"
                value={settingsForm['inventory.allow_negative']?.value ? 'true' : 'false'}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    'inventory.allow_negative': { value: e.target.value === 'true' },
                  })
                }
              >
                <option value="false">ممنوع (آمن)</option>
                <option value="true">مسموح</option>
              </Select>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-brand-800 text-sm">أساس احتساب عمولة المبيعات</div>
                <div className="text-xs text-stone-500">طريقة احتساب المبيعات المؤهلة لعمولات الموظفين</div>
              </div>
              <Select
                className="w-48"
                value={settingsForm['commission.mode']?.basis || 'net_sales'}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    'commission.mode': { ...settingsForm['commission.mode'], basis: e.target.value },
                  })
                }
              >
                <option value="net_sales">صافي المبيعات (بعد المرتجعات)</option>
                <option value="gross_sales">إجمالي المبيعات</option>
              </Select>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <Button
              variant="gold"
              loading={saveSettingsMutation.isPending}
              onClick={() => saveSettingsMutation.mutate()}
            >
              <Save className="h-4 w-4" />
              حفظ السياسات
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
