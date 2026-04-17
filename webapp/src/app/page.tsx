'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowRight,
  CheckCircle,
  BrainCircuit,
  Rss,
  Mail,
  ChevronDown,
  ChevronUp,
  Star,
  Zap,
  Shield,
  Clock,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

// ── Data ─────────────────────────────────────────────────────────────────────

const STATS = [
  { value: '5', label: 'darbo šaltiniai' },
  { value: 'Kasdien', label: 'atnaujinama' },
  { value: 'AI 1–10', label: 'įvertinimas' },
]

const HOW_IT_WORKS = [
  {
    num: '01',
    icon: <BrainCircuit className="w-6 h-6 text-[#7C6EF7]" />,
    title: 'Užpildykite profilį',
    desc: 'Įkelkite CV — AI automatiškai nuskaito ir užpildo jūsų pageidavimus. Užtrunka 2 minutes.',
  },
  {
    num: '02',
    icon: <Rss className="w-6 h-6 text-[#7C6EF7]" />,
    title: 'AI skaituoja kasdien',
    desc: 'Automatiškai perrenkame CVBankas.lt, CV-Online.lt, CVmarket.lt ir kitus portalus — kiekvieną dieną.',
  },
  {
    num: '03',
    icon: <Mail className="w-6 h-6 text-[#7C6EF7]" />,
    title: 'Gaukite geriausius pasiūlymus',
    desc: 'Matote tik labiausiai tinkančius darbus su AI įvertinimu 1–10 ir paaiškinimu, kodėl jie atitinka.',
  },
]

const FEATURES = [
  {
    icon: <Zap className="w-6 h-6 text-[#7C6EF7]" />,
    title: 'Greitas AI vertinimas',
    desc: 'GPT-4o modelis peržiūri kiekvieną darbo skelbimą ir įvertina, kaip gerai jis atitinka jūsų profilį. Sutaupykite valandas rankinės paieškos.',
    badge: '3 sluoksnių filtravimas',
  },
  {
    icon: <Shield className="w-6 h-6 text-[#7C6EF7]" />,
    title: '5 lietuviški portalai',
    desc: 'Skanuojame CVBankas.lt, CV-Online.lt, CVmarket.lt, Unicorns.lt ir UZT.lt — visa lietuviška darbo rinka vienoje vietoje.',
    badge: 'Pilnas aprėptis',
  },
  {
    icon: <Clock className="w-6 h-6 text-[#7C6EF7]" />,
    title: 'Kasdieniai el. pranešimai',
    desc: 'Gaukite dienos santrauką su geriausiais jums tinkančiais pasiūlymais tiesiai į el. paštą. Niekada nepraleiskite geros galimybės.',
    badge: 'Automatinis',
  },
]

const TESTIMONIALS = [
  {
    name: 'Tomas K.',
    role: 'Backend Programuotojas',
    text: 'Nebepraleidu valandų naršydamas darbo portalus. GaukDarba kiekvieną rytą siunčia tiksliai tai, ko ieškau.',
    score: 5,
  },
  {
    name: 'Agnė M.',
    role: 'Projektų vadovė',
    text: 'AI įvertinimas 1–10 labai padeda — iš karto matau, kurie skelbimai verti atidesnio žvilgsnio ir kuriuos galiu praleisti.',
    score: 5,
  },
  {
    name: 'Mantas P.',
    role: 'Finansų analitikas',
    text: 'Per pirmą savaitę radau 3 labai tinkančius pasiūlymus, kurių pats nepastebėjau naršydamas CV-Online. Verta kiekvieno euro.',
    score: 5,
  },
]

const PRICING_FEATURES = [
  'Neribota darbo paieška',
  'AI vertinimas 1–10 balų',
  'El. pašto pranešimai',
  'Asmeninis valdymo skydelis',
  'Paaiškinimai, kodėl tinka',
  'Atnaujinama kasdien',
  '5 lietuviški darbo portalai',
]

const FAQ_ITEMS = [
  {
    q: 'Kaip veikia AI atitikimas?',
    a: 'Naudojame GPT-4o-mini modelį, kuris išanalizuoja jūsų profilį (pozicija, įgūdžiai, miestas, atlyginimas) ir lygina su kiekvienu darbo skelbimu. Kiekvienas atitikimas gauna įvertinimą 1–10 su paaiškinimu, kodėl jis tinkamas.',
  },
  {
    q: 'Kokius darbo portalus skanuojate?',
    a: 'CVBankas.lt, CV-Online.lt, CVmarket.lt, Unicorns.lt (startuoliai) ir UZT.lt (valstybinė užimtumo tarnyba). Visi skelbimai normalizuojami į vieną formatą.',
  },
  {
    q: 'Kaip dažnai atnaujinami skelbimai?',
    a: 'Kasdien — kiekvieną rytą apie 6 val. (Lietuvos laiku). Nauji atitikimai atsiranda jūsų valdymo skydelyje ir siunčiami el. paštu.',
  },
  {
    q: 'Ar galiu atšaukti prenumeratą?',
    a: 'Taip, bet kada. Jokių slaptų mokesčių ar įsipareigojimų. Atsiskaitymas vyksta per saugią Stripe sistemą.',
  },
  {
    q: 'Ar mano duomenys saugūs?',
    a: 'Taip. Naudojame Supabase duomenų bazę su eilutės lygio saugumo politika (RLS) — kiekvienas vartotojas mato tik savo duomenis. Slaptažodžio nereikia — autentifikacija vyksta per el. pašto kodą.',
  },
]

