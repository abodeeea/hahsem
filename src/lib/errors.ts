// تحويل أخطاء قاعدة البيانات (التي تُرمى من دوال fn_*) إلى رسائل عربية
const MAP: Record<string, string> = {
  INSUFFICIENT_STOCK: 'الكمية المتاحة غير كافية',
  NO_OPEN_SHIFT: 'لا توجد وردية مفتوحة، افتح وردية أولاً',
  SHIFT_ALREADY_OPEN: 'لديك وردية مفتوحة بالفعل',
  SHIFT_NOT_OPEN: 'الوردية مغلقة',
  FORBIDDEN_BRANCH: 'لا تملك صلاحية على هذا الفرع',
  FORBIDDEN: 'ليست لديك صلاحية لتنفيذ هذه العملية',
  EMPTY_CART: 'السلة فارغة',
  EMPTY_INVOICE: 'الفاتورة بلا بنود',
  EMPTY_TRANSFER: 'التحويل بلا بنود',
  EMPTY_RETURN: 'لم تحدد أي بند للإرجاع',
  CUSTOMER_REQUIRED_FOR_CREDIT: 'يجب اختيار عميل عند البيع بالآجل',
  OVERPAID: 'المبلغ المدفوع أكبر من إجمالي الفاتورة',
  INVALID_QTY: 'كمية غير صحيحة',
  INVALID_DISCOUNT: 'قيمة الخصم غير صحيحة',
  INVALID_STATUS: 'لا يمكن تنفيذ العملية في الحالة الحالية',
  RETURN_EXCEEDS_SOLD: 'كمية المرتجع أكبر من الكمية المباعة',
  PAYMENT_EXCEEDS_REMAINING: 'الدفعة أكبر من المتبقي',
  SAME_BRANCH: 'لا يمكن التحويل إلى نفس الموقع',
  INVALID_RECEIVED_QTY: 'الكمية المستلمة غير صحيحة',
  INVALID_PAID_AMOUNT: 'المبلغ المدفوع غير صحيح',
  COUNT_INCOMPLETE: 'أكمل إدخال الكميات الفعلية لكل المنتجات',
  PRODUCT_NOT_FOUND: 'منتج غير موجود أو موقوف',
}

export function errMsg(e: unknown): string {
  const raw: string = (e as any)?.message ?? String(e)
  for (const k of Object.keys(MAP)) {
    if (raw.includes(k)) {
      const extra = raw.split(k)[1]?.replace(/^[:\s]+/, '').trim()
      const showExtra = extra && !/[0-9a-f]{8}-[0-9a-f]{4}/.test(extra)
      return showExtra ? `${MAP[k]}: ${extra}` : MAP[k]
    }
  }
  if (raw.includes('row-level security')) return 'ليست لديك صلاحية لتنفيذ هذه العملية'
  if (raw.includes('duplicate key')) return 'القيمة مكررة (موجودة مسبقاً)'
  if (raw.includes('violates foreign key')) return 'لا يمكن الحذف أو التعديل لارتباط السجل ببيانات أخرى'
  if (raw.includes('Invalid login credentials')) return 'بيانات الدخول غير صحيحة'
  return raw
}
