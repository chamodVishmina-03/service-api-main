import { createClient, SupabaseClient } from "@supabase/supabase-js"

// superbase use only photo update

let client: SupabaseClient | null = null




// url and super key checking 
export const isStorageConfigured = () =>
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY



// we can use superbase connection using that
export const getSupabase = (): SupabaseClient => {
  if (!isStorageConfigured()) {
    throw new Error("Image upload is not configured (set SUPABASE_URL and SUPABASE_KEY)")
  }
  if (!client) {
    client = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_KEY as string)
  }
  return client
}