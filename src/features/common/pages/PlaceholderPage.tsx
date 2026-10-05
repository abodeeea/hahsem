import { Construction } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

/** صفحات قيد التطوير حسب خطة التنفيذ (المراحل 4-6) */
export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="card flex flex-col items-center gap-3 p-16 text-center text-stone-500">
        <Construction className="h-12 w-12 text-brand-400" />
        <div className="font-semibold text-stone-700">هذه الصفحة قيد التطوير</div>
        <div className="text-sm">ستُضاف في مرحلة لاحقة حسب خطة التنفيذ.</div>
      </div>
    </>
  )
}
