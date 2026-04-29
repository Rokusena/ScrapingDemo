'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react'

const CSS = `
  .ob-root {
    min-height: 100vh;
    background: var(--paper);
    color: var(--ink);
    display: flex;
    flex-direction: column;
    font-family: 'Inter Tight', sans-serif;
  }
  .ob-bar {
    border-bottom: 1px solid var(--line);
    background: white;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .ob-bar-inner {
    max-width: 680px;
    margin: 0 auto;
    padding: 0 24px;
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ob-logo {
    font-family: var(--font-display);
    font-size: 22px;
    letter-spacing: -.01em;
    color: var(--ink);
    text-decoration: none;
  }
  .ob-logo .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    margin-right: 2px;
    vertical-align: middle;
    position: relative;
    top: -2px;
  }
  .ob-progress-track {
    height: 2px;
    background: var(--line);
    position: sticky;
    top: 58px;
    z-index: 10;
  }
  .ob-progress-fill {
    height: 100%;
    background: var(--accent);
    transition: width .5s ease;
  }

  /* Step indicators */
  .ob-steps { display: flex; align-items: center; gap: 6px; }
  .ob-step-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    transition: all .2s;
  }
  .ob-step-dot.done {
    width: 24px; height: 24px;
    background: var(--accent);
    color: white;
  }
  .ob-step-dot.active {
    width: 24px; height: 24px;
    border: 2px solid var(--accent);
    color: var(--accent);
    background: color-mix(in oklab, var(--accent) 8%, transparent);
  }
  .ob-step-dot.future {
    width: 20px; height: 20px;
    background: var(--line);
    color: var(--ink-4);
  }
  .ob-step-connector {
    height: 2px;
    border-radius: 1px;
    transition: all .2s;
  }
  .ob-step-connector.done { background: var(--accent); width: 24px; }
  .ob-step-connector.pending { background: var(--line); width: 16px; }

  /* Content */
  .ob-content {
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 48px 24px;
  }
  .ob-panel { width: 100%; max-width: 480px; }

  /* Step icon */
  .ob-icon-box {
    width: 48px; height: 48px;
    border-radius: 14px;
    background: color-mix(in oklab, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in oklab, var(--accent) 20%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
    font-size: 22px;
    line-height: 1;
  }
  .ob-icon-box svg { width: 22px; height: 22px; stroke: var(--accent); }

  .ob-h1 {
    font-family: var(--font-display);
    font-size: 28px;
    letter-spacing: -.01em;
    margin: 0 0 8px;
    color: var(--ink);
  }
  .ob-sub { font-size: 14px; color: var(--ink-4); line-height: 1.6; margin: 0 0 32px; }

  /* Inputs */
  .ob-label {
    display: block;
    font-size: 11px;
    font-family: var(--font-mono);
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--ink-4);
    margin-bottom: 7px;
  }
  .ob-label .note { font-size: 10px; text-transform: none; letter-spacing: 0; margin-left: 4px; }
  .ob-input {
    width: 100%;
    padding: 12px 14px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 14px;
    color: var(--ink);
    outline: none;
    transition: border-color .15s;
    box-sizing: border-box;
    font-family: inherit;
  }
  .ob-input:focus { border-color: var(--accent); }
  .ob-input::placeholder { color: var(--ink-4); }
  .ob-input-wrap { position: relative; }
  .ob-input-prefix {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-4);
    font-weight: 500;
    pointer-events: none;
  }
  .ob-input.padded { padding-left: 28px; }

  /* Option cards */
  .ob-option {
    width: 100%;
    padding: 13px 16px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: white;
    color: var(--ink-4);
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    transition: all .15s;
    font-family: inherit;
  }
  .ob-option:hover { border-color: var(--accent); color: var(--ink); }
  .ob-option.selected {
    background: color-mix(in oklab, var(--accent) 7%, transparent);
    border-color: var(--accent);
    color: var(--ink);
  }
  .ob-option-check {
    width: 20px; height: 20px;
    border-radius: 50%;
    background: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ob-option-check svg { width: 11px; height: 11px; stroke: white; }
  .ob-option-icon { color: var(--ink-4); display: flex; }
  .ob-option.selected .ob-option-icon { color: var(--accent); }

  /* Chips */
  .ob-chip {
    padding: 8px 16px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: white;
    color: var(--ink-4);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all .15s;
    font-family: inherit;
  }
  .ob-chip:hover { border-color: var(--accent); color: var(--ink); }
  .ob-chip.selected {
    background: color-mix(in oklab, var(--accent) 8%, transparent);
    border-color: var(--accent);
    color: var(--accent);
  }

  /* Buttons */
  .ob-btn-row { display: flex; gap: 12px; margin-top: 32px; }
  .ob-btn-primary {
    flex: 1;
    padding: 13px;
    background: var(--accent);
    border: none;
    border-radius: 12px;
    color: #f6f4ee;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity .15s;
    font-family: inherit;
  }
  .ob-btn-primary:hover { opacity: .88; }
  .ob-btn-primary:disabled { opacity: .4; cursor: not-allowed; }
  .ob-btn-back {
    padding: 13px 16px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 12px;
    color: var(--ink-4);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: color .15s;
    font-family: inherit;
  }
  .ob-btn-back:hover { color: var(--ink); }
  .ob-btn-skip {
    flex: 1;
    padding: 13px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 12px;
    color: var(--ink-4);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: color .15s;
    font-family: inherit;
  }
  .ob-btn-skip:hover { color: var(--ink); }
  .ob-btn-skip:disabled { opacity: .4; cursor: not-allowed; }
  .ob-skip-note {
    text-align: center;
    font-size: 11px;
    color: var(--ink-4);
    margin-top: 10px;
    font-family: var(--font-mono);
    letter-spacing: .04em;
  }

  /* Error */
  .ob-error {
    font-size: 13px;
    color: #b33;
    background: rgba(180,50,50,.07);
    border: 1px solid rgba(180,50,50,.2);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 10px;
  }
  .ob-error svg { width: 14px; height: 14px; flex-shrink: 0; margin-top: 1px; }

  /* Section label */
  .ob-section-label {
    font-size: 11px;
    font-family: var(--font-mono);
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--ink-4);
    margin-bottom: 10px;
    display: block;
  }
  .ob-stack { display: flex; flex-direction: column; gap: 8px; }
  .ob-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .ob-chips-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .ob-field { margin-bottom: 24px; }

  /* Step 1: magic link sent */
  .ob-sent-box {
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 32px;
    text-align: center;
  }
  .ob-sent-icon {
    width: 52px; height: 52px;
    border-radius: 50%;
    background: color-mix(in oklab, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in oklab, var(--accent) 20%, transparent);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px;
    font-size: 22px;
  }
  .ob-sent-title { font-family: var(--font-display); font-size: 20px; letter-spacing: -.01em; margin: 0 0 8px; }
  .ob-sent-body { font-size: 13px; color: var(--ink-4); line-height: 1.6; margin: 0; }
  .ob-sent-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 20px; }
  .ob-text-btn { background: none; border: none; font-size: 13px; cursor: pointer; padding: 0; font-family: inherit; transition: color .15s; }
  .ob-text-btn.muted { color: var(--ink-4); }
  .ob-text-btn.muted:hover { color: var(--ink); }
  .ob-text-btn.accent { color: var(--accent); }
  .ob-text-btn.accent:hover { opacity: .75; }

  /* Loading spinner */
  .ob-spinner-wrap {
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 48px 32px;
    text-align: center;
  }
  .ob-spinner-ring {
    position: relative;
    width: 56px; height: 56px;
    margin: 0 auto 24px;
  }
  .ob-spinner-track {
    position: absolute; inset: 0;
    border-radius: 50%;
    border: 2px solid var(--line);
  }
  .ob-spinner-fill {
    position: absolute; inset: 0;
    border-radius: 50%;
    border: 2px solid var(--accent);
    border-top-color: transparent;
    animation: ob-spin .8s linear infinite;
  }
  .ob-spinner-inner {
    position: absolute; inset: 10px;
    border-radius: 50%;
    background: color-mix(in oklab, var(--accent) 8%, transparent);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  @keyframes ob-spin { to { transform: rotate(360deg); } }
  .ob-spinner-title { font-family: var(--font-display); font-size: 18px; letter-spacing: -.01em; margin: 0 0 6px; }
  .ob-spinner-sub { font-size: 13px; color: var(--ink-4); margin: 0; }
  .ob-spinner-file { margin-top: 16px; font-size: 11px; font-family: var(--font-mono); color: var(--ink-4); }

  /* Drop zone */
  .ob-drop {
    border: 2px dashed var(--line);
    border-radius: 16px;
    background: var(--paper-2);
    padding: 48px 32px;
    text-align: center;
    cursor: pointer;
    transition: all .15s;
  }
  .ob-drop:hover {
    border-color: var(--accent);
    background: color-mix(in oklab, var(--accent) 4%, transparent);
  }
  .ob-drop-icon {
    width: 52px; height: 52px;
    border-radius: 14px;
    background: color-mix(in oklab, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in oklab, var(--accent) 20%, transparent);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px;
    font-size: 22px;
    transition: background .15s;
  }
  .ob-drop:hover .ob-drop-icon {
    background: color-mix(in oklab, var(--accent) 15%, transparent);
  }
  .ob-drop-title { font-weight: 600; font-size: 15px; margin: 0 0 4px; }
  .ob-drop-sub { font-size: 13px; color: var(--ink-4); margin: 0; }
  .ob-info-badges { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 20px; }
  .ob-badge {
    font-size: 11px;
    color: var(--ink-4);
    background: white;
    border: 1px solid var(--line);
    padding: 5px 12px;
    border-radius: 20px;
    font-family: var(--font-mono);
    letter-spacing: .04em;
  }

  /* Summary card */
  .ob-summary {
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 16px;
  }
  .ob-summary-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    gap: 16px;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }
  .ob-summary-row:last-child { border-bottom: none; }
  .ob-summary-k { color: var(--ink-4); flex-shrink: 0; }
  .ob-summary-v { color: var(--ink); font-weight: 500; text-align: right; }

  /* Social proof */
  .ob-social {
    background: color-mix(in oklab, var(--accent) 6%, transparent);
    border: 1px solid color-mix(in oklab, var(--accent) 15%, transparent);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .ob-social-icon { font-size: 18px; flex-shrink: 0; }
  .ob-social-text { font-size: 13px; color: var(--ink); line-height: 1.5; }
  .ob-social-text strong { color: var(--accent); }
  .ob-social-sub { font-size: 11px; color: var(--ink-4); margin-top: 2px; font-family: var(--font-mono); }

  /* What you get */
  .ob-perks {
    background: white;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ob-perk { font-size: 13px; color: var(--ink-4); }

  /* CV extracted badge */
  .ob-cv-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--accent);
    background: color-mix(in oklab, var(--accent) 8%, transparent);
    border: 1px solid color-mix(in oklab, var(--accent) 20%, transparent);
    border-radius: 8px;
    padding: 5px 10px;
    margin-top: 10px;
    font-family: var(--font-mono);
    letter-spacing: .04em;
  }
  .ob-cv-badge svg { width: 12px; height: 12px; stroke: var(--accent); }
`

