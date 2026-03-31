import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'
import { LayoutDashboard, Settings, Zap } from 'lucide-react'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Atitikimai', icon: LayoutDashboard },
  { href: '/dashboard/preferences', label: 'Nustatymai', icon: Settings },
]

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
    <div className="min-h-screen bg-[#080d1a] text-white flex">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-[rgba(255,255,255,0.06)] bg-[#0a0f1e] sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[rgba(255,255,255,0.06)]">
          <Link href="/dashboard" className="font-extrabold text-lg tracking-tight">
            <span className="text-[#4F6EF7]">Gauk</span>Darba
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#8892b0] hover:text-white hover:bg-[#141c33] transition-all group"
            >
              <Icon className="w-4 h-4 shrink-0 group-hover:text-[#4F6EF7] transition" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-[rgba(255,255,255,0.06)] space-y-2">
          <div className="px-3 py-2">
            <p className="text-xs text-[#8892b0] truncate">{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-20 border-b border-[rgba(255,255,255,0.06)] bg-[#080d1a]/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="font-extrabold text-lg tracking-tight">
            <span className="text-[#4F6EF7]">Gauk</span>Darba
          </Link>
          <div className="flex items-center gap-3">
            {NAV_LINKS.map(({ href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="p-2 rounded-lg text-[#8892b0] hover:text-white hover:bg-[#141c33] transition"
              >
                <Icon className="w-4 h-4" />
              </Link>
            ))}
            <div className="scale-90 origin-right">
              <SignOutButton />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto">
          <div className="flex items-center gap-2 mb-1 text-xs text-[#8892b0]">
            <Zap className="w-3 h-3 text-[#4F6EF7]" />
            <span>AI darbo paieška aktyvuota</span>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}
