import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yjlqoisagmpxdiqoklyi.supabase.co'
const supabaseAnonKey = 'sb_publishable_7HKjtNZxNjB0JEXcneKOdQ_5u3a1tt2'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
