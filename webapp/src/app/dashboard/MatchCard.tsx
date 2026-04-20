'use client'

import { useState, useEffect } from 'react'
import type { MatchWithListing } from '@/types/database'

const SEEN_KEY = 'gaukdarba-seen-v1'

const SOURCE_LABELS: Record<string, string> = {
  cvbankas: 'CVBankas',
  cvonline: 'CV.lt',
  cvmarket: 'CVmarket',
  unicorns: 'Unicorns',
  uzt: 'UZT',
}

function scoreBucket(s: number) {
  return s >= 8 ? 'high' : s >= 6 ? 'mid' : 'low'
}
function scoreLabel(s: number) {
  return s >= 8 ? 'PUIKIAI' : s >= 6 ? 'GERAI' : 'PRASTAI'
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
  const [isNew, setIsNew] = useState(false)
  const listing = match.raw_listings
  const score = match.detail_score ?? 0
  const bucket = scoreBucket(score)

  useEffect(() => {
    if (!isRecent) return
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
      if (!seen.includes(match.id)) {
        setIsNew(true)
        const timer = setTimeout(() => {
          const current: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
          localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...current, match.id])]))
          setIsNew(false)
        }, 5000)
        return () => clearTimeout(timer)
      }
    } catch { /* ignore */ }
  }, [match.id, isRecent])

  const reason = match.reason ?? ''

  return (
    <div className={`db-card ${bucket}${isNew ? ' is-new' : ''}`}>
      <div className="db-card-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="db-card-title">{listing?.title ?? 'Nežinoma pozicija'}</div>
          <div className="db-card-company">
            {listing?.company ?? 'Nežinoma įmonė'}
            {listing?.source && ` · ${SOURCE_LABELS[listing.source] ?? listing.source}`}
          </div>
        </div>
        <div className="db-score">
          <span className="n">{score.toFixed(1)}</span>
          <span className="l">{scoreLabel(score)}</span>
        </div>
      </div>

      <div className="db-card-meta">
        {listing?.location && (
          <span className="db-chip"><span className="k">📍</span>{listing.location}</span>
        )}
        {listing?.salary_raw && (
          <span className="db-chip"><span className="k">€</span>{listing.salary_raw}</span>
        )}
      </div>

      {reason && (
        <div className="db-reason">&ldquo;{reason}&rdquo;</div>
      )}

      <div className="db-card-foot">
        <div className="db-foot-left">
          <span>{dateLabel}</span>
        </div>
        <div className="db-foot-actions">
          {listing?.url && (
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="db-ia primary"
            >
              Skelbimas →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
