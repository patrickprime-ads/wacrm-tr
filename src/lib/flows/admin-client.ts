import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy, shared service-role client for the Fluxos engine.
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl) {
      throw new Error(
        'CLOUDFLARE_ENV_ERROR: NEXT_PUBLIC_SUPABASE_URL não está disponível no runtime'
      )
    }

    if (!serviceRoleKey) {
      throw new Error(
        'CLOUDFLARE_ENV_ERROR: SUPABASE_SERVICE_ROLE_KEY não está disponível no runtime'
      )
    }

    _adminClient = createClient(
      supabaseUrl,
      serviceRoleKey
    )
  }

  return _adminClient
}