import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { MatchWithListing, Profile, JobPreferences } from '@/types/database'
import { Settings, Zap, AlertCircle, SlidersHorizontal, TrendingUp } from 'lucide-react'
import CheckoutButton from './CheckoutButton'
import ClearMatchesButton from './ClearMatchesButton'
import PostAuthRedirect from './PostAuthRedirect'
import MatchCard from './MatchCard'
import FilterBar from './FilterBar'

// ── Relative date helper ────────────────────────────────────────────────────

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

  const [{ data: profile }, { data: preferences }, { data: matches }] = await Promise.all([
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
  ])

  const allMatches = (matches ?? []) as MatchWithListing[]

  // Filter counts
  const counts = {
    all: allMatches.length,
    high: allMatches.filter((m) => (m.detail_score ?? 0) >= 8).length,
    mid: allMatches.filter((m) => { const s = m.detail_score ?? 0; return s >= 6 && s < 8 }).length,
    low: allMatches.filter((m) => (m.detail_score ?? 0) < 6).length,
  }

  const activeFilter = (['high', 'mid', 'low'].includes(searchParams.filter ?? '')
    ? searchParams.filter
    : 'all') as 'all' | 'high' | 'mid' | 'low'

  const visibleMatches =
    activeFilter === 'high'
      ? allMatches.filter((m) => (m.detail_score ?? 0) >= 8)
      : activeFilter === 'mid'
      ? allMatches.filter((m) => { const s = m.detail_score ?? 0; return s >= 6 && s < 8 })
      : activeFilter === 'low'
      ? allMatches.filter((m) => (m.detail_score ?? 0) < 6)
      : allMatches

  // Stats
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayCount = allMatches.filter((m) => m.matched_at >= todayStart).length
  const avgScore =
    allMatches.length > 0
      ? (allMatches.reduce((sum, m) => sum + (m.detail_score ?? 0), 0) / allMatches.length).toFixed(1)
      : null

  // isRecent: matched within the last 24 h
  const cutoff24h = new Date(now.getTime() - 86_400_000).toISOString()

  return (
    <div className="space-y-7">
      <PostAuthRedirect />

      {/* ── Success banner ──────────────────────────────────────────────── */}
      {searchParams.success && (
        <div className="flex items-center gap-3 p-4 bg-[#43e97b]/10 border border-[#43e97b]/25 rounded-xl text-[#43e97b] text-sm">
          <Zap className="w-4 h-4 shrink-0" />
          Prenumerata aktyvuota! AI jau pradėjo ieškoti darbo jums.
        </div>
      )}

      {/* ── Page title + stats mini-row ──────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Atitikimai</h1>
          <p className="text-[#8892b0] text-sm mt-0.5">
            AI įvertinti darbo skelbimai pagal jūsų profilį
          </p>
        </div>
        {allMatches.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="flex gap-4 text-sm">
              {todayCount > 0 && (
                <div className="flex items-center gap-1.5 text-[#43e97b]">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="font-semibold">+{todayCount}</span>
                  <span className="text-[#8892b0]">šiandien</span>
                </div>
              )}
              {avgScore && (
                <div className="text-[#8892b0]">
                  Vid. balas: <span className="text-white font-semibold">{avgScore}/10</span>
                </div>
              )}
            </div>
            <ClearMatchesButton />
          </div>
        )}
      </div>

      {/* ── Subscription CTA ─────────────────────────────────────────────── */}
      {profile?.plan_status !== 'active' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-[#4F6EF7]/8 border border-[#4F6EF7]/25 rounded-2xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#4F6EF7] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Nemokamas planas</p>
              <p className="text-[#8892b0] text-sm mt-0.5">
                Aktyvuokite Pro (€10/mėn.) — AI pradės kasdien ieškoti darbo jums.
              </p>
            </div>
          </div>
          <CheckoutButton />
        </div>
      )}

      {/* ── Preferences summary ──────────────────────────────────────────── */}
      <div className="p-5 bg-[#141c33] border border-white/8 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <SlidersHorizontal className="w-4 h-4 text-[#4F6EF7] mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm mb-1">Paieškos nustatymai</p>
            {preferences ? (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-[#8892b0]">
                {preferences.desired_position && <span>🎯 {preferences.desired_position}</span>}
                {preferences.preferred_salary_min && (
                  <span>💶 nuo {preferences.preferred_salary_min} €</span>
                )}
                {preferences.preferred_cities && preferences.preferred_cities.length > 0 && (
                  <span>
                    📍 {preferences.preferred_cities.slice(0, 3).join(', ')}
                    {preferences.preferred_cities.length > 3
                      ? ` +${preferences.preferred_cities.length - 3}`
                      : ''}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[#8892b0] text-sm">
                Nustatymai nepateikti — pridėkite, kad AI galėtų ieškoti.
              </p>
            )}
          </div>
        </div>
        <Link
          href="/dashboard/preferences"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white/5 hover:bg-white/8 border border-white/8 rounded-xl transition shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
          Redaguoti
        </Link>
      </div>

      {/* ── Matches ──────────────────────────────────────────────────────── */}
      {allMatches.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-white/8 rounded-2xl">
          <p className="text-5xl mb-5">🔍</p>
          <p className="font-bold text-lg mb-2">Dar nėra atitikimų</p>
          <p className="text-[#8892b0] text-sm max-w-sm mx-auto leading-relaxed">
            Užpildykite nustatymus ir aktyvuokite Pro planą. AI kasdien skenuos 5 lietuviškus darbo
            portalus ir čia pamatysite geriausius pasiūlymus.
          </p>
          <Link
            href="/dashboard/preferences"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-[#4F6EF7] hover:bg-[#6B84F8] text-white text-sm font-semibold rounded-xl transition"
          >
            <Settings className="w-4 h-4" />
            Nustatyti paiešką
          </Link>
        </div>
      ) : (
        <>
          {/* Filter bar */}
          <FilterBar counts={counts} active={activeFilter} />

          {visibleMatches.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-white/8 rounded-2xl">
              <p className="text-3xl mb-3">🎯</p>
              <p className="text-[#8892b0] text-sm">
                Nėra atitikimų šiame filtro intervale.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[#8892b0] text-sm">
                {visibleMatches.length} {activeFilter !== 'all' ? 'filtruotų ' : ''}atitikimų
                {activeFilter === 'all' && ' · Rikiuojama pagal AI įvertinimą'}
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    dateLabel={relativeDate(match.matched_at)}
                    isRecent={match.matched_at >= cutoff24h}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
