import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Must match the SESSION_MAX_AGE in middleware.ts
const SESSION_MAX_AGE = 60 * 60 * 24 // 24 hours (in seconds)

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(options as any),
                maxAge: SESSION_MAX_AGE,
              })
            )
          } catch {
            // Called from a Server Component — middleware handles session refresh.
          }
        },
      },
    }
  )
}
