'use client'

import { useState, useEffect } from 'react'
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import type { MatchWithListing } from '@/types/database'

const SEEN_KEY = 'gaukdarba-seen-v1'

const SOURCE_LABELS: Record<string, string> = {
  cvbankas: 'CVBankas',
  cvonline: 'CV-Online',
  cvmarket: 'CVmarket',
  unicorns: 'Unicorns',
  uzt: 'UZT',
}

function ScoreBadge({ score }: { score: number }) {
  const isHigh = score >= 8
  const isMid = score >= 6

  const styles = isHigh
    ? { bg: '#43e97b1a', text: '#43e97b', border: '#43e97b40', label: 'Puikiai' }
    : isMid
    ? { bg: '#f7b7311a', text: '#f7b731', border: '#f7b73140', label: 'Gerai' }
    : { bg: '#f8716f1a', text: '#f87171', border: '#f8716f40', label: 'Vidutiniškai' }

  return (
    <div
      className="shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-xl border text-center"
      style={{ background: styles.bg, borderColor: styles.border }}
    >
      <span className="text-xl font-extrabold leading-none" style={{ color: styles.text }}>
        {score}
      </span>
      <span className="text-[10px] font-medium opacity-60 leading-none mt-0.5" style={{ color: styles.text }}>
        /10
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wide mt-1 opacity-80" style={{ color: styles.text }}>
        {styles.label}
      </span>
    </div>
  )
}

export default function MatchCard({
  match,
  dateLabel,
  isRecent,
}: {
  match: MatchWithListing
  dateLabel: string
  isRecent: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const listing = match.raw_listings
  const score = match.detail_score ?? 0

  // Left accent color by score
  const accentColor = score >= 8 ? '#43e97b' : score >= 6 ? '#f7b731' : '#f87171'

  useEffect(() => {
    if (!isRecent) return
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
      if (!seen.includes(match.id)) {
        setIsNew(true)
        // Dim the "Nauja" badge after 5 s and persist seen state
        const timer = setTimeout(() => {
          const current: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
          localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...current, match.id])]))
          setIsNew(false)
        }, 5000)
        return () => clearTimeout(timer)
      }
    } catch {
      // ignore localStorage errors
    }
  }, [match.id, isRecent])

  const reason = match.reason ?? ''
  const reasonLong = reason.length > 160
  const reasonText = expanded || !reasonLong ? reason : reason.slice(0, 160) + '…'

  return (
    <div
      className="group flex flex-col rounded-2xl border border-white/8 hover:border-white/15 transition-all overflow-hidden"
      style={{
        background: '#141c33',
        borderLeft: `3px solid ${accentColor}`,
      }}
    >
      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2 mb-1">
              <h3
                className="font-bold text-[15px] leading-snug line-clamp-2 group-hover:text-[#6B84F8] transition-colors"
                title={listing?.title ?? undefined}
              >
                {listing?.title ?? 'Nežinoma pozicija'}
              </h3>
              {isNew && (
                <span className="shrink-0 mt-0.5 px-1.5 py-0.5 bg-[#4F6EF7] text-white text-[9px] font-bold rounded uppercase tracking-wider">
                  Nauja
                </span>
              )}
            </div>
            <p className="text-[#8892b0] text-sm truncate">{listing?.company ?? 'Nežinoma įmonė'}</p>
          </div>
          <ScoreBadge score={score} />
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {listing?.location && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-white/4 border border-white/7 rounded-lg text-[#8892b0] text-xs">
              📍 {listing.location}
            </span>
          )}
          {listing?.salary_raw && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-white/4 border border-white/7 rounded-lg text-[#8892b0] text-xs">
              💶 {listing.salary_raw}
            </span>
          )}
          {listing?.source && (
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/8 text-[#8892b0] text-xs font-medium">
              {SOURCE_LABELS[listing.source] ?? listing.source}
            </span>
          )}
        </div>

        {/* Reason — expandable */}
        {reason && (
          <div className="bg-white/3 border border-white/6 rounded-xl px-4 py-3">
            <p className="text-[#8892b0] text-xs font-semibold uppercase tracking-wide mb-2">
              Kodėl tinka
            </p>
            <p className="text-[#c8cfe8] text-sm leading-relaxed">{reasonText}</p>
            {reasonLong && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center gap-1 mt-2 text-[#4F6EF7] hover:text-[#6B84F8] text-xs font-medium transition"
              >
                {expanded ? (
                  <><ChevronUp className="w-3 h-3" /> Rodyti mažiau</>
                ) : (
                  <><ChevronDown className="w-3 h-3" /> Rodyti daugiau</>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between pt-2.5 border-t border-white/6">
          <span className="text-[#8892b0] text-xs">{dateLabel}</span>
        </div>
        {listing?.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 py-2.5 bg-[#4F6EF7]/10 hover:bg-[#4F6EF7]/20 border border-[#4F6EF7]/25 hover:border-[#4F6EF7]/50 text-[#6B84F8] text-sm font-semibold rounded-xl transition"
          >
            Žiūrėti skelbimą
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}
