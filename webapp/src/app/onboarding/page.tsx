'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, ArrowLeft, Check, Mail, MapPin, Briefcase, User } from 'lucide-react'

const LS_KEY = 'gaukdarba-onboarding'

interface WizardState {
  step: number
  name: string
  email: string
  position: string
  skills: string
  cities: string[]
  salaryMin: string
  workFormat: string
  experienceLevel: string
}

const DEFAULT_STATE: WizardState = {
  step: 1,
  name: '',
  email: '',
  position: '',
  skills: '',
  cities: [],
  salaryMin: '',
  workFormat: '',
  experienceLevel: '',
}

const CITIES = [
  'Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys',
  'Alytus', 'Marijampolė', 'Mažeikiai', 'Jonava', 'Utena',
]

const WORK_FORMATS = [
  { value: 'remote', label: 'Nuotolinis' },
  { value: 'hybrid', label: 'Hibridinis' },
  { value: 'onsite', label: 'Vietoje' },
]

const EXPERIENCE_LEVELS = [
  { value: 'intern', label: 'Be patirties / Studentas' },
  { value: 'junior', label: 'Pradedantysis (iki 2 m.)' },
  { value: 'mid', label: 'Patyręs (2–5 m.)' },
  { value: 'senior', label: 'Ekspertas (5+ m.)' },
]

