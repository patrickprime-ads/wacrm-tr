import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error(
      'CLOUDFLARE_ENV_ERROR: NEXT_PUBLIC_SUPABASE_URL não está disponível no runtime'
    )
  }

  if (!supabaseAnonKey) {
    throw new Error(
      'CLOUDFLARE_ENV_ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY não está disponível no runtime'
    )
  }

  const cookieStore = await cookies()

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Pode ser chamado a partir de Server Component.
            // O middleware é responsável por atualizar a sessão.
          }
        },
      },
    }
  )
}