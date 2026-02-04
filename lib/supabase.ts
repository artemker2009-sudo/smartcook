import { createClient } from '@supabase/supabase-js'

// ВСТАВЛЯЙ СЮДА СВОИ РЕАЛЬНЫЕ ДАННЫЕ В КАВЫЧКИ
// Прямо копируй из .env.local
const supabaseUrl = "https://yjfqwwiqwoighjdlkodg.supabase.co" 
const supabaseKey = "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z"

// Мы убрали process.env и заглушки. Теперь Vercel не отвертится.
export const supabase = createClient(supabaseUrl, supabaseKey)