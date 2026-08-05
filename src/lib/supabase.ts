import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'חסרים משתני הסביבה VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY. ' +
      'העתיקי את .env.example ל-.env.local ומלאי בו את הערכים מפרויקט ה-Supabase שלך.',
  )
}

export const supabase = createClient<Database>(url, anonKey)
