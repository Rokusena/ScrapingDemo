'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BREADCRUMB_MAP } from './DashboardNav'

export default function DashboardTopbar() {
  const pathname = usePathname()
  const crumb = BREADCRUMB_MAP[pathname] ?? 'Dashboard'

  return (
    <div className="db-topbar">
      <div className="db-crumb">
        <span>gaukdarba</span>
        <span className="sep">/</span>
        <span className="cur">{crumb.toLowerCase()}</span>
      </div>
      <div className="db-topbar-right">
        <span className="db-scan-chip">
          <span className="db-scan-dot" />
          Skenavimas aktyvus · next 06:00
        </span>
        <Link href="/dashboard/preferences" className="db-icon-btn" title="Nustatymai">
          ⚙
        </Link>
      </div>
    </div>
  )
}
