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
    icon: <BrainCircuit className="w-6 h-6 text-[#4F6EF7]" />,
    title: 'Užpildykite profilį',
    desc: 'Nurodykite pageidaujamą poziciją, įgūdžius, miestus ir minimalų atlyginimą. Užtrunka 2 minutes.',
  },
  {
    num: '02',
    icon: <Rss className="w-6 h-6 text-[#4F6EF7]" />,
    title: 'AI skaituoja kasdien',
    desc: 'Automatiškai perrenkame CVBankas.lt, CV-Online.lt, CVmarket.lt ir kitus portalus — kiekvieną dieną.',
  },
  {
    num: '03',
    icon: <Mail className="w-6 h-6 text-[#4F6EF7]" />,
    title: 'Gaukite geriausius pasiūlymus',
    desc: 'Matote tik labiausiai tinkančius darbus su AI įvertinimu 1–10 ir paaiškinimu, kodėl jie atitinka.',
  },
]

const FEATURES = [
  {
    icon: <Zap className="w-6 h-6 text-[#4F6EF7]" />,
    title: 'Greitas AI vertinimas',
    desc: 'GPT-4o modelis peržiūri kiekvieną darbo skelbimą ir įvertina, kaip gerai jis atitinka jūsų profilį. Sutaupykite valandas rankinės paieškos.',
    badge: '3 sluoksnių filtravimas',
  },
  {
    icon: <Shield className="w-6 h-6 text-[#4F6EF7]" />,
    title: '5 lietuviški portalai',
    desc: 'Skanuojame CVBankas.lt, CV-Online.lt, CVmarket.lt, Unicorns.lt ir UZT.lt — visa lietuviška darbo rinka vienoje vietoje.',
    badge: 'Pilnas aprėptis',
  },
  {
    icon: <Clock className="w-6 h-6 text-[#4F6EF7]" />,
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
    a: 'Taip. Naudojame Supabase duomenų bazę su eilutės lygio saugumo politika (RLS) — kiekvienas vartotojas mato tik savo duomenis. Slaptažodžio nereikia — autentifikacija vyksta per el. pašto nuorodą.',
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
    <div className="border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#141c33] transition"
      >
        <span className="font-medium text-sm">{q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#8892b0] shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#8892b0] shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-5 text-[#8892b0] text-sm leading-relaxed border-t border-[rgba(255,255,255,0.06)] pt-4">
          {a}
        </div>
      )}
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
    <div
      className="min-h-screen text-white"
      style={{ background: 'var(--bg-primary, #080d1a)' }}
    >
      <style>{`
        :root {
          --bg-primary: #080d1a;
          --bg-secondary: #0f1629;
          --bg-card: #141c33;
          --border: rgba(255,255,255,0.08);
          --accent: #4F6EF7;
          --accent-hover: #6B84F8;
          --text-primary: #ffffff;
          --text-secondary: #8892b0;
          --success: #43e97b;
          --warning: #f7b731;
        }
      `}</style>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[#080d1a]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-extrabold text-xl tracking-tight">
            <span className="text-[var(--accent)]">Gauk</span>Darba
          </span>
          <div className="hidden md:flex items-center gap-8 text-sm text-[var(--text-secondary)]">
            <a href="#how-it-works" className="hover:text-white transition">Kaip veikia</a>
            <a href="#pricing" className="hover:text-white transition">Kaina</a>
            <a href="#faq" className="hover:text-white transition">DUK</a>
          </div>
          <div className="flex items-center gap-3">
            {loggedIn ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl transition"
              >
                Mano skydelis
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-white border border-[var(--border)] hover:border-[rgba(255,255,255,0.2)] rounded-xl transition"
                >
                  Prisijungti
                </Link>
                <Link
                  href="/onboarding"
                  className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-xl transition"
                >
                  Pradėti
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-950/30 via-[#080d1a] to-violet-950/20" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full bg-[#4F6EF7]/6 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 rounded-full border border-[#4F6EF7]/30 bg-[#4F6EF7]/10 text-[#6B84F8] text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-[#4F6EF7] animate-pulse" />
            500+ darbo ieškantys Lietuvoje
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.08] mb-6 tracking-tight">
            Rask darbą{' '}
            <span className="bg-gradient-to-r from-[#4F6EF7] via-violet-400 to-purple-400 bg-clip-text text-transparent">
              greičiau su AI
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            Kasdien automatiškai skanuojame 5 lietuviškus darbo portalus ir AI pagalba
            atrandame tuos skelbimus, kurie labiausiai atitinka{' '}
            <em className="text-white not-italic">jūsų</em> profilį.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/onboarding"
              className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-2xl transition text-lg shadow-lg shadow-[#4F6EF7]/25"
            >
              Pradėti nemokamai
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center px-8 py-4 bg-[var(--bg-card)]/60 hover:bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-white font-semibold rounded-2xl border border-[var(--border)] hover:border-[rgba(255,255,255,0.15)] transition text-lg"
            >
              Kaip tai veikia?
            </a>
          </div>

          <p className="mt-6 text-[var(--text-secondary)] text-sm">
            Pirmosios 7 dienos nemokamai · Atšaukti galima bet kada
          </p>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-3 gap-6 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-3xl md:text-4xl font-extrabold text-white mb-1">{s.value}</p>
                <p className="text-sm text-[var(--text-secondary)]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-3">
            Kaip tai veikia
          </p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Trys žingsniai</h2>
          <p className="text-[var(--text-secondary)] text-lg">
            Iki tobulo darbo pasiūlymo per mažiau nei 2 minutes
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((s) => (
            <div
              key={s.num}
              className="relative p-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl hover:border-[#4F6EF7]/30 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 rounded-xl bg-[#4F6EF7]/10 border border-[#4F6EF7]/20 group-hover:bg-[#4F6EF7]/15 transition">
                  {s.icon}
                </div>
                <span className="font-mono text-xs font-bold text-[var(--text-secondary)] tracking-widest">
                  {s.num}
                </span>
              </div>
              <h3 className="text-lg font-bold mb-2">{s.title}</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className="bg-[var(--bg-secondary)] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-3">
              Funkcijos
            </p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Kodėl verta rinktis GaukDarba
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="p-7 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl flex flex-col gap-4 hover:border-[#4F6EF7]/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-xl bg-[#4F6EF7]/10 border border-[#4F6EF7]/20">
                    {f.icon}
                  </div>
                  <span className="text-xs font-medium text-[#4F6EF7] bg-[#4F6EF7]/10 border border-[#4F6EF7]/20 px-2.5 py-1 rounded-full">
                    {f.badge}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-base mb-2">{f.title}</h3>
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-3">
            Atsiliepimai
          </p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Ką sako vartotojai</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="p-7 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl flex flex-col gap-4"
            >
              <StarRow count={t.score} />
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed flex-1">
                &ldquo;{t.text}&rdquo;
              </p>
              <div>
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-[var(--text-secondary)] text-xs">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-[var(--bg-secondary)] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-3">
              Kainodara
            </p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Paprasta kainodara</h2>
            <p className="text-[var(--text-secondary)] text-lg">Vienas planas — viskas įskaičiuota</p>
          </div>

          <div className="max-w-sm mx-auto">
            <div className="relative p-8 bg-gradient-to-b from-[#4F6EF7]/12 to-[var(--bg-card)] border border-[#4F6EF7]/30 rounded-2xl shadow-2xl shadow-[#4F6EF7]/10">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 bg-[var(--accent)] text-white text-xs font-bold rounded-full uppercase tracking-wide">
                  Pro
                </span>
              </div>

              <div className="text-center mb-8">
                <div className="flex items-end justify-center gap-1">
                  <span className="text-6xl font-extrabold">€10</span>
                  <span className="text-[var(--text-secondary)] mb-2">/mėn.</span>
                </div>
                <p className="text-[var(--text-secondary)] text-sm mt-1">
                  Pradžia nemokamai · Atšaukti bet kada
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {PRICING_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                    <CheckCircle className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/onboarding"
                className="block w-full py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl text-center transition text-lg"
              >
                Pradėti dabar
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-3">
            DUK
          </p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Dažni klausimai</h2>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.q} {...item} />
          ))}
        </div>
      </section>

      {/* ── CTA Banner ─────────────────────────────────────────────────────── */}
      <section className="border-t border-[var(--border)] bg-gradient-to-b from-[var(--bg-secondary)] to-[#080d1a]">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
            Pradėkite AI darbo paiešką šiandien
          </h2>
          <p className="text-[var(--text-secondary)] text-lg mb-8">
            Užregistruokitės per 2 minutes. Pirmos 7 dienos nemokamai.
          </p>
          <Link
            href="/onboarding"
            className="group inline-flex items-center gap-2 px-8 py-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-2xl transition text-lg shadow-lg shadow-[#4F6EF7]/25"
          >
            Pradėti nemokamai
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid sm:grid-cols-4 gap-8 mb-10">
            <div className="sm:col-span-2">
              <span className="font-extrabold text-xl tracking-tight block mb-3">
                <span className="text-[var(--accent)]">Gauk</span>Darba
              </span>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed max-w-xs">
                AI darbo paieška Lietuvoje. Skanuojame 5 portalus kasdien ir siunčiame tik
                jums tinkančius pasiūlymus.
              </p>
            </div>
            <div>
              <p className="font-semibold text-sm mb-4">Produktas</p>
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                <li><a href="#how-it-works" className="hover:text-white transition">Kaip veikia</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Kainodara</a></li>
                <li><a href="#faq" className="hover:text-white transition">DUK</a></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-sm mb-4">Paskyra</p>
              <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                <li><Link href="/onboarding" className="hover:text-white transition">Registracija</Link></li>
                <li><Link href="/login" className="hover:text-white transition">Prisijungimas</Link></li>
                <li><Link href="/dashboard" className="hover:text-white transition">Valdymo skydelis</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[var(--border)] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[var(--text-secondary)] text-sm">
              © {new Date().getFullYear()} GaukDarba. Visos teisės saugomos.
            </p>
            <p className="text-[var(--text-secondary)] text-xs">
              Sukurta Lietuvoje 🇱🇹
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