function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
        selected
          ? 'bg-[#4F6EF7]/20 border-[#4F6EF7] text-[#6B84F8]'
          : 'bg-[#141c33] border-[rgba(255,255,255,0.08)] text-[#8892b0] hover:border-[rgba(255,255,255,0.2)] hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function OptionCard({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-4 py-3 rounded-xl text-sm font-medium border text-left transition-all flex items-center justify-between ${
        selected
          ? 'bg-[#4F6EF7]/15 border-[#4F6EF7] text-white'
          : 'bg-[#141c33] border-[rgba(255,255,255,0.08)] text-[#8892b0] hover:border-[rgba(255,255,255,0.2)] hover:text-white'
      }`}
    >
      {label}
      {selected && <Check className="w-4 h-4 text-[#4F6EF7]" />}
    </button>
  )
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
              current > n
                ? 'bg-[#4F6EF7] border-[#4F6EF7] text-white'
                : current === n
                ? 'border-[#4F6EF7] text-[#4F6EF7] bg-[#4F6EF7]/10'
                : 'border-[rgba(255,255,255,0.12)] text-[#8892b0]'
            }`}
          >
            {current > n ? <Check className="w-3.5 h-3.5" /> : n}
          </div>
          {n < 4 && (
            <div
              className={`w-10 h-0.5 rounded transition-all ${
                current > n ? 'bg-[#4F6EF7]' : 'bg-[rgba(255,255,255,0.08)]'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default function OnboardingPage() {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE)
  const [emailSent, setEmailSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  // On mount: restore localStorage and check existing session
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    let parsed: WizardState = DEFAULT_STATE
    if (saved) {
      try {
        parsed = { ...DEFAULT_STATE, ...JSON.parse(saved) }
      } catch {
        // ignore corrupt data
      }
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        // Already authenticated — advance past step 1
        const nextStep = parsed.step <= 1 ? 2 : parsed.step
        parsed = { ...parsed, step: nextStep, email: parsed.email || user.email || '' }
      }
      setState(parsed)
      setHydrated(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist wizard state to localStorage on every change
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(LS_KEY, JSON.stringify(state))
    }
  }, [state, hydrated])

  const update = (patch: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...patch }))

  const toggleCity = (city: string) =>
    update({
      cities: state.cities.includes(city)
        ? state.cities.filter((c) => c !== city)
        : [...state.cities, city],
    })

  // Step 1: Send magic link OTP, then redirect back to /onboarding
  const handleSendOtp = async () => {
    if (!state.email) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: state.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        data: { full_name: state.name || undefined },
      },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setEmailSent(true)
    }
  }

  // Final step: persist preferences → checkout
  const handleFinish = async () => {
    setLoading(true)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Sesija baigėsi. Grįžkite prie pirmojo žingsnio.')
      setLoading(false)
      return
    }

    // Update display name if provided
    if (state.name) {
      await supabase.from('profiles').update({ full_name: state.name }).eq('id', user.id)
    }

    // Upsert job preferences
    const { error: prefErr } = await supabase.from('job_preferences').upsert(
      {
        user_id: user.id,
        desired_position: state.position || null,
        skills: state.skills || null,
        preferred_cities: state.cities.length > 0 ? state.cities : null,
        preferred_salary_min: state.salaryMin ? parseInt(state.salaryMin, 10) : null,
        experience_level: (state.experienceLevel || null) as
          | 'intern'
          | 'junior'
          | 'mid'
          | 'senior'
          | null,
        work_format: state.workFormat || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    if (prefErr) {
      setError(prefErr.message)
      setLoading(false)
      return
    }

    // Clear wizard state
    localStorage.removeItem(LS_KEY)

    // Redirect to Stripe checkout (fall back to dashboard)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
    } catch {
      // ignore — fall through to dashboard
    }

    router.push('/dashboard')
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#080d1a] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#4F6EF7] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080d1a] text-white flex flex-col">
      {/* Top bar */}
      <div className="border-b border-[rgba(255,255,255,0.06)] bg-[#080d1a]/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-extrabold text-xl tracking-tight">
            <span className="text-[#4F6EF7]">Gauk</span>Darba
          </Link>
          <StepIndicator current={state.step} />
        </div>
      </div>

      {/* Wizard content */}
      <div className="flex-1 flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-lg">

          {/* ── Step 1: Identity ───────────────────────────────────────────── */}
          {state.step === 1 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#4F6EF7]/15 border border-[#4F6EF7]/30 flex items-center justify-center mb-5">
                  <User className="w-6 h-6 text-[#4F6EF7]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Pradėkime</h1>
                <p className="text-[#8892b0] leading-relaxed">
                  Sukurkite nemokamą paskyrą. El. pašto slaptažodžio nereikia — siųsime prisijungimo
                  nuorodą.
                </p>
              </div>

              {emailSent ? (
                <div className="p-7 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-2xl text-center">
                  <div className="w-14 h-14 bg-[#4F6EF7]/15 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-7 h-7 text-[#4F6EF7]" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">Patikrinkite el. paštą</h2>
                  <p className="text-[#8892b0] text-sm leading-relaxed">
                    Išsiuntėme prisijungimo nuorodą adresu{' '}
                    <span className="text-white font-semibold">{state.email}</span>. Spustelėkite
                    nuorodą — ji grąžins jus čia tęsti registraciją.
                  </p>
                  <button
                    onClick={() => setEmailSent(false)}
                    className="mt-6 text-sm text-[#4F6EF7] hover:text-[#6B84F8] transition"
                  >
                    Naudoti kitą el. paštą
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#8892b0] mb-1.5">
                      Vardas <span className="text-[#8892b0]/50 font-normal">(neprivaloma)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Jūsų vardas"
                      value={state.name}
                      onChange={(e) => update({ name: e.target.value })}
                      className="w-full px-4 py-3 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-[#8892b0]/40 focus:outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#8892b0] mb-1.5">
                      El. pašto adresas
                    </label>
                    <input
                      type="email"
                      placeholder="jusu@epastas.lt"
                      value={state.email}
                      onChange={(e) => update({ email: e.target.value })}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                      className="w-full px-4 py-3 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-[#8892b0]/40 focus:outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30 transition"
                    />
                  </div>

                  {error && (
                    <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
                      {error}
                    </p>
                  )}

                  <button
                    onClick={handleSendOtp}
                    disabled={loading || !state.email}
                    className="w-full py-3.5 bg-[#4F6EF7] hover:bg-[#6B84F8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-base"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Siunčiama...
                      </span>
                    ) : (
                      <>
                        Tęsti
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <p className="text-center text-sm text-[#8892b0]">
                    Jau turite paskyrą?{' '}
                    <Link href="/login" className="text-[#4F6EF7] hover:text-[#6B84F8] transition">
                      Prisijungti
                    </Link>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Job preferences ────────────────────────────────────── */}
          {state.step === 2 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#4F6EF7]/15 border border-[#4F6EF7]/30 flex items-center justify-center mb-5">
                  <Briefcase className="w-6 h-6 text-[#4F6EF7]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Darbo preferencijos</h1>
                <p className="text-[#8892b0] leading-relaxed">
                  Nurodykite ko ieškote — AI naudos šiuos duomenis kasdien skenuodamas darbo skelbimus.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-[#8892b0] mb-1.5">
                    Pageidaujama pozicija
                  </label>
                  <input
                    type="text"
                    placeholder="pvz. Frontend Programuotojas, Pardavėjas, Buhalteris"
                    value={state.position}
                    onChange={(e) => update({ position: e.target.value })}
                    autoFocus
                    className="w-full px-4 py-3 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-[#8892b0]/40 focus:outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30 transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#8892b0] mb-1.5">
                    Įgūdžiai{' '}
                    <span className="text-[#8892b0]/50 font-normal">(atskirti kableliais)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="pvz. React, TypeScript, SQL, Projektų valdymas"
                    value={state.skills}
                    onChange={(e) => update({ skills: e.target.value })}
                    className="w-full px-4 py-3 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-[#8892b0]/40 focus:outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30 transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#8892b0] mb-2.5">
                    Pageidaujami miestai
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CITIES.map((city) => (
                      <Chip
                        key={city}
                        label={city}
                        selected={state.cities.includes(city)}
                        onToggle={() => toggleCity(city)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#8892b0] mb-1.5">
                    Minimalus atlyginimas{' '}
                    <span className="text-[#8892b0]/50 font-normal">(€/mėn., bruto)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8892b0] font-medium">
                      €
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      placeholder="pvz. 2000"
                      value={state.salaryMin}
                      onChange={(e) => update({ salaryMin: e.target.value })}
                      className="w-full sm:w-52 pl-8 pr-4 py-3 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-[#8892b0]/40 focus:outline-none focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/30 transition"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => update({ step: 1 })}
                  className="px-4 py-3 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-xl text-[#8892b0] hover:text-white transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => update({ step: 3 })}
                  className="flex-1 py-3 bg-[#4F6EF7] hover:bg-[#6B84F8] text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
                >
                  Tęsti
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Work format + experience ──────────────────────────── */}
          {state.step === 3 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#4F6EF7]/15 border border-[#4F6EF7]/30 flex items-center justify-center mb-5">
                  <MapPin className="w-6 h-6 text-[#4F6EF7]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Darbo formatas</h1>
                <p className="text-[#8892b0] leading-relaxed">
                  Kaip norite dirbti ir koks jūsų patirties lygis?
                </p>
              </div>

              <div className="space-y-7">
                <div>
                  <label className="block text-sm font-medium text-[#8892b0] mb-2.5">
                    Darbo formatas
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {WORK_FORMATS.map((wf) => (
                      <Chip
                        key={wf.value}
                        label={wf.label}
                        selected={state.workFormat === wf.value}
                        onToggle={() =>
                          update({ workFormat: state.workFormat === wf.value ? '' : wf.value })
                        }
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#8892b0] mb-2.5">
                    Patirties lygis
                  </label>
                  <div className="flex flex-col gap-2">
                    {EXPERIENCE_LEVELS.map((el) => (
                      <OptionCard
                        key={el.value}
                        label={el.label}
                        selected={state.experienceLevel === el.value}
                        onClick={() =>
                          update({
                            experienceLevel:
                              state.experienceLevel === el.value ? '' : el.value,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => update({ step: 2 })}
                  className="px-4 py-3 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-xl text-[#8892b0] hover:text-white transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => update({ step: 4 })}
                  className="flex-1 py-3 bg-[#4F6EF7] hover:bg-[#6B84F8] text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
                >
                  Tęsti
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Summary + activation ──────────────────────────────── */}
          {state.step === 4 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#43e97b]/15 border border-[#43e97b]/30 flex items-center justify-center mb-5">
                  <Check className="w-6 h-6 text-[#43e97b]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Profilis paruoštas!</h1>
                <p className="text-[#8892b0] leading-relaxed">
                  Peržiūrėkite savo nustatymus ir aktyvuokite AI darbo paiešką.
                </p>
              </div>

              {/* Summary card */}
              <div className="p-5 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-2xl space-y-3 mb-5">
                {[
                  state.name && { label: 'Vardas', value: state.name },
                  { label: 'El. paštas', value: state.email },
                  state.position && { label: 'Pozicija', value: state.position },
                  state.skills && { label: 'Įgūdžiai', value: state.skills },
                  state.cities.length > 0 && {
                    label: 'Miestai',
                    value: state.cities.join(', '),
                  },
                  state.salaryMin && {
                    label: 'Min. atlyginimas',
                    value: `€${state.salaryMin}/mėn.`,
                  },
                  state.workFormat && {
                    label: 'Darbo formatas',
                    value: WORK_FORMATS.find((wf) => wf.value === state.workFormat)?.label,
                  },
                  state.experienceLevel && {
                    label: 'Patirtis',
                    value: EXPERIENCE_LEVELS.find((el) => el.value === state.experienceLevel)
                      ?.label,
                  },
                ]
                  .filter(Boolean)
                  .map((row) => {
                    const r = row as { label: string; value: string | undefined }
                    return (
                      <div key={r.label} className="flex justify-between text-sm gap-4">
                        <span className="text-[#8892b0] shrink-0">{r.label}</span>
                        <span className="text-white font-medium text-right">{r.value}</span>
                      </div>
                    )
                  })}
              </div>

              {/* What they get */}
              <div className="p-4 bg-[#4F6EF7]/8 border border-[#4F6EF7]/20 rounded-xl mb-5 space-y-2">
                {[
                  '🔍 AI kasdien skaituoja 5 lietuviškus darbo portalus',
                  '🎯 Gaunate tik labiausiai tinkančius pasiūlymus (įvertinti 1–10)',
                  '📧 El. pašto pranešimas, kai atsiranda naujų atitikimų',
                ].map((item) => (
                  <p key={item} className="text-sm text-[#8892b0]">
                    {item}
                  </p>
                ))}
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3 mb-4">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => update({ step: 3 })}
                  className="px-4 py-3 bg-[#141c33] border border-[rgba(255,255,255,0.08)] rounded-xl text-[#8892b0] hover:text-white transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleFinish}
                  disabled={loading}
                  className="flex-1 py-3.5 bg-[#4F6EF7] hover:bg-[#6B84F8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 text-base"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Kraunama...
                    </span>
                  ) : (
                    <>
                      Aktyvuoti Pro · €10/mėn.
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
              <p className="text-center text-xs text-[#8892b0] mt-4">
                Saugi Stripe apmokėjimas · Atšaukti galima bet kada
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
