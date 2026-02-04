import { createClient } from '@supabase/supabase-js'

// "Подушка безопасности":
// Если переменных нет (например, во время сборки), используем пустую строку,
// чтобы createClient не выдавал ошибку "supabaseUrl is required".
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"

export const supabase = createClient(supabaseUrl, supabaseKey)