// ── Components ────────────────────────────────────────────────────────────────

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="w-4 h-4 fill-[#f7b731] text-[#f7b731]" />
      ))}
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-white/8 rounded-2xl overflow-hidden bg-white/2 backdrop-blur-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-white/4 transition"
      >
        <span className="font-medium text-sm">{q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/40 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-5 text-white/50 text-sm leading-relaxed border-t border-white/6 pt-4">
          {a}
        </div>
      )}
    </div>
  )
}

// Simulated dashboard mockup for the hero
function DashboardMockup() {
  return (
    <div className="relative w-full max-w-3xl mx-auto mt-14">
      {/* Glow under the card */}
      <div className="absolute inset-x-16 bottom-0 h-24 bg-[#7C6EF7]/20 blur-3xl rounded-full" />

      <div className="relative rounded-2xl border border-white/10 bg-[#0e0e18]/90 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/60">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/6 bg-white/3">
          <span className="w-3 h-3 rounded-full bg-red-500/60" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <span className="w-3 h-3 rounded-full bg-green-500/60" />
          <span className="ml-4 text-xs text-white/30 font-mono">gaukdarba.lt/dashboard</span>
        </div>

        {/* Dashboard content */}
        <div className="p-5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs text-white/40 mb-0.5">Šiandien rasta</p>
              <p className="text-2xl font-bold text-white">12 atitikimų</p>
            </div>
            <div className="flex gap-2">
              <div className="px-3 py-1.5 bg-[#7C6EF7]/20 border border-[#7C6EF7]/30 rounded-lg text-xs text-[#9D8EFF] font-medium">
                Kasdienė ataskaita
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Vidutinis balas', value: '8.4/10', color: 'text-[#43e97b]' },
              { label: 'Šaltiniai', value: '5 portalai', color: 'text-[#9D8EFF]' },
              { label: 'Nauji šiandien', value: '+12', color: 'text-[#60b4ff]' },
            ].map((s) => (
              <div key={s.label} className="bg-white/4 rounded-xl p-3 border border-white/5">
                <p className="text-xs text-white/40 mb-1">{s.label}</p>
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Job listings */}
          <div className="space-y-2">
            {[
              { title: 'Senior Frontend Developer', company: 'Tesonet', score: 9, portal: 'CV-Online', badge: 'Puikiai tinka' },
              { title: 'React Programuotojas', company: 'Hostinger', score: 8, portal: 'CVBankas', badge: 'Labai tinka' },
              { title: 'Full-stack Developer', company: 'Nord Security', score: 7, portal: 'Unicorns.lt', badge: 'Tinka' },
            ].map((job) => (
              <div key={job.title} className="flex items-center justify-between p-3 bg-white/3 rounded-xl border border-white/5 hover:bg-white/5 transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#7C6EF7]/20 border border-[#7C6EF7]/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-[#9D8EFF]">{job.company.charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{job.title}</p>
                    <p className="text-xs text-white/40">{job.company} · {job.portal}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-white/40 hidden sm:block">{job.badge}</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${job.score >= 9 ? 'bg-[#43e97b]/15 text-[#43e97b]' : job.score >= 7 ? 'bg-[#7C6EF7]/15 text-[#9D8EFF]' : 'bg-white/8 text-white/60'}`}>
                    {job.score}/10
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setLoggedIn(true)
    })
  }, [])

  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ background: '#0a0a0f' }}>
      <style>{`
        :root {
          --bg-primary: #0a0a0f;
          --bg-secondary: #0e0e16;
          --bg-card: #14141e;
          --border: rgba(255,255,255,0.07);
          --accent: #7C6EF7;
          --accent-hover: #9D8EFF;
          --text-primary: #ffffff;
          --text-secondary: rgba(255,255,255,0.45);
          --success: #43e97b;
          --warning: #f7b731;
        }
        .glow-accent { box-shadow: 0 0 40px rgba(124,110,247,0.15); }
        .text-gradient { background: linear-gradient(135deg, #fff 0%, #c4b5fd 50%, #7C6EF7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card-hover { transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s; }
        .card-hover:hover { border-color: rgba(124,110,247,0.3); transform: translateY(-2px); box-shadow: 0 8px 32px rgba(124,110,247,0.08); }
      `}</style>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-extrabold text-xl tracking-tight">
            <span className="text-[var(--accent)]">Gauk</span>Darba
          </span>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/45">
            <a href="#how-it-works" className="hover:text-white transition">Kaip veikia</a>
            <a href="#pricing" className="hover:text-white transition">Kaina</a>
            <a href="#faq" className="hover:text-white transition">DUK</a>
          </div>
          <div className="flex items-center gap-3">
            {loggedIn ? (
              <>
                <Link
                  href="/dashboard"
                  className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl transition"
                >
                  Mano skydelis
                </Link>
                <button
                  onClick={async () => {
                    const supabase = createClient()
                    await supabase.auth.signOut()
                    setLoggedIn(false)
                  }}
                  className="px-4 py-2 text-sm text-white/45 hover:text-white border border-white/8 hover:border-white/20 rounded-xl transition"
                >
                  Atsijungti
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm text-white/45 hover:text-white border border-white/8 hover:border-white/20 rounded-xl transition"
                >
                  Prisijungti
                </Link>
                <Link
                  href="/onboarding"
                  className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl transition glow-accent"
                >
                  7 dienos nemokamai
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background gradients */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-[#7C6EF7]/8 blur-[120px]" />
          <div className="absolute top-20 left-1/4 w-[400px] h-[400px] rounded-full bg-[#a855f7]/5 blur-[100px]" />
          <div className="absolute top-10 right-1/4 w-[300px] h-[300px] rounded-full bg-[#6366f1]/6 blur-[80px]" />
        </div>

        {/* Subtle grid overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{
          backgroundImage: 'linear-gradient(rgba(124,110,247,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(124,110,247,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px'
        }} />

        <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full border border-[#7C6EF7]/25 bg-[#7C6EF7]/8 text-[#b8adff] text-sm font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            AI darbo paieška Lietuvoje
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.06] mb-6 tracking-tight">
            Rask darbą{' '}
            <span className="text-gradient">greičiau su AI</span>
          </h1>

          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            Kasdien automatiškai skanuojame 5 lietuviškus darbo portalus ir AI pagalba
            atrandame tuos skelbimus, kurie labiausiai atitinka <span className="text-white/80">jūsų</span> profilį.
          </p>

          {/* Primary CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/onboarding"
              className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-2xl transition text-lg shadow-xl shadow-[#7C6EF7]/30 glow-accent"
            >
              Get Started Now
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center px-8 py-4 bg-white/4 hover:bg-white/7 text-white/60 hover:text-white font-semibold rounded-2xl border border-white/8 hover:border-white/15 transition text-lg"
            >
              Kaip tai veikia?
            </a>
          </div>

          <p className="mt-5 text-white/30 text-sm">
            7 dienos nemokamai · Atšaukti galima bet kada · Banko kortele arba PayPal
          </p>

          {/* Social proof row */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <div className="flex -space-x-2">
              {['T','A','M','L','K'].map((l) => (
                <div key={l} className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7C6EF7] to-[#a855f7] border-2 border-[#0a0a0f] flex items-center justify-center text-xs font-bold">
                  {l}
                </div>
              ))}
            </div>
            <p className="text-white/40 text-sm">
              <span className="text-white font-semibold">500+</span> darbo ieškančių šiandien
            </p>
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="relative max-w-5xl mx-auto px-6 pb-20">
          <DashboardMockup />
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-white/2">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="grid grid-cols-3 gap-6 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-3xl md:text-4xl font-extrabold text-white mb-1">{s.value}</p>
                <p className="text-sm text-white/40">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-28">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-xs font-semibold uppercase tracking-[0.2em] mb-4">
            Kaip tai veikia
          </p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Trys žingsniai</h2>
          <p className="text-white/45 text-lg">
            Iki tobulo darbo pasiūlymo per mažiau nei 2 minutes
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((s) => (
            <div
              key={s.num}
              className="relative p-8 bg-[var(--bg-card)] border border-white/7 rounded-2xl card-hover"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 rounded-xl bg-[#7C6EF7]/10 border border-[#7C6EF7]/15">
                  {s.icon}
                </div>
                <span className="font-mono text-xs font-bold text-white/25 tracking-widest">
                  {s.num}
                </span>
              </div>
              <h3 className="text-lg font-bold mb-2">{s.title}</h3>
              <p className="text-white/45 leading-relaxed text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className="py-28 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-[#7C6EF7]/5 blur-[100px]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-[var(--accent)] text-xs font-semibold uppercase tracking-[0.2em] mb-4">
              Funkcijos
            </p>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Kodėl verta rinktis GaukDarba
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="p-7 bg-[var(--bg-card)] border border-white/7 rounded-2xl flex flex-col gap-4 card-hover"
              >
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-xl bg-[#7C6EF7]/10 border border-[#7C6EF7]/15">
                    {f.icon}
                  </div>
                  <span className="text-xs font-medium text-[#9D8EFF] bg-[#7C6EF7]/10 border border-[#7C6EF7]/15 px-2.5 py-1 rounded-full">
                    {f.badge}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-base mb-2">{f.title}</h3>
                  <p className="text-white/45 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-28">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-xs font-semibold uppercase tracking-[0.2em] mb-4">
            Atsiliepimai
          </p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Ką sako vartotojai</h2>
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="flex">
              {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-[#f7b731] text-[#f7b731]" />)}
            </div>
            <span className="text-white/40 text-sm">4.9/5 iš 200+ atsiliepimų</span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="p-7 bg-[var(--bg-card)] border border-white/7 rounded-2xl flex flex-col gap-4 card-hover"
            >
              <StarRow count={t.score} />
              <p className="text-white/50 text-sm leading-relaxed flex-1">
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7C6EF7] to-[#a855f7] flex items-center justify-center text-xs font-bold shrink-0">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-white/35 text-xs">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-28 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] rounded-full bg-[#7C6EF7]/6 blur-[100px]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-[var(--accent)] text-xs font-semibold uppercase tracking-[0.2em] mb-4">
              Kainodara
            </p>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Paprasta kainodara</h2>
            <p className="text-white/45 text-lg">Vienas planas — viskas įskaičiuota</p>
          </div>

          <div className="max-w-sm mx-auto">
            <div className="relative p-8 bg-gradient-to-b from-[#7C6EF7]/10 to-[var(--bg-card)] border border-[#7C6EF7]/25 rounded-3xl shadow-2xl shadow-[#7C6EF7]/10 glow-accent">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-full uppercase tracking-wide">
                  Pro
                </span>
              </div>

              <div className="text-center mb-8">
                <div className="flex items-end justify-center gap-1">
                  <span className="text-6xl font-extrabold">€10</span>
                  <span className="text-white/40 mb-2">/mėn.</span>
                </div>
                <p className="text-white/40 text-sm mt-2">
                  Pirmos 7 dienos nemokamai · Atšaukti bet kada
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {PRICING_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-white/55">
                    <CheckCircle className="w-4 h-4 text-[var(--success)] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Social proof */}
              <div className="mb-6 p-3 bg-white/4 rounded-xl border border-white/6 flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-[var(--success)] shrink-0" />
                <p className="text-xs text-white/50">
                  Vartotojai vidutiniškai sutaupo <span className="text-white font-semibold">4 val/sav</span> darbo paieškoje
                </p>
              </div>

              <Link
                href="/onboarding"
                className="block w-full py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl text-center transition text-lg glow-accent"
              >
                Get Started Now
              </Link>
              <p className="text-center text-xs text-white/30 mt-3">
                7 dienos nemokamai · Nereikia korteles iš karto
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-28">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-xs font-semibold uppercase tracking-[0.2em] mb-4">
            DUK
          </p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Dažni klausimai</h2>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.q} {...item} />
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="grid sm:grid-cols-4 gap-8 mb-10">
            <div className="sm:col-span-2">
              <span className="font-extrabold text-xl tracking-tight block mb-3">
                <span className="text-[var(--accent)]">Gauk</span>Darba
              </span>
              <p className="text-white/35 text-sm leading-relaxed max-w-xs">
                AI darbo paieška Lietuvoje. Skanuojame 5 portalus kasdien ir siunčiame tik
                jums tinkančius pasiūlymus.
              </p>
            </div>
            <div>
              <p className="font-semibold text-sm mb-4">Produktas</p>
              <ul className="space-y-2 text-sm text-white/35">
                <li><a href="#how-it-works" className="hover:text-white transition">Kaip veikia</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Kainodara</a></li>
                <li><a href="#faq" className="hover:text-white transition">DUK</a></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-sm mb-4">Paskyra</p>
              <ul className="space-y-2 text-sm text-white/35">
                <li><Link href="/onboarding" className="hover:text-white transition">Registracija</Link></li>
                <li><Link href="/login" className="hover:text-white transition">Prisijungimas</Link></li>
                <li><Link href="/dashboard" className="hover:text-white transition">Valdymo skydelis</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/25 text-sm">
              © {new Date().getFullYear()} GaukDarba. Visos teisės saugomos.
            </p>
            <p className="text-white/20 text-xs">
              Sukurta Lietuvoje 🇱🇹
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
