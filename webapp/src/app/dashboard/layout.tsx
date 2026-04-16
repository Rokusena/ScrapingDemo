import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'
import { LayoutDashboard, Settings, Zap, BarChart2, Bell } from 'lucide-react'

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

  // Count matches from the last 24 h for the Pranešimai badge
  const cutoff24h = new Date(Date.now() - 86_400_000).toISOString()
  const { count: newCount } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('matched_at', cutoff24h)

  const newMatchCount = newCount ?? 0

  const NAV_LINKS = [
    { href: '/dashboard',        label: 'Atitikimai',  icon: LayoutDashboard, badge: null },
    { href: '/dashboard/stats',  label: 'Statistika',  icon: BarChart2,        badge: null },
    { href: '/dashboard',        label: 'Pranešimai',  icon: Bell,             badge: newMatchCount > 0 ? newMatchCount : null },
    { href: '/dashboard/preferences', label: 'Nustatymai', icon: Settings,    badge: null },
  ]

  return (
    <div className="min-h-screen bg-[#080d1a] text-white flex">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/6 bg-[#0a0f1e] sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/6">
          <Link href="/dashboard" className="font-extrabold text-lg tracking-tight">
            <span className="text-[#4F6EF7]">Gauk</span>Darba
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_LINKS.map(({ href, label, icon: Icon, badge }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#8892b0] hover:text-white hover:bg-[#141c33] transition-all group"
            >
              <Icon className="w-4 h-4 shrink-0 group-hover:text-[#4F6EF7] transition" />
              <span className="flex-1">{label}</span>
              {badge !== null && (
                <span className="px-1.5 py-0.5 bg-[#4F6EF7] text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">
                  {badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Stats strip */}
        {newMatchCount > 0 && (
          <div className="mx-3 mb-3 px-3 py-2.5 bg-[#4F6EF7]/8 border border-[#4F6EF7]/20 rounded-xl">
            <p className="text-xs text-[#8892b0] mb-0.5">Šiandien nauja</p>
            <p className="text-sm font-bold text-[#6B84F8]">+{newMatchCount} atitikimų</p>
          </div>
        )}

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-white/6 space-y-2">
          <div className="px-3 py-2">
            <p className="text-xs text-[#8892b0] truncate">{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-20 border-b border-white/6 bg-[#080d1a]/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="font-extrabold text-lg tracking-tight">
            <span className="text-[#4F6EF7]">Gauk</span>Darba
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="relative p-2 rounded-lg text-[#8892b0] hover:text-white hover:bg-[#141c33] transition">
              <LayoutDashboard className="w-4 h-4" />
            </Link>
            <Link href="/dashboard" className="relative p-2 rounded-lg text-[#8892b0] hover:text-white hover:bg-[#141c33] transition">
              <Bell className="w-4 h-4" />
              {newMatchCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#4F6EF7] rounded-full" />
              )}
            </Link>
            <Link href="/dashboard/preferences" className="p-2 rounded-lg text-[#8892b0] hover:text-white hover:bg-[#141c33] transition">
              <Settings className="w-4 h-4" />
            </Link>
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
