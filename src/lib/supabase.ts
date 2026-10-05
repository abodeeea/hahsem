import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  rawUrl !== 'https://YOUR-PROJECT.supabase.co' &&
  rawUrl !== 'https://placeholder.supabase.co' &&
  rawKey !== 'YOUR-ANON-KEY' &&
  rawKey !== 'placeholder' &&
  !rawKey.includes('placeholder')
)

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn('⚠️ بيانات اتصال Supabase غير مكتملة أو افتراضية في ملف .env. يرجى تعديل VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY.')
}

const safeUrl = rawUrl && rawUrl.startsWith('http') ? rawUrl : 'https://placeholder.supabase.co'
const safeKey = rawKey && rawKey.length > 5 ? rawKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder'

export const supabase = createClient(safeUrl, safeKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
