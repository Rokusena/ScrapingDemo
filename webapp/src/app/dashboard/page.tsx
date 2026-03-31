import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { MatchWithListing, Profile, JobPreferences } from '@/types/database'
import { ExternalLink, Settings, Zap, AlertCircle, SlidersHorizontal } from 'lucide-react'
import CheckoutButton from './CheckoutButton'
import ClearMatchesButton from './ClearMatchesButton'
import PostAuthRedirect from './PostAuthRedirect'

// ── Score badge ────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const { bg, text, border } =
    score >= 8
      ? { bg: 'bg-[#43e97b]/10', text: 'text-[#43e97b]', border: 'border-[#43e97b]/25' }
      : score >= 6
      ? { bg: 'bg-[#f7b731]/10', text: 'text-[#f7b731]', border: 'border-[#f7b731]/25' }
      : { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/25' }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-sm font-bold ${bg} ${text} ${border}`}
    >
      {score}<span className="text-xs font-normal opacity-70">/10</span>
    </span>
  )
}

// ── Source badge ───────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  cvbankas: 'CVBankas',
  cvonline: 'CV-Online',
  cvmarket: 'CVmarket',
  unicorns: 'Unicorns',
  uzt: 'UZT',
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] text-[#8892b0] text-xs font-medium">
      {SOURCE_LABELS[source] ?? source}
    </span>
  )
}

// ── Match card ─────────────────────────────────────────────────────────────────

function MatchCard({ match }: { match: MatchWithListing }) {
  const listing = match.raw_listings

  return (
    <div className="group p-5 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-2xl hover:border-[#4F6EF7]/30 transition-all flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-[15px] leading-snug truncate group-hover:text-[#6B84F8] transition-colors">
            {listing?.title ?? 'Nežinoma pozicija'}
          </h3>
          <p className="text-[#8892b0] text-sm mt-0.5 truncate">
            {listing?.company ?? 'Nežinoma įmonė'}
          </p>
        </div>
        <ScoreBadge score={match.detail_score!} />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {listing?.location && (
          <span className="flex items-center gap-1 px-2.5 py-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-lg text-[#8892b0] text-xs">
            📍 {listing.location}
          </span>
        )}
        {listing?.salary_raw && (
          <span className="flex items-center gap-1 px-2.5 py-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-lg text-[#8892b0] text-xs">
            💶 {listing.salary_raw}
          </span>
        )}
        {listing?.source && <SourceBadge source={listing.source} />}
      </div>

      {/* Reason */}
      {match.reason && (
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-xl px-4 py-3">
          <p className="text-[#8892b0] text-xs font-medium uppercase tracking-wide mb-1.5">
            Kodėl tinka
          </p>
          <p className="text-[#c8cfe8] text-sm leading-relaxed line-clamp-3">{match.reason}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[rgba(255,255,255,0.06)]">
        <span className="text-[#8892b0] text-xs">
          {new Date(match.matched_at).toLocaleDateString('lt-LT')}
        </span>
        {listing?.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#4F6EF7]/10 hover:bg-[#4F6EF7]/20 border border-[#4F6EF7]/25 hover:border-[#4F6EF7]/50 text-[#6B84F8] text-sm rounded-xl transition"
          >
            Žiūrėti skelbimą
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { success?: string }
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
      .limit(30),
  ])

  const typedMatches = (matches ?? []) as MatchWithListing[]

  return (
    <div className="space-y-7">
      {/* Redirects back to /onboarding if wizard was in progress when user clicked magic link */}
      <PostAuthRedirect />

      {/* ── Success banner ─────────────────────────────────────────────────── */}
      {searchParams.success && (
        <div className="flex items-center gap-3 p-4 bg-[#43e97b]/10 border border-[#43e97b]/25 rounded-xl text-[#43e97b] text-sm">
          <Zap className="w-4 h-4 shrink-0" />
          Prenumerata aktyvuota! AI jau pradėjo ieškoti darbo jums.
        </div>
      )}

      {/* ── Page title ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Atitikimai</h1>
          <p className="text-[#8892b0] text-sm mt-0.5">
            AI įvertinti darbo skelbimai pagal jūsų profilį
          </p>
        </div>
        {typedMatches.length > 0 && <ClearMatchesButton />}
      </div>

      {/* ── Subscription CTA ───────────────────────────────────────────────── */}
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

      {/* ── Preferences summary ────────────────────────────────────────────── */}
      <div className="p-5 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
                  <span>📍 {preferences.preferred_cities.slice(0, 3).join(', ')}{preferences.preferred_cities.length > 3 ? ` +${preferences.preferred_cities.length - 3}` : ''}</span>
                )}
              </div>
            ) : (
              <p className="text-[#8892b0] text-sm">Nustatymai nepateikti — pridėkite, kad AI galėtų ieškoti.</p>
            )}
          </div>
        </div>
        <Link
          href="/dashboard/preferences"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.08)] rounded-xl transition shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
          Redaguoti
        </Link>
      </div>

      {/* ── Matches grid ───────────────────────────────────────────────────── */}
      {typedMatches.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-[rgba(255,255,255,0.08)] rounded-2xl">
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
          <p className="text-[#8892b0] text-sm">
            {typedMatches.length} atitikimų · Rikiuojama pagal AI įvertinimą
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {typedMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