const LS_KEY = 'gaukdarba-onboarding-v2'

interface WizardState {
  step: number
  email: string
  otpSent: boolean
  searchDuration: string
  hoursPerWeek: string
  biggestFrustration: string
  cvExtracted: boolean
  position: string
  skills: string
  cities: string[]
  salaryMin: string
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

const POSITION_GROUPS = [
  {
    group: 'IT / Technologijos',
    options: [
      { value: 'frontend developer',  label: 'Frontend Programuotojas (React, Vue, Angular)' },
      { value: 'backend developer',   label: 'Backend Programuotojas (Python, Java, Node.js)' },
      { value: 'fullstack developer', label: 'Fullstack / Pilno spektro Programuotojas' },
      { value: 'ai engineer',         label: 'AI / ML Inžinierius' },
      { value: 'data scientist',      label: 'Duomenų mokslininkas / Analitikas' },
      { value: 'devops engineer',     label: 'DevOps / Cloud Inžinierius' },
      { value: 'qa engineer',         label: 'QA / Testavimo Inžinierius' },
      { value: 'project manager',     label: 'Projektų / Produkto Vadovas' },
    ],
  },
  {
    group: 'Prekyba ir Paslaugos',
    options: [
      { value: 'sales assistant',     label: 'Pardavėjas / Konsultantas / Kasininkas' },
      { value: 'accountant',          label: 'Buhalteris / Finansininkas' },
      { value: 'hr specialist',       label: 'Personalo / HR Specialistas' },
    ],
  },
  {
    group: 'Transportas ir Logistika',
    options: [
      { value: 'warehouse worker',    label: 'Sandėlio darbuotojas / Logistikos specialistas' },
      { value: 'driver',              label: 'Vairuotojas / Kurjeris / Ekspeditorius' },
    ],
  },
  {
    group: 'Gamyba ir Statyba',
    options: [
      { value: 'construction worker', label: 'Statybininkas / Montuotojas / Suvirintojas' },
      { value: 'manufacturing worker',label: 'Gamybos darbuotojas / Operatorius' },
    ],
  },
  {
    group: 'Kita',
    options: [
      { value: 'cleaner',             label: 'Valytoja / Valytojas' },
      { value: 'cook',                label: 'Virėjas / Konditeris / Padavėjas' },
      { value: 'security guard',      label: 'Apsaugos darbuotojas / Sargybininkas' },
      { value: 'nurse',               label: 'Slaugytoja / Gydytojas / Farmaceutas' },
    ],
  },
]

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

function OptionCard({ label, selected, onClick, icon }: {
  label: string; selected: boolean; onClick: () => void; icon?: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} className={`ob-option${selected ? ' selected' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon && <span className="ob-option-icon">{icon}</span>}
        {label}
      </div>
      {selected && (
        <div className="ob-option-check">
          <Check strokeWidth={3} />
        </div>
      )}
    </button>
  )
}

function ClockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="ob-steps">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const n = i + 1
        const done = current > n
        const active = current === n
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className={`ob-step-dot ${done ? 'done' : active ? 'active' : 'future'}`}>
              {done ? <Check strokeWidth={3} style={{ width: 11, height: 11 }} /> : active ? n : ''}
            </div>
            {n < TOTAL_STEPS && (
              <div className={`ob-step-connector ${current > n ? 'done' : 'pending'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvLoading, setCvLoading] = useState(false)
  const [cvError, setCvError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    let parsed: WizardState = DEFAULT_STATE
    if (saved) {
      try { parsed = { ...DEFAULT_STATE, ...JSON.parse(saved) } } catch { /* ignore */ }
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

  useEffect(() => {
    if (hydrated) localStorage.setItem(LS_KEY, JSON.stringify(state))
  }, [state, hydrated])

  const update = (patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch }))

  const toggleCity = (city: string) =>
    update({
      cities: state.cities.includes(city)
        ? state.cities.filter((c) => c !== city)
        : [...state.cities, city],
    })

  const handleSendOtp = async () => {
    if (!state.email) return
    setLoading(true)
    setError(null)
    localStorage.setItem('gaukdarba-post-auth', '/onboarding')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: state.email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
      update({
        position: ext.desired_position || state.position,
        skills: ext.skills || state.skills,
        cities: ext.preferred_cities?.filter((c: string) => CITIES.includes(c)) || state.cities,
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

  const handleFinish = async () => {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
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
        experience_level: (state.experienceLevel || null) as 'intern' | 'junior' | 'mid' | 'senior' | null,
        work_format: state.workFormat || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    if (prefErr) { setError(prefErr.message); setLoading(false); return }

    localStorage.removeItem(LS_KEY)

    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) { window.location.href = data.url; return }
    } catch { /* fall through */ }

    router.push('/dashboard')
  }

  if (!hydrated) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--line)', borderTopColor: 'var(--accent)', animation: 'ob-spin .8s linear infinite' }} />
        </div>
      </>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ob-root">
        {/* Top bar */}
        <div className="ob-bar">
          <div className="ob-bar-inner">
            <Link href="/" className="ob-logo"><span className="dot" />gaukdarba</Link>
            <StepIndicator current={state.step} />
          </div>
        </div>

        {/* Progress */}
        <div className="ob-progress-track">
          <div className="ob-progress-fill" style={{ width: `${((state.step - 1) / (TOTAL_STEPS - 1)) * 100}%` }} />
        </div>

        {/* Content */}
        <div className="ob-content">
          <div className="ob-panel">

            {/* ── Step 1: Email ──────────────────────────────────────────────── */}
            {state.step === 1 && (
              <div>
                <div className="ob-icon-box">✉</div>
                <h1 className="ob-h1">{state.otpSent ? 'Patikrinkite el. paštą' : 'Pradėkime'}</h1>
                <p className="ob-sub">
                  {state.otpSent
                    ? `Išsiuntėme prisijungimo nuorodą adresu ${state.email}. Spustelėkite ją — ji grąžins jus čia.`
                    : 'Įveskite el. paštą — išsiųsime prisijungimo nuorodą.'}
                </p>

                {!state.otpSent ? (
                  <div>
                    <div className="ob-field">
                      <label className="ob-label">El. pašto adresas</label>
                      <input
                        className="ob-input"
                        type="email"
                        placeholder="jusu@epastas.lt"
                        value={state.email}
                        onChange={(e) => update({ email: e.target.value })}
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                      />
                    </div>

                    {error && (
                      <div className="ob-error">
                        <AlertCircle />
                        {error}
                      </div>
                    )}

                    <div className="ob-btn-row" style={{ marginTop: 24 }}>
                      <button className="ob-btn-primary" onClick={handleSendOtp} disabled={loading || !state.email}>
                        {loading ? 'Siunčiama...' : <>Gauti nuorodą <ArrowRight strokeWidth={2.5} style={{ width: 16, height: 16 }} /></>}
                      </button>
                    </div>

                    <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-4)', marginTop: 16 }}>
                      Jau turite paskyrą?{' '}
                      <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                        Prisijungti
                      </Link>
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="ob-sent-box">
                      <div className="ob-sent-icon">✉</div>
                      <p className="ob-sent-title">Nuoroda išsiųsta!</p>
                      <p className="ob-sent-body">
                        Spustelėkite nuorodą el. laiške — ji automatiškai grąžins jus čia tęsti registraciją.
                      </p>
                    </div>

                    <div className="ob-sent-actions">
                      <button className="ob-text-btn muted" onClick={() => { update({ otpSent: false }); setError(null) }}>
                        ← Naudoti kitą el. paštą
                      </button>
                      <button className="ob-text-btn accent" onClick={handleSendOtp} disabled={loading}>
                        Siųsti nuorodą iš naujo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Pain questions ─────────────────────────────────────── */}
            {state.step === 2 && (
              <div>
                <div className="ob-icon-box">⚡</div>
                <h1 className="ob-h1">Šiek tiek apie jus</h1>
                <p className="ob-sub">Padėsite mums geriau pritaikyti AI paiešką prie jūsų situacijos.</p>

                <div className="ob-field">
                  <span className="ob-section-label">Kiek laiko ieškote darbo?</span>
                  <div className="ob-grid2">
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

                <div className="ob-field">
                  <span className="ob-section-label">Kiek valandų per savaitę skiriate darbo paieškai?</span>
                  <div className="ob-grid2">
                    {HOURS_PER_WEEK_OPTIONS.map((o) => (
                      <OptionCard
                        key={o.value}
                        label={o.label}
                        selected={state.hoursPerWeek === o.value}
                        onClick={() => update({ hoursPerWeek: state.hoursPerWeek === o.value ? '' : o.value })}
                        icon={<ClockIcon />}
                      />
                    ))}
                  </div>
                </div>

                <div className="ob-field" style={{ marginBottom: 0 }}>
                  <span className="ob-section-label">Kas labiausiai erzina ieškant darbo?</span>
                  <div className="ob-stack">
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

                <div className="ob-btn-row">
                  <button className="ob-btn-back" onClick={() => update({ step: 1, otpSent: false })}>
                    <ArrowLeft strokeWidth={2.5} style={{ width: 16, height: 16 }} />
                  </button>
                  <button className="ob-btn-primary" onClick={() => update({ step: 3 })}>
                    Tęsti <ArrowRight strokeWidth={2.5} style={{ width: 16, height: 16 }} />
                  </button>
                </div>
                <p className="ob-skip-note">Galite praleisti ir pildyti vėliau</p>
              </div>
            )}

            {/* ── Step 3: CV upload ──────────────────────────────────────────── */}
            {state.step === 3 && (
              <div>
                <div className="ob-icon-box">⬆</div>
                <h1 className="ob-h1">Įkelkite CV</h1>
                <p className="ob-sub">AI automatiškai nuskaitys jūsų CV ir užpildys darbo pageidavimus. Sutaupysite 5 minutes.</p>

                {cvLoading ? (
                  <div className="ob-spinner-wrap">
                    <div className="ob-spinner-ring">
                      <div className="ob-spinner-track" />
                      <div className="ob-spinner-fill" />
                      <div className="ob-spinner-inner">⚡</div>
                    </div>
                    <p className="ob-spinner-title">AI nuskaito jūsų CV...</p>
                    <p className="ob-spinner-sub">Analizuojame jūsų patirtį ir įgūdžius</p>
                    {cvFile && <p className="ob-spinner-file">📄 {cvFile.name}</p>}
                  </div>
                ) : (
                  <>
                    <div
                      className="ob-drop"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        const f = e.dataTransfer.files[0]
                        if (f) handleCvUpload(f)
                      }}
                    >
                      <div className="ob-drop-icon">⬆</div>
                      <p className="ob-drop-title">Spustelėkite arba nutempkite CV</p>
                      <p className="ob-drop-sub">PDF failas · maks. 10 MB</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleCvUpload(f)
                        }}
                      />
                    </div>

                    {cvError && (
                      <div className="ob-error" style={{ marginTop: 16 }}>
                        <AlertCircle />
                        {cvError}
                      </div>
                    )}

                    <div className="ob-info-badges">
                      {['Automatiškai užpildo laukus', 'Privatūs duomenys', 'Veikia per 15 sek.'].map((b) => (
                        <span key={b} className="ob-badge">{b}</span>
                      ))}
                    </div>
                  </>
                )}

                {!cvLoading && (
                  <div className="ob-btn-row">
                    <button className="ob-btn-back" onClick={() => update({ step: 2 })}>
                      <ArrowLeft strokeWidth={2.5} style={{ width: 16, height: 16 }} />
                    </button>
                    <button className="ob-btn-skip" onClick={() => update({ step: 4 })}>
                      Praleisti CV įkėlimą <ArrowRight strokeWidth={2.5} style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 4: Job preferences ────────────────────────────────────── */}
            {state.step === 4 && (
              <div>
                <div className="ob-icon-box">💼</div>
                <h1 className="ob-h1">Darbo preferencijos</h1>
                <p className="ob-sub">
                  {state.cvExtracted
                    ? 'AI nuskaitė jūsų CV — patikrinkite ir pataisykite, jei reikia.'
                    : 'Nurodykite ko ieškote — AI naudos šiuos duomenis kasdien skenuodamas darbo skelbimus.'}
                </p>
                {state.cvExtracted && (
                  <div className="ob-cv-badge">
                    <Check strokeWidth={3} /> Užpildyta iš CV
                  </div>
                )}

                <div className="ob-field" style={{ marginTop: 24 }}>
                  <label className="ob-label">Pageidaujama pozicija</label>
                  <select
                    className="ob-input"
                    value={state.position}
                    onChange={(e) => update({ position: e.target.value })}
                    autoFocus
                  >
                    <option value="">— Pasirinkite poziciją —</option>
                    {POSITION_GROUPS.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="ob-field">
                  <label className="ob-label">
                    Įgūdžiai <span className="note">(atskirti kableliais)</span>
                  </label>
                  <input
                    className="ob-input"
                    type="text"
                    placeholder="pvz. React, TypeScript, SQL, Projektų valdymas"
                    value={state.skills}
                    onChange={(e) => update({ skills: e.target.value })}
                  />
                </div>

                <div className="ob-field">
                  <label className="ob-label">Pageidaujami miestai</label>
                  <div className="ob-chips-row">
                    {CITIES.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className={`ob-chip${state.cities.includes(city) ? ' selected' : ''}`}
                        onClick={() => toggleCity(city)}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ob-field" style={{ marginBottom: 0 }}>
                  <label className="ob-label">
                    Minimalus atlyginimas <span className="note">(€/mėn., bruto)</span>
                  </label>
                  <div className="ob-input-wrap" style={{ display: 'inline-block', position: 'relative' }}>
                    <span className="ob-input-prefix">€</span>
                    <input
                      className="ob-input padded"
                      type="number"
                      min={0}
                      step={100}
                      placeholder="pvz. 2000"
                      value={state.salaryMin}
                      onChange={(e) => update({ salaryMin: e.target.value })}
                      style={{ width: 180 }}
                    />
                  </div>
                </div>

                <div className="ob-btn-row">
                  <button className="ob-btn-back" onClick={() => update({ step: 3 })}>
                    <ArrowLeft strokeWidth={2.5} style={{ width: 16, height: 16 }} />
                  </button>
                  <button className="ob-btn-primary" onClick={() => update({ step: 5 })}>
                    Tęsti <ArrowRight strokeWidth={2.5} style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 5: Work format + experience ──────────────────────────── */}
            {state.step === 5 && (
              <div>
                <div className="ob-icon-box">📍</div>
                <h1 className="ob-h1">Darbo formatas</h1>
                <p className="ob-sub">Kaip norite dirbti ir kokie papildomi kriterijai?</p>

                <div className="ob-field">
                  <span className="ob-section-label">Darbo formatas</span>
                  <div className="ob-chips-row">
                    {WORK_FORMATS.map((wf) => (
                      <button
                        key={wf.value}
                        type="button"
                        className={`ob-chip${state.workFormat === wf.value ? ' selected' : ''}`}
                        onClick={() => update({ workFormat: state.workFormat === wf.value ? '' : wf.value })}
                      >
                        {wf.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ob-field">
                  <span className="ob-section-label">Patirties lygis</span>
                  <div className="ob-stack">
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

                <div className="ob-field">
                  <span className="ob-section-label">Ar šiuo metu dirbate?</span>
                  <div className="ob-grid2">
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

                <div className="ob-field" style={{ marginBottom: 0 }}>
                  <span className="ob-section-label">Darbo kalba</span>
                  <div className="ob-chips-row">
                    {WORK_LANGUAGE_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        className={`ob-chip${state.workLanguage === o.value ? ' selected' : ''}`}
                        onClick={() => update({ workLanguage: state.workLanguage === o.value ? '' : o.value })}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ob-btn-row">
                  <button className="ob-btn-back" onClick={() => update({ step: 4 })}>
                    <ArrowLeft strokeWidth={2.5} style={{ width: 16, height: 16 }} />
                  </button>
                  <button className="ob-btn-primary" onClick={() => update({ step: 6 })}>
                    Tęsti <ArrowRight strokeWidth={2.5} style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 6: Summary + paywall ──────────────────────────────────── */}
            {state.step === 6 && (
              <div>
                <div className="ob-icon-box" style={{ background: 'color-mix(in oklab, var(--accent) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--accent) 20%, transparent)' }}>
                  ✓
                </div>
                <h1 className="ob-h1">Profilis paruoštas!</h1>
                <p className="ob-sub">Peržiūrėkite savo nustatymus ir aktyvuokite AI darbo paiešką.</p>

                <div className="ob-social">
                  <span className="ob-social-icon">📈</span>
                  <div>
                    <p className="ob-social-text">
                      Panašiems vartotojams rasta vidutiniškai{' '}
                      <strong>18 tinkamų darbo pasiūlymų</strong> per pirmą savaitę
                    </p>
                    <p className="ob-social-sub">Sutaupo ~4 val/sav.</p>
                  </div>
                </div>

                <div className="ob-summary">
                  {[
                    { label: 'El. paštas', value: state.email },
                    state.position && { label: 'Pozicija', value: state.position },
                    state.skills && { label: 'Įgūdžiai', value: state.skills },
                    state.cities.length > 0 && { label: 'Miestai', value: state.cities.join(', ') },
                    state.salaryMin && { label: 'Min. atlyginimas', value: `€${state.salaryMin}/mėn.` },
                    state.workFormat && { label: 'Formatas', value: WORK_FORMATS.find((wf) => wf.value === state.workFormat)?.label },
                    state.experienceLevel && { label: 'Patirtis', value: EXPERIENCE_LEVELS.find((el) => el.value === state.experienceLevel)?.label },
                  ].filter(Boolean).map((row) => {
                    const r = row as { label: string; value: string | undefined }
                    return (
                      <div key={r.label} className="ob-summary-row">
                        <span className="ob-summary-k">{r.label}</span>
                        <span className="ob-summary-v">{r.value}</span>
                      </div>
                    )
                  })}
                </div>

                <div className="ob-perks">
                  {[
                    '🔍 AI kasdien skaituoja 5 lietuviškus darbo portalus',
                    '🎯 Tik labiausiai tinkami pasiūlymai su įvertinimu 1–10',
                    '📧 El. pašto pranešimas, kai atsiranda naujų atitikimų',
                  ].map((item) => (
                    <p key={item} className="ob-perk">{item}</p>
                  ))}
                </div>

                {error && (
                  <div className="ob-error" style={{ marginBottom: 16 }}>
                    <AlertCircle />
                    {error}
                  </div>
                )}

                <div className="ob-btn-row">
                  <button className="ob-btn-back" onClick={() => update({ step: 5 })}>
                    <ArrowLeft strokeWidth={2.5} style={{ width: 16, height: 16 }} />
                  </button>
                  <button className="ob-btn-primary" onClick={handleFinish} disabled={loading}>
                    {loading ? 'Kraunama...' : <>Aktyvuoti Pro · €10/mėn. <ArrowRight strokeWidth={2.5} style={{ width: 16, height: 16 }} /></>}
                  </button>
                </div>
                <p className="ob-skip-note">7 dienos nemokamai · Saugi Stripe apmokėjimas · Atšaukti galima bet kada</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
