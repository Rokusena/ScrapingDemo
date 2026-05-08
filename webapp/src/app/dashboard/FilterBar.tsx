import Link from 'next/link'

interface FilterCounts {
  all: number
  high: number
  mid: number
  low: number
  history: number
}

const TABS = [
  { key: 'all',     label: 'Visi',        href: '/dashboard' },
  { key: 'high',    label: 'Puikūs · 8+', href: '/dashboard?filter=high' },
  { key: 'mid',     label: 'Geri · 6–7',  href: '/dashboard?filter=mid' },
  { key: 'low',     label: 'Silpni · <6', href: '/dashboard?filter=low' },
  { key: 'history', label: 'Oferti',      href: '/dashboard?filter=history' },
] as const

type FilterKey = (typeof TABS)[number]['key']

export default function FilterBar({
  counts,
  active,
}: {
  counts: FilterCounts
  active: FilterKey
}) {
  return (
    <div className="db-section-head">
      <div className="db-section-title">
        Rezultatai
        <span className="ct">sort: score · desc</span>
      </div>
      <div className="db-filters">
        {TABS.map((tab) => (
          counts[tab.key] > 0 || tab.key === 'all' ? (
            <Link
              key={tab.key}
              href={tab.href}
              className={`db-filter-btn${active === tab.key ? ' active' : ''}`}
            >
              {tab.label}
              <span className="c">{counts[tab.key]}</span>
            </Link>
          ) : null
        ))}
      </div>
    </div>
  )
}
