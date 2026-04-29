'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard',             label: 'Atitikimai', ico: '⊟' },
  { href: '/dashboard/stats',       label: 'Statistika',  ico: '⏚' },
  { href: '/dashboard/preferences', label: 'Nustatymai',  ico: '⚙' },
]

export const BREADCRUMB_MAP: Record<string, string> = {
  '/dashboard':             'Atitikimai',
  '/dashboard/stats':       'Statistika',
  '/dashboard/preferences': 'Nustatymai',
}

interface Props {
  newMatchCount: number
}

export default function DashboardNav({ newMatchCount }: Props) {
  const pathname = usePathname()

  return (
    <nav className="db-nav">
      {NAV_ITEMS.map((n) => {
        const active = pathname === n.href
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`db-link${active ? ' active' : ''}`}
          >
            <span className="db-link-ico">{n.ico}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.href === '/dashboard' && newMatchCount > 0 && (
              <span className="db-link-badge">{newMatchCount}</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
