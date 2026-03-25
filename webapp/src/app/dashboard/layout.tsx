import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="sticky top-0 z-50 border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="font-extrabold text-xl tracking-tight">
              <span className="text-indigo-400">Darb</span>AI
            </Link>
            <div className="hidden sm:flex items-center gap-6">
              <Link
                href="/dashboard"
                className="text-sm text-gray-400 hover:text-white transition"
              >
                Atitikimai
              </Link>
              <Link
                href="/dashboard/preferences"
                className="text-sm text-gray-400 hover:text-white transition"
              >
                Nustatymai
              </Link>
            </div>
          </div>
          <SignOutButton />
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
    </div>
  )
}
