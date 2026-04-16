import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Match, ScraperRun } from '@/types/database'
import { TrendingUp, Target, Layers, Clock } from 'lucide-react'

export default async function StatsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString()

  const [
    { data: allMatches },
    { data: todayMatches },
    { data: weekMatches },
    { data: scraperRuns },
  ] = await Promise.all([
    supabase
      .from('matches')
      .select('detail_score, matched_at')
      .eq('user_id', user.id)
      .not('detail_score', 'is', null),
    supabase
      .from('matches')
      .select('id')
      .eq('user_id', user.id)
      .gte('matched_at', todayStart),
    supabase
      .from('matches')
      .select('detail_score, matched_at')
      .eq('user_id', user.id)
      .gte('matched_at', weekStart)
      .not('detail_score', 'is', null),
    supabase
      .from('scraper_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10),
  ])

  const typed = (allMatches ?? []) as Pick<Match, 'detail_score' | 'matched_at'>[]
  const typedWeek = (weekMatches ?? []) as Pick<Match, 'detail_score' | 'matched_at'>[]
  const typedRuns = (scraperRuns ?? []) as ScraperRun[]

  const avgAll =
    typed.length > 0
      ? (typed.reduce((s, m) => s + (m.detail_score ?? 0), 0) / typed.length).toFixed(1)
      : '—'

  const highCount = typed.filter((m) => (m.detail_score ?? 0) >= 8).length
  const midCount = typed.filter((m) => { const s = m.detail_score ?? 0; return s >= 6 && s < 8 }).length
  const lowCount = typed.filter((m) => (m.detail_score ?? 0) < 6).length

  const totalScanned = typedRuns.reduce((s, r) => s + (r.jobs_found ?? 0), 0)
  const lastRun = typedRuns[0]

  const STAT_CARDS = [
    {
      icon: <Target className="w-5 h-5 text-[#4F6EF7]" />,
      label: 'Viso atitikimų',
      value: typed.length,
      sub: `+${todayMatches?.length ?? 0} šiandien`,
      subColor: 'text-[#43e97b]',
    },
    {
      icon: <TrendingUp className="w-5 h-5 text-[#43e97b]" />,
      label: 'Vidutinis balas',
      value: avgAll,
      sub: `${typedWeek.length} per savaitę`,
      subColor: 'text-[#8892b0]',
    },
    {
      icon: <Layers className="w-5 h-5 text-[#f7b731]" />,
      label: 'Nuskanuota skelbimai',
      value: totalScanned,
      sub: 'visų paleidimų suma',
      subColor: 'text-[#8892b0]',
    },
    {
      icon: <Clock className="w-5 h-5 text-[#8892b0]" />,
      label: 'Paskutinis skenavimas',
      value: lastRun
        ? new Date(lastRun.started_at).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })
        : '—',
      sub: lastRun
        ? new Date(lastRun.started_at).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
        : 'nėra duomenų',
      subColor: 'text-[#8892b0]',
    },
  ]

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Statistika</h1>
        <p className="text-[#8892b0] text-sm mt-0.5">Jūsų paieškos apžvalga</p>
      </div>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((s) => (
          <div key={s.label} className="p-5 bg-[#141c33] border border-white/8 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              {s.icon}
              <p className="text-xs text-[#8892b0] font-medium">{s.label}</p>
            </div>
            <p className="text-3xl font-extrabold text-white mb-1">{s.value}</p>
            <p className={`text-xs ${s.subColor}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Score distribution */}
      {typed.length > 0 && (
        <div className="p-6 bg-[#141c33] border border-white/8 rounded-2xl">
          <h2 className="font-bold text-base mb-5">Balų pasiskirstymas</h2>
          <div className="space-y-4">
            {[
              { label: '8–10 Puikiai', count: highCount, color: '#43e97b', max: typed.length },
              { label: '6–7 Gerai',    count: midCount,  color: '#f7b731', max: typed.length },
              { label: '< 6 Vidutiniškai', count: lowCount, color: '#f87171', max: typed.length },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-[#8892b0]">{row.label}</span>
                  <span className="font-semibold" style={{ color: row.color }}>{row.count}</span>
                </div>
                <div className="h-2 bg-white/6 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${row.max > 0 ? (row.count / row.max) * 100 : 0}%`,
                      background: row.color,
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent scraper runs */}
      {typedRuns.length > 0 && (
        <div className="p-6 bg-[#141c33] border border-white/8 rounded-2xl">
          <h2 className="font-bold text-base mb-5">Paskutiniai skenavimų paleidimmai</h2>
          <div className="space-y-2">
            {typedRuns.slice(0, 5).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${run.error ? 'bg-red-400' : 'bg-[#43e97b]'}`}
                  />
                  <span className="text-white font-medium capitalize">{run.source}</span>
                  <span className="text-[#8892b0] text-xs">
                    {new Date(run.started_at).toLocaleString('lt-LT', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-[#8892b0]">
                  <span>{run.jobs_found} rasta</span>
                  <span className="text-[#4F6EF7]">{run.jobs_inserted} nauja</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {typed.length === 0 && (
        <div className="py-16 text-center border border-dashed border-white/8 rounded-2xl">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-[#8892b0] text-sm">Statistika atsiras, kai bus pirmų atitikimų.</p>
        </div>
      )}
    </div>
  )
}
