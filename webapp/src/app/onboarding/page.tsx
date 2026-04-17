'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Mail,
  MapPin,
  Briefcase,
  Upload,
  FileText,
  Zap,
  Clock,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'

const LS_KEY = 'gaukdarba-onboarding-v2'

interface WizardState {
  step: number
  // Step 1 — auth
  email: string
  otpSent: boolean
  // Step 2 — pain questions
  searchDuration: string
  hoursPerWeek: string
  biggestFrustration: string
  // Step 3 — CV (not persisted to LS — File can't be serialized)
  cvExtracted: boolean
  // Step 4 — job preferences
  position: string
  skills: string
  cities: string[]
  salaryMin: string
  // Step 5 — format + experience + extra
  workFormat: string
  experienceLevel: string
  employedNow: string
  workLanguage: string
}

const DEFAULT_STATE: WizardState = {
  step: 1,
  email: '',
  otpSent: false,
  searchDuration: '',
  hoursPerWeek: '',
  biggestFrustration: '',
  cvExtracted: false,
  position: '',
  skills: '',
  cities: [],
  salaryMin: '',
  workFormat: '',
  experienceLevel: '',
  employedNow: '',
  workLanguage: '',
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

const SEARCH_DURATION_OPTIONS = [
  { value: 'just-started', label: 'Ką tik pradėjau' },
  { value: '1-3-months', label: '1–3 mėnesiai' },
  { value: '3-6-months', label: '3–6 mėnesiai' },
  { value: '6-plus-months', label: '6+ mėnesiai' },
]

const HOURS_PER_WEEK_OPTIONS = [
  { value: 'less-1', label: 'Mažiau nei 1h' },
  { value: '1-3', label: '1–3 val.' },
  { value: '3-5', label: '3–5 val.' },
  { value: '5-plus', label: '5+ val.' },
]

const FRUSTRATION_OPTIONS = [
  { value: 'irrelevant', label: 'Per daug nesusijusių skelbimų' },
  { value: 'manual-forms', label: 'Rankinai pildau tuos pačius laukus' },
  { value: 'missing-offers', label: 'Praleidu gerų pasiūlymų' },
  { value: 'qualify', label: 'Nežinau ar tinkamas kandidatas' },
]

const WORK_LANGUAGE_OPTIONS = [
  { value: 'lt', label: 'Lietuvių' },
  { value: 'en', label: 'Anglų' },
  { value: 'both', label: 'Abiem' },
]

const EMPLOYED_NOW_OPTIONS = [
  { value: 'yes', label: 'Taip, dirbu dabar' },
  { value: 'no', label: 'Ne, aktyviai ieškau' },
]

const TOTAL_STEPS = 6

// ── Sub-components ────────────────────────────────────────────────────────────

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
          ? 'bg-[#7C6EF7]/20 border-[#7C6EF7] text-[#b8adff]'
          : 'bg-white/3 border-white/8 text-white/45 hover:border-white/20 hover:text-white'
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
  icon,
}: {
  label: string
  selected: boolean
  onClick: () => void
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-4 py-3.5 rounded-xl text-sm font-medium border text-left transition-all flex items-center justify-between gap-3 ${
        selected
          ? 'bg-[#7C6EF7]/15 border-[#7C6EF7] text-white'
          : 'bg-white/3 border-white/8 text-white/50 hover:border-white/20 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon && <span className={selected ? 'text-[#b8adff]' : 'text-white/30'}>{icon}</span>}
        {label}
      </div>
      {selected && (
        <div className="w-5 h-5 rounded-full bg-[#7C6EF7] flex items-center justify-center shrink-0">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  )
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const n = i + 1
        const done = current > n
        const active = current === n
        return (
          <div key={n} className="flex items-center gap-1.5">
            <div
              className={`flex items-center justify-center text-xs font-bold transition-all rounded-full ${
                done
                  ? 'w-6 h-6 bg-[#7C6EF7] text-white'
                  : active
                  ? 'w-6 h-6 border-2 border-[#7C6EF7] text-[#7C6EF7] bg-[#7C6EF7]/10'
                  : 'w-5 h-5 bg-white/8 text-white/30'
              }`}
            >
              {done ? <Check className="w-3 h-3" /> : active ? n : ''}
            </div>
            {n < TOTAL_STEPS && (
              <div
                className={`h-0.5 rounded transition-all ${
                  current > n ? 'bg-[#7C6EF7] w-6' : 'bg-white/8 w-4'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// OTP input — 6 boxes
function OtpInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null, null, null])
  const digits = value.padEnd(6, '').slice(0, 6).split('')

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const next = value.slice(0, i) + value.slice(i + 1)
      onChange(next)
      if (i > 0) inputRefs.current[i - 1]?.focus()
    }
  }

  const handleChange = (i: number, v: string) => {
    const ch = v.replace(/\D/g, '').slice(-1)
    if (!ch) return
    const arr = value.padEnd(6, '').split('')
    arr[i] = ch
    const next = arr.join('').slice(0, 6)
    onChange(next)
    if (i < 5) inputRefs.current[i + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    onChange(pasted)
    const focusIdx = Math.min(pasted.length, 5)
    inputRefs.current[focusIdx]?.focus()
  }

  return (
    <div className="flex gap-3 justify-center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          className={`w-11 h-14 text-center text-xl font-bold rounded-xl border transition-all bg-white/4 text-white focus:outline-none ${
            d
              ? 'border-[#7C6EF7] bg-[#7C6EF7]/10 text-white'
              : 'border-white/12 focus:border-[#7C6EF7] focus:bg-[#7C6EF7]/5'
          }`}
        />
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE)
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvLoading, setCvLoading] = useState(false)
  const [cvError, setCvError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  // Restore localStorage + check existing session
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    let parsed: WizardState = DEFAULT_STATE
    if (saved) {
      try {
        parsed = { ...DEFAULT_STATE, ...JSON.parse(saved) }
      } catch {
        // ignore
      }
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const nextStep = parsed.step <= 1 ? 2 : parsed.step
        parsed = { ...parsed, step: nextStep, email: parsed.email || user.email || '' }
      }
      setState(parsed)
      setHydrated(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist wizard to localStorage
  useEffect(() => {
    if (hydrated) localStorage.setItem(LS_KEY, JSON.stringify(state))
  }, [state, hydrated])

  const update = (patch: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...patch }))

  const toggleCity = (city: string) =>
    update({
      cities: state.cities.includes(city)
        ? state.cities.filter((c) => c !== city)
        : [...state.cities, city],
    })

  // ── Step 1: send magic link ────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!state.email) return
    setLoading(true)
    setError(null)
    // After clicking the magic link the auth/callback redirects to /dashboard,
    // which reads this key and immediately bounces back to /onboarding.
    localStorage.setItem('gaukdarba-post-auth', '/onboarding')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: state.email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        localStorage.removeItem('gaukdarba-post-auth')
        setError(error.message)
      } else {
        update({ otpSent: true })
      }
    } catch (e) {
      localStorage.removeItem('gaukdarba-post-auth')
      setError(e instanceof Error ? e.message : 'Nepavyko išsiųsti nuorodos. Bandykite dar kartą.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: CV upload ──────────────────────────────────────────────────────
  const handleCvUpload = async (file: File) => {
    setCvFile(file)
    setCvLoading(true)
    setCvError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/cv-extract', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok || data.error) {
        setCvError(data.error || 'Nepavyko nuskaityti CV.')
        setCvLoading(false)
        return
      }

      const ext = data.extracted
      // Pre-fill step 4 + 5 fields from CV
      update({
        position: ext.desired_position || state.position,
        skills: ext.skills || state.skills,
        cities:
          ext.preferred_cities?.filter((c: string) => CITIES.includes(c)) ||
          state.cities,
        experienceLevel: ext.experience_level || state.experienceLevel,
        workFormat: ext.work_format || state.workFormat,
        cvExtracted: true,
        step: 4,
      })
    } catch (e) {
      setCvError(e instanceof Error ? e.message : 'Klaida įkeliant CV.')
    } finally {
      setCvLoading(false)
    }
  }

  // ── Final step: save preferences → checkout ───────────────────────────────
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

    localStorage.removeItem(LS_KEY)

    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
    } catch {
      // fall through
    }

    router.push('/dashboard')
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#7C6EF7] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white flex flex-col" style={{ background: '#0d0d0d' }}>
      {/* Top bar */}
      <div className="border-b border-white/5 bg-[#0d0d0d]/90 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-extrabold text-xl tracking-tight">
            <span className="text-[#7C6EF7]">Gauk</span>Darba
          </Link>
          <StepIndicator current={state.step} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/5 sticky top-[57px] z-10">
        <div
          className="h-full bg-gradient-to-r from-[#7C6EF7] to-[#a855f7] transition-all duration-500"
          style={{ width: `${((state.step - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
        />
      </div>

      {/* Wizard content */}
      <div className="relative flex-1 flex items-start justify-center px-6 py-12">
        <div className="w-full max-w-lg">

          {/* ── Step 1: Email + OTP ─────────────────────────────────────────── */}
          {state.step === 1 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#7C6EF7]/15 border border-[#7C6EF7]/25 flex items-center justify-center mb-5">
                  <Mail className="w-6 h-6 text-[#7C6EF7]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">
                  {state.otpSent ? 'Patikrinkite el. paštą' : 'Pradėkime'}
                </h1>
                <p className="text-white/45 leading-relaxed">
                  {state.otpSent
                    ? `Išsiuntėme prisijungimo nuorodą adresu ${state.email}. Spustelėkite ją — ji grąžins jus čia.`
                    : 'Įveskite el. paštą — išsiųsime prisijungimo nuorodą.'}
                </p>
              </div>

              {!state.otpSent ? (
                // Email entry
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/45 mb-1.5">
                      El. pašto adresas
                    </label>
                    <input
                      type="email"
                      placeholder="jusu@epastas.lt"
                      value={state.email}
                      onChange={(e) => update({ email: e.target.value })}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                      className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#7C6EF7] focus:ring-1 focus:ring-[#7C6EF7]/30 transition"
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 text-red-400 text-sm bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleSendOtp}
                    disabled={loading || !state.email}
                    className="w-full py-3.5 bg-[#7C6EF7] hover:bg-[#9D8EFF] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 text-base"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Siunčiama...
                      </span>
                    ) : (
                      <>Gauti kodą <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>

                  <p className="text-center text-sm text-white/35">
                    Jau turite paskyrą?{' '}
                    <Link href="/login" className="text-[#7C6EF7] hover:text-[#9D8EFF] transition">
                      Prisijungti
                    </Link>
                  </p>
                </div>
              ) : (
                // Magic link sent — waiting
                <div className="space-y-5">
                  <div className="p-6 bg-white/3 border border-white/8 rounded-2xl text-center">
                    <div className="w-14 h-14 bg-[#7C6EF7]/15 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Mail className="w-7 h-7 text-[#7C6EF7]" />
                    </div>
                    <p className="font-semibold mb-1">Nuoroda išsiųsta!</p>
                    <p className="text-white/40 text-sm leading-relaxed">
                      Spustelėkite nuorodą el. laiške — ji automatiškai
                      grąžins jus čia tęsti registraciją.
                    </p>
                  </div>

                  <div className="text-center space-y-2">
                    <button
                      onClick={() => { update({ otpSent: false }); setError(null) }}
                      className="text-sm text-white/35 hover:text-white transition"
                    >
                      ← Naudoti kitą el. paštą
                    </button>
                    <br />
                    <button
                      onClick={handleSendOtp}
                      disabled={loading}
                      className="text-sm text-[#7C6EF7] hover:text-[#9D8EFF] transition disabled:opacity-40"
                    >
                      Siųsti nuorodą iš naujo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Pain / urgency questions ───────────────────────────── */}
          {state.step === 2 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#7C6EF7]/15 border border-[#7C6EF7]/25 flex items-center justify-center mb-5">
                  <Zap className="w-6 h-6 text-[#7C6EF7]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Šiek tiek apie jus</h1>
                <p className="text-white/45 leading-relaxed">
                  Padėsite mums geriau pritaikyti AI paiešką prie jūsų situacijos.
                </p>
              </div>

              <div className="space-y-7">
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-3">
                    Kiek laiko ieškote darbo?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SEARCH_DURATION_OPTIONS.map((o) => (
                      <OptionCard
                        key={o.value}
                        label={o.label}
                        selected={state.searchDuration === o.value}
                        onClick={() => update({ searchDuration: state.searchDuration === o.value ? '' : o.value })}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-3">
                    Kiek valandų per savaitę skiriate darbo paieškai?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {HOURS_PER_WEEK_OPTIONS.map((o) => (
                      <OptionCard
                        key={o.value}
                        label={o.label}
                        selected={state.hoursPerWeek === o.value}
                        onClick={() => update({ hoursPerWeek: state.hoursPerWeek === o.value ? '' : o.value })}
                        icon={<Clock className="w-4 h-4" />}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-3">
                    Kas labiausiai erzina ieškant darbo?
                  </label>
                  <div className="flex flex-col gap-2">
                    {FRUSTRATION_OPTIONS.map((o) => (
                      <OptionCard
                        key={o.value}
                        label={o.label}
                        selected={state.biggestFrustration === o.value}
                        onClick={() => update({ biggestFrustration: state.biggestFrustration === o.value ? '' : o.value })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => update({ step: 1, otpSent: false })}
                  className="px-4 py-3 bg-white/4 border border-white/8 rounded-xl text-white/45 hover:text-white transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => update({ step: 3 })}
                  className="flex-1 py-3 bg-[#7C6EF7] hover:bg-[#9D8EFF] text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
                >
                  Tęsti <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <p className="text-center text-xs text-white/25 mt-3">Galite praleisti ir pildyti vėliau</p>
            </div>
          )}

          {/* ── Step 3: CV upload ───────────────────────────────────────────── */}
          {state.step === 3 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#7C6EF7]/15 border border-[#7C6EF7]/25 flex items-center justify-center mb-5">
                  <Upload className="w-6 h-6 text-[#7C6EF7]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Įkelkite CV</h1>
                <p className="text-white/45 leading-relaxed">
                  AI automatiškai nuskaitys jūsų CV ir užpildys darbo pageidavimus. Sutaupysite 5 minutes.
                </p>
              </div>

              {cvLoading ? (
                // Loading animation
                <div className="p-10 bg-white/3 border border-white/8 rounded-2xl text-center">
                  <div className="relative w-16 h-16 mx-auto mb-6">
                    <div className="absolute inset-0 rounded-full border-2 border-[#7C6EF7]/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-[#7C6EF7] border-t-transparent animate-spin" />
                    <div className="absolute inset-3 rounded-full bg-[#7C6EF7]/15 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-[#7C6EF7]" />
                    </div>
                  </div>
                  <p className="font-semibold text-white mb-1">AI nuskaito jūsų CV...</p>
                  <p className="text-white/40 text-sm">
                    Analizuojame jūsų patirtį ir įgūdžius
                  </p>
                  {cvFile && (
                    <div className="mt-5 flex items-center justify-center gap-2 text-xs text-white/30">
                      <FileText className="w-3.5 h-3.5" />
                      {cvFile.name}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const f = e.dataTransfer.files[0]
                      if (f) handleCvUpload(f)
                    }}
                    className="cursor-pointer p-10 bg-white/2 border-2 border-dashed border-white/12 hover:border-[#7C6EF7]/50 hover:bg-[#7C6EF7]/4 rounded-2xl text-center transition-all group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-[#7C6EF7]/10 border border-[#7C6EF7]/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-[#7C6EF7]/15 transition">
                      <Upload className="w-6 h-6 text-[#7C6EF7]" />
                    </div>
                    <p className="font-semibold text-white mb-1">Spustelėkite arba nutempkite CV</p>
                    <p className="text-white/35 text-sm">PDF failas · maks. 10 MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleCvUpload(f)
                      }}
                    />
                  </div>

                  {cvError && (
                    <div className="flex items-start gap-2.5 text-red-400 text-sm bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 mt-4">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      {cvError}
                    </div>
                  )}

                  {/* Info badges */}
                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    {['Automatiškai užpildo laukus', 'Privatūs duomenys', 'Veikia per 15 sek.'].map((b) => (
                      <span key={b} className="text-xs text-white/35 bg-white/4 border border-white/6 px-3 py-1.5 rounded-full">
                        {b}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {!cvLoading && (
                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => update({ step: 2 })}
                    className="px-4 py-3 bg-white/4 border border-white/8 rounded-xl text-white/45 hover:text-white transition"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => update({ step: 4 })}
                    className="flex-1 py-3 bg-white/6 hover:bg-white/10 text-white/60 hover:text-white font-medium rounded-xl transition flex items-center justify-center gap-2 border border-white/8"
                  >
                    Praleisti CV įkėlimą
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Job preferences ─────────────────────────────────────── */}
          {state.step === 4 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#7C6EF7]/15 border border-[#7C6EF7]/25 flex items-center justify-center mb-5">
                  <Briefcase className="w-6 h-6 text-[#7C6EF7]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Darbo preferencijos</h1>
                <p className="text-white/45 leading-relaxed">
                  {state.cvExtracted
                    ? 'AI nuskaitė jūsų CV — patikrinkite ir pataisykite, jei reikia.'
                    : 'Nurodykite ko ieškote — AI naudos šiuos duomenis kasdien skenuodamas darbo skelbimus.'}
                </p>
                {state.cvExtracted && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-[#43e97b] bg-[#43e97b]/10 border border-[#43e97b]/20 rounded-xl px-3 py-2 w-fit">
                    <Check className="w-3.5 h-3.5" />
                    Užpildyta iš CV
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white/45 mb-1.5">
                    Pageidaujama pozicija
                  </label>
                  <input
                    type="text"
                    placeholder="pvz. Frontend Programuotojas, Pardavėjas, Buhalteris"
                    value={state.position}
                    onChange={(e) => update({ position: e.target.value })}
                    autoFocus
                    className="w-full px-4 py-3.5 bg-white/4 border border-white/8 rounded-xl text-white placeholder-white/25 focus:outline-none focus:border-[#7C6EF7] focus:ring-1 focus:ring-[#7C6EF7]/30 transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/45 mb-1.5">
                    Įgūdžiai{' '}
                    <span className="text-white/25 font-normal">(atskirti kableliais)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="pvz. React, TypeScript, SQL, Projektų valdymas"
                    value={state.skills}
                    onChange={(e) => update({ skills: e.target.value })}
                    className="w-full px-4 py-3.5 bg-white/4 border border-white/8 rounded-xl text-white placeholder-white/25 focus:outline-none focus:border-[#7C6EF7] focus:ring-1 focus:ring-[#7C6EF7]/30 transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/45 mb-2.5">
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
                  <label className="block text-sm font-medium text-white/45 mb-1.5">
                    Minimalus atlyginimas{' '}
                    <span className="text-white/25 font-normal">(€/mėn., bruto)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-medium">€</span>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      placeholder="pvz. 2000"
                      value={state.salaryMin}
                      onChange={(e) => update({ salaryMin: e.target.value })}
                      className="w-full sm:w-52 pl-8 pr-4 py-3.5 bg-white/4 border border-white/8 rounded-xl text-white placeholder-white/25 focus:outline-none focus:border-[#7C6EF7] focus:ring-1 focus:ring-[#7C6EF7]/30 transition"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => update({ step: 3 })}
                  className="px-4 py-3 bg-white/4 border border-white/8 rounded-xl text-white/45 hover:text-white transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => update({ step: 5 })}
                  className="flex-1 py-3 bg-[#7C6EF7] hover:bg-[#9D8EFF] text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
                >
                  Tęsti <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Work format + experience + extra ────────────────────── */}
          {state.step === 5 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#7C6EF7]/15 border border-[#7C6EF7]/25 flex items-center justify-center mb-5">
                  <MapPin className="w-6 h-6 text-[#7C6EF7]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Darbo formatas</h1>
                <p className="text-white/45 leading-relaxed">
                  Kaip norite dirbti ir kokie papildomi kriterijai?
                </p>
              </div>

              <div className="space-y-7">
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2.5">Darbo formatas</label>
                  <div className="flex flex-wrap gap-2">
                    {WORK_FORMATS.map((wf) => (
                      <Chip
                        key={wf.value}
                        label={wf.label}
                        selected={state.workFormat === wf.value}
                        onToggle={() => update({ workFormat: state.workFormat === wf.value ? '' : wf.value })}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2.5">Patirties lygis</label>
                  <div className="flex flex-col gap-2">
                    {EXPERIENCE_LEVELS.map((el) => (
                      <OptionCard
                        key={el.value}
                        label={el.label}
                        selected={state.experienceLevel === el.value}
                        onClick={() => update({ experienceLevel: state.experienceLevel === el.value ? '' : el.value })}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2.5">
                    Ar šiuo metu dirbate?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {EMPLOYED_NOW_OPTIONS.map((o) => (
                      <OptionCard
                        key={o.value}
                        label={o.label}
                        selected={state.employedNow === o.value}
                        onClick={() => update({ employedNow: state.employedNow === o.value ? '' : o.value })}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2.5">
                    Darbo kalba
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {WORK_LANGUAGE_OPTIONS.map((o) => (
                      <Chip
                        key={o.value}
                        label={o.label}
                        selected={state.workLanguage === o.value}
                        onToggle={() => update({ workLanguage: state.workLanguage === o.value ? '' : o.value })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => update({ step: 4 })}
                  className="px-4 py-3 bg-white/4 border border-white/8 rounded-xl text-white/45 hover:text-white transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => update({ step: 6 })}
                  className="flex-1 py-3 bg-[#7C6EF7] hover:bg-[#9D8EFF] text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
                >
                  Tęsti <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 6: Summary + paywall ────────────────────────────────────── */}
          {state.step === 6 && (
            <div>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl bg-[#43e97b]/15 border border-[#43e97b]/25 flex items-center justify-center mb-5">
                  <Check className="w-6 h-6 text-[#43e97b]" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Profilis paruoštas!</h1>
                <p className="text-white/45 leading-relaxed">
                  Peržiūrėkite savo nustatymus ir aktyvuokite AI darbo paiešką.
                </p>
              </div>

              {/* Social proof */}
              <div className="p-4 bg-[#7C6EF7]/8 border border-[#7C6EF7]/20 rounded-2xl mb-5 flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-[#7C6EF7] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white mb-0.5">
                    Panašiems vartotojams rasta vidutiniškai <span className="text-[#9D8EFF]">18 tinkamų darbo pasiūlymų</span> per pirmą savaitę
                  </p>
                  <p className="text-xs text-white/35">Sutaupo ~4 val/sav.</p>
                </div>
              </div>

              {/* Summary card */}
              <div className="p-5 bg-white/3 border border-white/7 rounded-2xl space-y-3 mb-5">
                {[
                  { label: 'El. paštas', value: state.email },
                  state.position && { label: 'Pozicija', value: state.position },
                  state.skills && { label: 'Įgūdžiai', value: state.skills },
                  state.cities.length > 0 && { label: 'Miestai', value: state.cities.join(', ') },
                  state.salaryMin && { label: 'Min. atlyginimas', value: `€${state.salaryMin}/mėn.` },
                  state.workFormat && { label: 'Darbo formatas', value: WORK_FORMATS.find((wf) => wf.value === state.workFormat)?.label },
                  state.experienceLevel && { label: 'Patirtis', value: EXPERIENCE_LEVELS.find((el) => el.value === state.experienceLevel)?.label },
                ]
                  .filter(Boolean)
                  .map((row) => {
                    const r = row as { label: string; value: string | undefined }
                    return (
                      <div key={r.label} className="flex justify-between text-sm gap-4">
                        <span className="text-white/40 shrink-0">{r.label}</span>
                        <span className="text-white font-medium text-right truncate">{r.value}</span>
                      </div>
                    )
                  })}
              </div>

              {/* What they get */}
              <div className="p-4 bg-white/2 border border-white/6 rounded-xl mb-5 space-y-2">
                {[
                  '🔍 AI kasdien skaituoja 5 lietuviškus darbo portalus',
                  '🎯 Tik labiausiai tinkami pasiūlymai su įvertinimu 1–10',
                  '📧 El. pašto pranešimas, kai atsiranda naujų atitikimų',
                ].map((item) => (
                  <p key={item} className="text-sm text-white/45">{item}</p>
                ))}
              </div>

              {error && (
                <div className="flex items-start gap-2.5 text-red-400 text-sm bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => update({ step: 5 })}
                  className="px-4 py-3 bg-white/4 border border-white/8 rounded-xl text-white/45 hover:text-white transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleFinish}
                  disabled={loading}
                  className="flex-1 py-3.5 bg-[#7C6EF7] hover:bg-[#9D8EFF] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition flex items-center justify-center gap-2 text-base"
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
              <p className="text-center text-xs text-white/25 mt-4">
                7 dienos nemokamai · Saugi Stripe apmokėjimas · Atšaukti galima bet kada
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
