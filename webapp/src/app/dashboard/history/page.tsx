import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { MatchWithListing } from '@/types/database'
import OfferedCard from '../OfferedCard'

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffH = Math.floor(diffMs / 3_600_000)
  const diffD = Math.floor(diffMs / 86_400_000)
  if (diffMin < 5) return 'Ką tik'
  if (diffMin < 60) return `Prieš ${diffMin} min.`
  if (diffH < 24) return `Prieš ${diffH} val.`
  if (diffD === 1) return 'Vakar'
  if (diffD < 7) return `Prieš ${diffD} d.`
  return date.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
}

const STATUS_GROUPS = [
  { key: 'applied',     label: 'Teikiau CV' },
  { key: 'interview',   label: 'Pokalbis' },
  { key: 'offer',       label: 'Pasiūlymas' },
  { key: 'no_response', label: 'Neatsakė' },
  { key: 'rejected',    label: 'Atmetė' },
  { key: 'not_applied', label: 'Nesikreipiau' },
  { key: 'ignored',     label: 'Ignoruota' },
]

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('matches')
    .select('*, raw_listings(*)')
    .eq('user_id', user.id)
    .not('application_status', 'is', null)
    .order('matched_at', { ascending: false })
    .limit(200)

  const matches = (data ?? []) as MatchWithListing[]

  const grouped = STATUS_GROUPS.map((g) => ({
    ...g,
    items: matches.filter((m) => m.application_status === g.key),
  })).filter((g) => g.items.length > 0)

  return (
    <>
      <div className="db-section-head" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>
            // istorija
          </div>
          <div className="db-section-title">
            Sekamos pozicijos
            <span className="ct">{matches.length}</span>
          </div>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="db-empty">
          <p style={{ fontSize: 36, marginBottom: 12 }}>📋</p>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-.01em', marginBottom: 8 }}>
            Dar nėra sekamų pozicijų
          </p>
          <p style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 340, margin: '0 auto', lineHeight: 1.6 }}>
            Atitikimų kortelėse spustelėk „Žymėti ↓" ir pasirink statusą — kortelė persikels čia.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {grouped.map((group) => (
            <div key={group.key}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em',
                textTransform: 'uppercase', color: 'var(--ink-4)',
                marginBottom: 8,
              }}>
                {group.label} · {group.items.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {group.items.map((match) => (
                  <OfferedCard
                    key={match.id}
                    match={match}
                    dateLabel={relativeDate(match.matched_at)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
