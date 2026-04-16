import Link from 'next/link'

interface FilterCounts {
  all: number
  high: number
  mid: number
  low: number
}

const TABS = [
  { key: 'all',  label: 'Visi',     href: '/dashboard' },
  { key: 'high', label: '8–10 ✦',  href: '/dashboard?filter=high' },
  { key: 'mid',  label: '6–7',      href: '/dashboard?filter=mid' },
  { key: 'low',  label: '< 6',      href: '/dashboard?filter=low' },
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
    <div className="flex gap-2 flex-wrap">
      {TABS.map((tab) => {
        const count = counts[tab.key]
        const isActive = active === tab.key
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              isActive
                ? 'bg-[#4F6EF7]/15 border-[#4F6EF7] text-white'
                : 'bg-white/3 border-white/8 text-[#8892b0] hover:text-white hover:border-white/18'
            }`}
          >
            {tab.label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${
                isActive ? 'bg-[#4F6EF7]/30 text-[#b0c0ff]' : 'bg-white/7 text-[#8892b0]'
              }`}
            >
              {count}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
