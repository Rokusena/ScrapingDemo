import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { MatchWithListing, Profile, JobPreferences } from '@/types/database'
import { ExternalLink, Settings, Zap, AlertCircle } from 'lucide-react'
import CheckoutButton from './CheckoutButton'

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? 'bg-green-950/60 text-green-400 border-green-800/60' :
    score >= 6 ? 'bg-yellow-950/60 text-yellow-400 border-yellow-800/60' :
                 'bg-red-950/60 text-red-400 border-red-800/60'
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-sm font-bold ${color}`}>
      {score}/10
    </span>
  )
}

function MatchCard({ match }: { match: MatchWithListing }) {
  const listing = match.raw_listings

  return (
    <div className="p-6 bg-gray-900 border border-gray-800 rounded-2xl hover:border-gray-700 transition-colors flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-base truncate">{listing?.title ?? 'Nežinoma pozicija'}</h3>
          <p className="text-gray-400 text-sm mt-0.5">{listing?.company ?? 'Nežinoma įmonė'}</p>
        </div>
        <ScoreBadge score={match.detail_score!} />
      </div>

      <div className="flex flex-wrap gap-2">
        {listing?.location && (
          <span className="px-2.5 py-1 bg-gray-800 rounded-lg text-gray-400 text-xs">
            📍 {listing.location}
          </span>
        )}
        {listing?.salary_raw && (
          <span className="px-2.5 py-1 bg-gray-800 rounded-lg text-gray-400 text-xs">
            💶 {listing.salary_raw}
          </span>
        )}
      </div>

      {match.reason && (
        <p className="text-gray-400 text-sm leading-relaxed line-clamp-3">{match.reason}</p>
      )}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800">
        <span className="text-gray-600 text-xs">
          {new Date(match.matched_at).toLocaleDateString('lt-LT')}
        </span>
        {listing?.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-700/40 text-indigo-300 text-sm rounded-lg transition"
          >
            Žiūrėti skelbimą
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

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
    <div className="space-y-8">
      {/* Success banner */}
      {searchParams.success && (
        <div className="flex items-center gap-3 p-4 bg-green-950/40 border border-green-800/60 rounded-xl text-green-300 text-sm">
          <Zap className="w-4 h-4 flex-shrink-0" />
          Prenumerata aktyvuota! Dabar AI ras geriausius darbus jums.
        </div>
      )}

      {/* Subscription CTA */}
      {profile?.plan_status !== 'active' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-indigo-950/40 border border-indigo-800/50 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Nemokamas planas</p>
              <p className="text-gray-400 text-sm">
                Aktyvuokite Pro planą (€10/mėn.), kad AI pradėtų ieškoti darbo jums.
              </p>
            </div>
          </div>
          <CheckoutButton />
        </div>
      )}

      {/* Preferences summary */}
      <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-sm mb-1">Jūsų paieškos nustatymai</p>
          {preferences ? (
            <p className="text-gray-400 text-sm">
              {preferences.desired_position && (
                <span className="mr-3">🎯 {preferences.desired_position}</span>
              )}
              {preferences.preferred_salary_min && (
                <span className="mr-3">💶 nuo {preferences.preferred_salary_min} €</span>
              )}
              {preferences.preferred_cities && preferences.preferred_cities.length > 0 && (
                <span>📍 {preferences.preferred_cities.join(', ')}</span>
              )}
            </p>
          ) : (
            <p className="text-gray-500 text-sm">
              Nustatymai nepateikti — pridėkite, kad AI galėtų ieškoti.
            </p>
          )}
        </div>
        <Link
          href="/dashboard/preferences"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition flex-shrink-0"
        >
          <Settings className="w-4 h-4" />
          Redaguoti
        </Link>
      </div>

      {/* Matches */}
      <div>
        <h2 className="font-bold text-lg mb-5">
          Atitikimai{' '}
          {typedMatches.length > 0 && (
            <span className="text-gray-500 font-normal text-base">({typedMatches.length})</span>
          )}
        </h2>

        {typedMatches.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-gray-800 rounded-2xl">
            <p className="text-4xl mb-4">🔍</p>
            <p className="font-semibold mb-1">Dar nėra atitikimų</p>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Užpildykite nustatymus ir aktyvuokite Pro planą. AI kasdien skenuos CVBankas.lt ir
              čia pamatysite geriausius pasiūlymus.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {typedMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
