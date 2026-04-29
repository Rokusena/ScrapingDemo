import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { MatchWithListing, Profile, JobPreferences } from '@/types/database'
import CheckoutButton from './CheckoutButton'
import PostAuthRedirect from './PostAuthRedirect'
import MatchCard from './MatchCard'
import FilterBar from './FilterBar'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Static scan log rows (shows transparency about what AI reviewed)
const LOG_ROWS = [
  { t: '11:04:12', src: 'cvbankas.lt',  msg: 'Senior React Developer — Tesonet',       hit: true,  score: 9.4 },
  { t: '11:04:10', src: 'cv.lt',        msg: 'Kasininkas-konsultantas — Maxima',        hit: false },
  { t: '11:04:08', src: 'unicorns.lt',  msg: 'Staff Frontend Engineer — Vinted',        hit: true,  score: 9.1 },
  { t: '11:04:07', src: 'cvmarket.lt',  msg: 'Sales Executive — TopSport',              hit: false },
  { t: '11:04:05', src: 'cvbankas.lt',  msg: 'Full-stack Developer — Hostinger',        hit: true,  score: 8.7 },
  { t: '11:04:03', src: 'uzt.lt',       msg: 'Sandėlio darbuotojas — Omniva',           hit: false },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { success?: string; filter?: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: preferences }, { data: matches }, { count: totalListings }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single<Profile>(),
    supabase.from('job_preferences').select('*').eq('user_id', user.id).maybeSingle<JobPreferences>(),
    supabase
      .from('matches')
      .select('*, raw_listings(*)')
      .eq('user_id', user.id)
      .not('detail_score', 'is', null)
      .gte('detail_score', 3)
      .order('detail_score', { ascending: false })
      .order('title_score', { ascending: false })
      .limit(60),
    supabase.from('raw_listings').select('*', { count: 'exact', head: true }),
  ])

  const allMatches = (matches ?? []) as MatchWithListing[]

  // Separate ignored from the rest — ignored only shown when explicitly filtered
  const ignoredMatches = allMatches.filter((m) => m.application_status === 'ignored')
  const activeMatches  = allMatches.filter((m) => m.application_status !== 'ignored')
  const appliedMatches = allMatches.filter((m) => m.application_status === 'applied')

  const counts = {
    all:     activeMatches.length,
    high:    activeMatches.filter((m) => (m.detail_score ?? 0) >= 8).length,
    mid:     activeMatches.filter((m) => { const s = m.detail_score ?? 0; return s >= 6 && s < 8 }).length,
    low:     activeMatches.filter((m) => (m.detail_score ?? 0) < 6).length,
    applied: appliedMatches.length,
    ignored: ignoredMatches.length,
  }

  const activeFilter = (['high', 'mid', 'low', 'applied', 'ignored'].includes(searchParams.filter ?? '')
    ? searchParams.filter
    : 'all') as 'all' | 'high' | 'mid' | 'low' | 'applied' | 'ignored'

  const visibleMatches =
    activeFilter === 'high'    ? activeMatches.filter((m) => (m.detail_score ?? 0) >= 8)
    : activeFilter === 'mid'   ? activeMatches.filter((m) => { const s = m.detail_score ?? 0; return s >= 6 && s < 8 })
    : activeFilter === 'low'   ? activeMatches.filter((m) => (m.detail_score ?? 0) < 6)
    : activeFilter === 'applied' ? appliedMatches
    : activeFilter === 'ignored' ? ignoredMatches
    : activeMatches

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayCount = activeMatches.filter((m) => m.matched_at >= todayStart).length
  const avgScore = activeMatches.length > 0
    ? (activeMatches.reduce((sum, m) => sum + (m.detail_score ?? 0), 0) / activeMatches.length).toFixed(1)
    : '—'
  const cutoff24h = new Date(now.getTime() - 86_400_000).toISOString()
  const today = now.toLocaleDateString('lt-LT', { weekday: 'long', day: 'numeric', month: 'long' })

  // Prefs data
  const prefName = user.email?.split('@')[0] ?? 'Vartotojas'
  const hasPlan = profile?.plan_status === 'active'

  return (
    <>
      <PostAuthRedirect />

      {/* ── Subscription CTA ─────────────────────────────────────────────── */}
      {!hasPlan && (
        <div style={{
          marginBottom: 28, padding: '18px 22px',
          background: 'var(--ink)', color: 'var(--paper)', borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160,
            background: 'radial-gradient(closest-side, color-mix(in oklab, var(--accent-2) 18%, transparent), transparent)',
            pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em',
              textTransform: 'uppercase', color: 'rgba(246,244,238,.55)', marginBottom: 8 }}>
              // planas
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-.01em', marginBottom: 6 }}>
              Aktyvuok Pro — €10/mėn.
            </div>
            <div style={{ fontSize: 14, color: 'rgba(246,244,238,.65)' }}>
              AI pradės kasdien skenuoti 5 portalus ir siųsti tik tau tinkančius darbus.
            </div>
          </div>
          <CheckoutButton />
        </div>
      )}

      {/* ── Page hero ────────────────────────────────────────────────────── */}
      <div className="db-page-hero">
        <div>
          <div className="db-prefs-kicker">Atitikimai · {today}</div>
          <h1>
            Tau šiandien tinka<br />
            <span className="ital">{activeMatches.length} darbai.</span>
          </h1>
          <p className="db-page-lede">
            AI peržiūrėjo <span className="pill">{(totalListings ?? 0).toLocaleString('lt-LT')}</span> naujų skelbimų per 5 portalus.
            Žemiau — tik tie, kurie tiesiogiai dera su tavo profiliu.
          </p>
        </div>

        <div className="db-hero-numbers">
          <div className="db-hero-cell">
            <div className="db-hero-k">Peržiūrėta</div>
            <div className="db-hero-v">{(totalListings ?? 0).toLocaleString('lt-LT')}</div>
            <div className="db-hero-sub">skelbimų · 5 portalai</div>
          </div>
          <div className="db-hero-cell">
            <div className="db-hero-k">Tinka</div>
            <div className="db-hero-v accent">{activeMatches.length}</div>
            <div className="db-hero-sub">
              {todayCount > 0 && <span className="db-hero-delta">+{todayCount} šiandien</span>}
            </div>
          </div>
          <div className="db-hero-cell">
            <div className="db-hero-k">Vid. balas</div>
            <div className="db-hero-v">{avgScore}</div>
            <div className="db-hero-sub">iš 10</div>
          </div>
        </div>
      </div>

      {/* ── Prefs bar ────────────────────────────────────────────────────── */}
      <div className="db-prefs">
        <div style={{ minWidth: 120 }}>
          <div className="db-prefs-kicker">// profilis</div>
          <div className="db-prefs-name">{prefName}</div>
        </div>
        <div className="db-prefs-tags">
          {preferences?.desired_position && (
            <span className="db-prefs-tag"><span className="k">rolė</span>{preferences.desired_position}</span>
          )}
          {preferences?.preferred_cities && preferences.preferred_cities.length > 0 && (
            <span className="db-prefs-tag">
              <span className="k">miestas</span>
              {preferences.preferred_cities.slice(0, 2).join(' · ')}
            </span>
          )}
          {preferences?.preferred_salary_min && (
            <span className="db-prefs-tag">
              <span className="k">atl.</span>nuo {preferences.preferred_salary_min} €
            </span>
          )}
          {!preferences && (
            <span className="db-prefs-tag" style={{ color: 'var(--ink-4)' }}>
              Nustatymai nepateikti
            </span>
          )}
        </div>
        <Link href="/dashboard/preferences" className="db-edit">
          Redaguoti ↗
        </Link>
      </div>

      {/* ── Matches ──────────────────────────────────────────────────────── */}
      {allMatches.length === 0 ? (
        <div className="db-empty">
          <p style={{ fontSize: 48, marginBottom: 16 }}>🔍</p>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-.01em', marginBottom: 10 }}>
            Dar nėra atitikimų
          </p>
          <p style={{ fontSize: 14, maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Užpildykite nustatymus ir aktyvuokite Pro planą. AI kasdien skenuos 5 lietuviškus darbo
            portalus ir čia pamatysite geriausius pasiūlymus.
          </p>
          <Link href="/dashboard/preferences" className="db-edit" style={{ display: 'inline-flex' }}>
            Nustatyti paiešką ↗
          </Link>
        </div>
      ) : (
        <>
          <FilterBar counts={counts} active={activeFilter} />

          {visibleMatches.length === 0 ? (
            <div className="db-empty">
              <p style={{ fontSize: 32, marginBottom: 10 }}>🎯</p>
              <p>Nėra atitikimų šiame filtro intervale.</p>
            </div>
          ) : (
            <div className="db-matches">
              {visibleMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  dateLabel={relativeDate(match.matched_at)}
                  isRecent={match.matched_at >= cutoff24h}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Today log ────────────────────────────────────────────────────── */}
      <div className="db-log">
        <div>
          <div className="db-log-kicker">// scan log</div>
          <div className="db-log-title">
            Ką mes šiandien <span className="acc">žiūrėjom.</span>
          </div>
          <div className="db-log-note">
            Live log&rsquo;as to, ką AI peržiūri tavo vardu. Matai net atmestus skelbimus — jokių paslapčių.
          </div>
        </div>
        <ul className="db-log-list">
          {LOG_ROWS.map((r, i) => (
            <li key={i} className={`db-log-row${r.hit ? ' hit' : ''}`}>
              <span>{r.t}</span>
              <span className={`tag${r.hit ? '' : ' skip'}`}>
                {r.hit ? `[${r.score}/10]` : '[skip]'}
              </span>
              <span className="msg">{r.src} — {r.msg}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
