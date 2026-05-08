'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MatchWithListing, ApplicationStatus } from '@/types/database'

const SOURCE_LABELS: Record<string, string> = {
  cvbankas: 'CVBankas',
  cvonline: 'CV.lt',
  cvmarket: 'CVmarket',
  unicorns: 'Unicorns',
  uzt: 'UZT',
}

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bg: string; border: string }> = {
  not_applied: { label: 'Nesikreipiau', color: '#86867e', bg: 'var(--paper-2)',                                    border: '#c8c8c0' },
  ignored:     { label: 'Ignoruota',    color: '#86867e', bg: 'var(--paper-2)',                                    border: '#c8c8c0' },
  applied:     { label: 'Teikiau',      color: '#1f6b52', bg: 'color-mix(in oklab, #1f6b52 10%, transparent)',     border: '#1f6b52' },
  no_response: { label: 'Neatsakė',     color: '#c47d2b', bg: 'color-mix(in oklab, #c47d2b 12%, transparent)',    border: '#c47d2b' },
  rejected:    { label: 'Atmetė',       color: '#b54a2c', bg: 'color-mix(in oklab, #b54a2c 12%, transparent)',    border: '#b54a2c' },
  interview:   { label: 'Pokalbis',     color: '#1f4d3d', bg: 'color-mix(in oklab, #d7f26a 25%, transparent)',    border: '#5a9a4a' },
  offer:       { label: 'Pasiūlė!',    color: '#1f4d3d', bg: 'color-mix(in oklab, #d7f26a 45%, transparent)',    border: '#5a9a4a' },
}

async function patchStatus(matchId: string, jobId: string, status: ApplicationStatus | null) {
  await fetch('/api/match-status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_id: matchId, job_id: jobId, status }),
  })
}

export default function OfferedCard({
  match,
  dateLabel,
}: {
  match: MatchWithListing
  dateLabel: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState<ApplicationStatus | null>(match.application_status ?? null)
  const [showMenu, setShowMenu] = useState(false)
  const [gone, setGone] = useState(false)

  const listing = match.raw_listings
  const cfg = status ? STATUS_CONFIG[status] : null

  const handleStatus = async (next: ApplicationStatus | null) => {
    const newStatus = next === status ? null : next
    setStatus(newStatus)
    setShowMenu(false)
    if (newStatus === null) setGone(true)
    await patchStatus(match.id, match.job_id, newStatus)
    router.refresh()
  }

  if (gone) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px',
      background: cfg ? cfg.bg : 'var(--paper)',
      border: `1px solid ${cfg ? cfg.border : 'var(--line)'}`,
      borderRadius: 10,
      position: 'relative',
      transition: 'opacity .15s',
    }}>

      {/* Status pill — primary visual */}
      <div style={{
        flexShrink: 0, width: 108,
        padding: '5px 0',
        borderRadius: 6,
        fontSize: 11, fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        textAlign: 'center',
        color: cfg?.color ?? 'var(--ink-4)',
        background: 'rgba(255,255,255,.45)',
        border: `1px solid ${cfg?.border ?? 'var(--line)'}`,
      }}>
        {cfg?.label ?? '—'}
      </div>

      {/* Job info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600, fontSize: 13.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--ink)',
        }}>
          {listing?.title ?? 'Nežinoma pozicija'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>{listing?.company ?? 'Nežinoma įmonė'}</span>
          {listing?.source && <span style={{ color: 'var(--ink-4)' }}>{SOURCE_LABELS[listing.source] ?? listing.source}</span>}
          {listing?.location && <span>📍 {listing.location}</span>}
          {listing?.salary_raw && <span>€ {listing.salary_raw}</span>}
        </div>
      </div>

      {/* Date */}
      <div style={{ flexShrink: 0, fontSize: 12, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
        {dateLabel}
      </div>

      {/* Actions */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={{
            padding: '5px 10px', borderRadius: 6, border: '1px solid var(--line)',
            background: showMenu ? 'var(--paper-2)' : 'transparent',
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink-3)',
          }}
        >
          Keisti ↓
        </button>

        {listing?.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '5px 10px', borderRadius: 6,
              border: '1px solid var(--line)',
              fontSize: 12, color: 'var(--ink-3)',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            →
          </a>
        )}

        {showMenu && (
          <div style={{
            position: 'absolute', top: '110%', right: 0, zIndex: 30,
            background: 'white', border: '1px solid var(--line)', borderRadius: 10,
            padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
            boxShadow: '0 4px 20px rgba(0,0,0,.12)', minWidth: 160,
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
                  fontWeight: status === key ? 700 : 400,
                }}
              >
                {c.label}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
            <button
              onClick={() => handleStatus(null)}
              style={{
                padding: '7px 12px', borderRadius: 6, border: 'none', textAlign: 'left',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                color: 'var(--ink-4)', background: 'transparent',
              }}
            >
              Grąžinti į aktyvius
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
