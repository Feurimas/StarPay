import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fepztwbeyilgxidszysk.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcHp0d2JleWlsZ3hpZHN6eXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxODMzNTksImV4cCI6MjExMDc1OTM1OX0.LZW4uat_yqOLnyHfcOfhZg4g_Ag0w25s1LYUWCDmwQA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
