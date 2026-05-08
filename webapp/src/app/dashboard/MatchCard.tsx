'use client'

import { useState, useEffect } from 'react'
import type { MatchWithListing, ApplicationStatus } from '@/types/database'

const SEEN_KEY = 'gaukdarba-seen-v1'

const SOURCE_LABELS: Record<string, string> = {
  cvbankas: 'CVBankas',
  cvonline: 'CV.lt',
  cvmarket: 'CVmarket',
  unicorns: 'Unicorns',
  uzt: 'UZT',
}

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bg: string }> = {
  applied:     { label: 'Teikiau',      color: '#1f4d3d', bg: 'color-mix(in oklab, #1f4d3d 10%, transparent)' },
  not_applied: { label: 'Nesikreipiau', color: '#86867e', bg: 'var(--paper-3)' },
  ignored:     { label: 'Ignoruota',    color: '#86867e', bg: 'var(--paper-3)' },
  no_response: { label: 'Neatsakė',     color: '#c47d2b', bg: 'color-mix(in oklab, #c47d2b 10%, transparent)' },
  rejected:    { label: 'Atmetė',       color: '#b54a2c', bg: 'color-mix(in oklab, #b54a2c 10%, transparent)' },
  interview:   { label: 'Pokalbis',     color: '#1f4d3d', bg: 'color-mix(in oklab, #d7f26a 30%, transparent)' },
  offer:       { label: 'Pasiūlė!',    color: '#1f4d3d', bg: 'color-mix(in oklab, #d7f26a 50%, transparent)' },
}

function scoreBucket(s: number) {
  return s >= 8 ? 'high' : s >= 6 ? 'mid' : 'low'
}
function scoreLabel(s: number) {
  return s >= 8 ? 'PUIKIAI' : s >= 6 ? 'GERAI' : 'PRASTAI'
}

async function updateStatus(matchId: string, status: ApplicationStatus | null) {
  await fetch('/api/match-status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_id: matchId, status }),
  })
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
  const [status, setStatus] = useState<ApplicationStatus | null>(match.application_status ?? null)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [hiddenFromActive, setHiddenFromActive] = useState(false)

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

  const handleStatus = async (next: ApplicationStatus | null) => {
    const newStatus = next === status ? null : next  // toggle off if same
    // Hide from active view when a status is first set
    if (newStatus !== null && status === null) {
      setHiddenFromActive(true)
    }
    setStatus(newStatus)
    setShowStatusMenu(false)
    await updateStatus(match.id, newStatus)
  }

  const cfg = status ? STATUS_CONFIG[status] : null

  if (hiddenFromActive) return null

  return (
    <div
      className={`db-card ${bucket}${isNew ? ' is-new' : ''}`}
    >
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
        {cfg && (
          <span
            className="db-chip"
            style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color, opacity: 1, cursor: 'pointer' }}
            onClick={() => handleStatus(null)}
            title="Spustelėk norėdamas pašalinti statusą"
          >
            {cfg.label} ×
          </span>
        )}
      </div>

      {match.reason && (
        <div className="db-reason">&ldquo;{match.reason}&rdquo;</div>
      )}

      <div className="db-card-foot">
        <div className="db-foot-left">
          <span>{dateLabel}</span>
        </div>
        <div className="db-foot-actions" style={{ position: 'relative' }}>
          {/* Status button + dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowStatusMenu((v) => !v)}
              style={{
                padding: '5px 10px', borderRadius: 6,
                border: '1px solid var(--line)',
                background: showStatusMenu ? 'var(--paper-2)' : 'transparent',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                color: cfg ? cfg.color : 'var(--ink-3)',
                fontWeight: cfg ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {cfg ? `${cfg.label} ↓` : 'Žymėti ↓'}
            </button>
            {showStatusMenu && (
              <div style={{
                position: 'absolute', bottom: '110%', right: 0, zIndex: 20,
                background: 'white', border: '1px solid var(--line)', borderRadius: 10,
                padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
                boxShadow: '0 4px 16px rgba(0,0,0,.1)', minWidth: 150,
              }}>
                {(Object.entries(STATUS_CONFIG) as [ApplicationStatus, typeof STATUS_CONFIG[ApplicationStatus]][]).map(([key, c]) => (
                  <button
                    key={key}
                    onClick={() => handleStatus(key)}
                    style={{
                      padding: '7px 12px', borderRadius: 6, border: 'none', textAlign: 'left',
                      fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      background: status === key ? c.bg : 'transparent',
                      color: status === key ? c.color : 'var(--ink)',
                      fontWeight: status === key ? 600 : 400,
                    }}
                  >
                    {c.label}
                  </button>
                ))}
                {status !== null && (
                  <>
                    <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
                    <button
                      onClick={() => handleStatus(null)}
                      style={{
                        padding: '7px 12px', borderRadius: 6, border: 'none', textAlign: 'left',
                        fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                        color: 'var(--ink-4)', background: 'transparent',
                      }}
                    >
                      Valyti statusą
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

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
