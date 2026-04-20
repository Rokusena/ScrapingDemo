'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Design system CSS ────────────────────────────────────────────────────────

const CSS = `
:root {
  --ink:        #0c0c0a;
  --ink-2:      #2a2a27;
  --ink-3:      #55554f;
  --ink-4:      #86867e;
  --paper:      #f6f4ee;
  --paper-2:    #efece3;
  --paper-3:    #e6e2d5;
  --line:       #d9d5c6;
  --line-2:     #c3beab;
  --accent:     #1f4d3d;
  --accent-ink: #f6f4ee;
  --accent-2:   #d7f26a;
  --font-display: "Instrument Serif", "Times New Roman", serif;
  --font-sans:    "Inter Tight", Inter, -apple-system, system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, Menlo, monospace;
  --r-sm: 6px; --r-md: 10px; --r-lg: 14px;
}
.ld-root { box-sizing: border-box; background: var(--paper); color: var(--ink);
  font-family: var(--font-sans); font-feature-settings: "ss01","cv11";
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  line-height: 1.45; }
.ld-root *, .ld-root *::before, .ld-root *::after { box-sizing: border-box; }
.ld-root a { color: inherit; text-decoration: none; }
.ld-root button { font-family: inherit; cursor: pointer; border: none; background: none; padding: 0; }

/* Type */
.ld-display {
  font-family: var(--font-display); font-weight: 400;
  letter-spacing: -0.025em; line-height: 0.96;
  font-size: clamp(52px, 7.6vw, 120px);
}
.ld-display .ital { font-style: italic; }
.ld-display .acc  { color: var(--accent); }
.ld-kicker { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3); font-weight: 500; }
.ld-section-title { font-family: var(--font-display); font-weight: 400;
  font-size: clamp(36px, 4.2vw, 64px); letter-spacing: -0.02em; line-height: 1.02; margin: 0; }

/* Layout */
.ld-wrap { max-width: 1240px; margin: 0 auto; padding: 0 28px; }
.ld-wrap-narrow { max-width: 920px; margin: 0 auto; padding: 0 28px; }

/* Nav */
.ld-nav { position: sticky; top: 0; z-index: 50; backdrop-filter: blur(12px);
  background: color-mix(in oklab, var(--paper) 88%, transparent);
  border-bottom: 1px solid var(--line); }
.ld-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 62px; }
.ld-logo { font-family: var(--font-display); font-size: 24px; font-style: italic;
  letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; }
.ld-logo-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent);
  display: inline-block; transform: translateY(-2px); }
.ld-nav-links { display: flex; gap: 28px; font-size: 13.5px; color: var(--ink-3); }
.ld-nav-links a:hover { color: var(--ink); }
.ld-nav-cta { display: flex; align-items: center; gap: 10px; }
@media (max-width: 760px) { .ld-nav-links { display: none; } }

/* Buttons */
.ld-btn { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px;
  font-weight: 500; letter-spacing: -0.005em; padding: 10px 16px;
  border-radius: var(--r-md);
  transition: transform .12s ease, background .15s ease, color .15s ease, border-color .15s ease; }
.ld-btn-primary { background: var(--ink); color: var(--paper); border: 1px solid var(--ink); }
.ld-btn-primary:hover { transform: translateY(-1px); background: #1e1e1a; }
.ld-btn-primary .arrow { transition: transform .15s ease; }
.ld-btn-primary:hover .arrow { transform: translate(2px,0); }
.ld-btn-ghost { color: var(--ink-2); border: 1px solid var(--line); background: transparent; }
.ld-btn-ghost:hover { border-color: var(--ink-3); color: var(--ink); }
.ld-btn-accent { background: var(--accent); color: var(--accent-ink); border: 1px solid var(--accent); }
.ld-btn-accent:hover { transform: translateY(-1px); background: #173a2e; }
.ld-btn-lg { padding: 14px 22px; font-size: 15px; border-radius: 12px; }

/* Hero */
.ld-hero { padding: 60px 0 30px; position: relative; }
.ld-hero-grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 56px; align-items: end; }
@media (max-width: 900px) { .ld-hero-grid { grid-template-columns: 1fr; gap: 40px; } }
.ld-hero-badge { display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3); padding: 6px 10px 6px 8px;
  border: 1px solid var(--line); border-radius: 999px;
  background: color-mix(in oklab, var(--paper) 70%, white); margin-bottom: 28px; }
.ld-pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--accent);
  animation: ldpulse 2s infinite; }
@keyframes ldpulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 60%, transparent); }
  70%  { box-shadow: 0 0 0 8px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.ld-hero-sub { margin-top: 28px; max-width: 520px; font-size: 17.5px; line-height: 1.5;
  color: var(--ink-2); letter-spacing: -0.005em; }
.ld-hero-sub .strike { text-decoration: line-through; color: var(--ink-4); text-decoration-thickness: 1.5px; }
.ld-hero-sub .high { background: var(--accent-2); padding: 0 3px; border-radius: 3px; color: var(--ink); }
.ld-hero-ctas { display: flex; gap: 10px; align-items: center; margin-top: 32px; flex-wrap: wrap; }
.ld-hero-meta { margin-top: 18px; font-size: 12.5px; color: var(--ink-4); font-family: var(--font-mono); }
.ld-hero-meta .dot { margin: 0 8px; color: var(--line-2); }
.ld-hero-visual { position: relative; min-height: 540px; display: flex; align-items: stretch; }

/* Stats widget */
.ld-statsA { width: 100%; background: var(--ink); color: var(--paper); border-radius: 18px;
  padding: 28px; position: relative; overflow: hidden; font-feature-settings: "tnum"; }
.ld-statsA::before { content: ""; position: absolute; inset: 0;
  background: radial-gradient(60% 50% at 80% 0%, color-mix(in oklab, var(--accent-2) 18%, transparent), transparent 70%),
    linear-gradient(180deg, transparent 70%, rgba(0,0,0,.2));
  pointer-events: none; }
.ld-statsA-head { display: flex; justify-content: space-between; align-items: center;
  border-bottom: 1px solid rgba(255,255,255,.08); padding-bottom: 14px; position: relative; }
.ld-statsA-head .label { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: rgba(246,244,238,.55); }
.ld-statsA-live { display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: #d7f26a; }
.ld-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #d7f26a;
  box-shadow: 0 0 8px #d7f26a; animation: ldblink 1.6s infinite; }
@keyframes ldblink { 50% { opacity: .35; } }
.ld-statsA-counter { padding: 22px 0 10px; display: grid; grid-template-columns: 1fr 1fr;
  gap: 8px; position: relative; }
.ld-big { font-family: var(--font-display); font-size: clamp(54px, 6vw, 88px);
  line-height: 1; letter-spacing: -0.03em; font-weight: 400; }
.ld-big-match { color: var(--accent-2); }
.ld-arrow-drop { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: rgba(246,244,238,.55); margin-top: 8px; }
.ld-statsA-row { padding-top: 16px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,.08);
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; position: relative; }
.ld-cell-k { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em;
  text-transform: uppercase; color: rgba(246,244,238,.4); margin-bottom: 6px; }
.ld-cell-v { font-size: 15px; font-weight: 500; }
.ld-statsA-sources { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 6px; position: relative; }
.ld-source-chip { font-family: var(--font-mono); font-size: 11px; padding: 4px 10px;
  border: 1px solid rgba(255,255,255,.14); border-radius: 999px;
  color: rgba(246,244,238,.8); display: inline-flex; align-items: center; gap: 6px; }
.ld-source-ok { color: var(--accent-2); font-size: 12px; }
.ld-statsA-log { margin-top: 22px; font-family: var(--font-mono); font-size: 12px;
  color: rgba(246,244,238,.55); height: 78px; overflow: hidden; position: relative;
  border-top: 1px dashed rgba(255,255,255,.12); padding-top: 14px; }
.ld-log-line { line-height: 1.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ld-log-t { color: rgba(246,244,238,.35); margin-right: 10px; }
.ld-log-hit { color: var(--accent-2); }
.ld-log-skip { color: rgba(246,244,238,.35); }

/* Portals */
.ld-portals { padding: 46px 0 30px; border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line); margin-top: 70px; }
.ld-portals-grid { display: grid; grid-template-columns: auto repeat(5, 1fr);
  align-items: center; gap: 40px; }
.ld-portals-label { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3); max-width: 160px; line-height: 1.5; }
.ld-portals-item { font-family: var(--font-display); font-size: 22px; color: var(--ink-2);
  letter-spacing: -0.01em; opacity: .75; transition: opacity .2s;
  display: flex; align-items: center; justify-content: center; }
.ld-portals-item:hover { opacity: 1; }
@media (max-width: 900px) {
  .ld-portals-grid { grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
  .ld-portals-label { grid-column: 1 / -1; max-width: none; text-align: center; }
}

/* How it works */
.ld-how { padding: 120px 0 100px; border-bottom: 1px solid var(--line); }
.ld-how-head { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: end; margin-bottom: 60px; }
@media (max-width: 800px) { .ld-how-head { grid-template-columns: 1fr; } }
.ld-how-lede { font-size: 17px; color: var(--ink-2); max-width: 460px; }
.ld-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-top: 1px solid var(--line); }
.ld-step { padding: 32px 28px 30px; border-right: 1px solid var(--line); position: relative; }
.ld-step:last-child { border-right: none; }
@media (max-width: 900px) {
  .ld-steps { grid-template-columns: 1fr; }
  .ld-step { border-right: none; border-bottom: 1px solid var(--line); }
  .ld-step:last-child { border-bottom: none; }
}
.ld-step-num { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em;
  color: var(--ink-4); margin-bottom: 26px; display: flex; justify-content: space-between; align-items: center; }
.ld-step-ico { color: var(--accent); }
.ld-step h3 { font-family: var(--font-display); font-weight: 400; font-size: 30px;
  letter-spacing: -0.015em; line-height: 1.1; margin-bottom: 12px; margin-top: 0; }
.ld-step p { font-size: 14.5px; color: var(--ink-2); line-height: 1.55; max-width: 320px; margin: 0; }
.ld-step-time { margin-top: 18px; font-family: var(--font-mono); font-size: 11px;
  color: var(--ink-4); letter-spacing: 0.04em; }

/* Pricing */
.ld-pricing { padding: 120px 0; border-bottom: 1px solid var(--line); }
.ld-price-head { text-align: left; margin-bottom: 50px; max-width: 680px; }
.ld-price-head p { font-size: 17px; color: var(--ink-2); margin-top: 16px; margin-bottom: 0; }
.ld-price-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 40px; align-items: stretch; }
@media (max-width: 900px) { .ld-price-grid { grid-template-columns: 1fr; } }
.ld-price-card { background: var(--ink); color: var(--paper); border-radius: 18px; padding: 40px;
  position: relative; overflow: hidden; display: flex; flex-direction: column; }
.ld-price-card::before { content: ""; position: absolute; top: -30%; right: -20%; width: 400px; height: 400px;
  background: radial-gradient(closest-side, color-mix(in oklab, var(--accent-2) 20%, transparent), transparent);
  pointer-events: none; }
.ld-price-tag { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--accent-2); margin-bottom: 20px; }
.ld-price-big { font-family: var(--font-display); font-size: 96px; line-height: 1;
  letter-spacing: -0.03em; position: relative; z-index: 1; }
.ld-price-per { font-family: var(--font-mono); font-size: 13px; color: rgba(246,244,238,.6); margin-top: 6px; }
.ld-price-features { margin: 32px 0 0; padding: 0; list-style: none;
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px;
  border-top: 1px solid rgba(255,255,255,.1); padding-top: 24px; position: relative; }
.ld-price-features li { display: flex; gap: 8px; align-items: flex-start;
  font-size: 13.5px; color: rgba(246,244,238,.85); }
.ld-check { color: var(--accent-2); flex-shrink: 0; margin-top: 2px; }
.ld-price-cta-row { display: flex; gap: 10px; align-items: center; margin-top: 28px; flex-wrap: wrap; position: relative; }
.ld-price-foot { font-family: var(--font-mono); font-size: 11px; color: rgba(246,244,238,.5); margin-top: 14px; position: relative; }
.ld-price-side { display: flex; flex-direction: column; gap: 16px; justify-content: space-between; }
.ld-price-why { background: var(--paper-2); border: 1px solid var(--line); border-radius: 14px; padding: 28px; }
.ld-price-why h3 { font-family: var(--font-display); font-weight: 400; font-size: 26px;
  letter-spacing: -0.015em; margin-bottom: 14px; margin-top: 0; }
.ld-price-why p { font-size: 14.5px; color: var(--ink-2); line-height: 1.55; margin: 0; }
.ld-why-row { display: flex; justify-content: space-between; padding: 10px 0;
  border-bottom: 1px dashed var(--line-2); font-size: 13px; }
.ld-why-row:last-child { border-bottom: none; }
.ld-why-k { color: var(--ink-3); font-family: var(--font-mono); font-size: 12px; }
.ld-why-v { font-weight: 500; }

/* FAQ */
.ld-faq { padding: 110px 0; border-bottom: 1px solid var(--line); }
.ld-faq-grid { display: grid; grid-template-columns: 1fr 1.6fr; gap: 60px; }
@media (max-width: 820px) { .ld-faq-grid { grid-template-columns: 1fr; gap: 32px; } }
.ld-faq-list { border-top: 1px solid var(--line); }
.ld-faq-item { border-bottom: 1px solid var(--line); }
.ld-faq-q { width: 100%; display: flex; justify-content: space-between; align-items: center;
  padding: 22px 4px; text-align: left; font-family: var(--font-display); font-size: 22px;
  font-weight: 400; letter-spacing: -0.01em; color: var(--ink); transition: color .15s; }
.ld-faq-q:hover { color: var(--accent); }
.ld-faq-plus { font-family: var(--font-mono); font-size: 20px; color: var(--ink-3);
  transition: transform .2s; flex-shrink: 0; margin-left: 16px; }
.ld-faq-item.open .ld-faq-plus { transform: rotate(45deg); }
.ld-faq-a { max-height: 0; overflow: hidden; transition: max-height .28s ease;
  color: var(--ink-2); font-size: 15px; line-height: 1.6; }
.ld-faq-item.open .ld-faq-a { max-height: 400px; }
.ld-faq-a-inner { padding: 0 4px 24px; max-width: 620px; }

/* CTA strip */
.ld-cta-strip { padding: 110px 0; background: var(--paper); position: relative; overflow: hidden; }
.ld-cta-strip .ld-display { font-size: clamp(56px, 8vw, 120px); }
.ld-cta-strip .ld-hero-ctas { margin-top: 36px; }

/* Footer */
.ld-footer { background: var(--ink); color: var(--paper); padding: 60px 0 30px; }
.ld-footer-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 50px; }
@media (max-width: 800px) { .ld-footer-grid { grid-template-columns: 1fr 1fr; } }
.ld-footer .ld-logo { color: var(--paper); }
.ld-footer-desc { color: rgba(246,244,238,.55); font-size: 13.5px; max-width: 340px; margin-top: 14px; line-height: 1.55; }
.ld-footer-col-title { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: rgba(246,244,238,.5); margin-bottom: 16px; }
.ld-footer-links { padding: 0; margin: 0; list-style: none; display: grid; gap: 10px; }
.ld-footer-links a { font-size: 13.5px; color: rgba(246,244,238,.85); }
.ld-footer-links a:hover { color: var(--paper); }
.ld-footer-bot { border-top: 1px solid rgba(255,255,255,.1); padding-top: 20px;
  display: flex; justify-content: space-between; font-family: var(--font-mono);
  font-size: 11px; color: rgba(246,244,238,.5); }
`

// ─── Data ─────────────────────────────────────────────────────────────────────

const HOW_STEPS = [
  {
    num: '01', kicker: 'Upload',
    title: 'Įkelk savo CV.',
    desc: 'AI per 2 minutes išskaido tavo patirtį, stack\'ą, atlyginimo lūkesčius ir net tai, ko tu vengi. Nereikia pildyti anketų.',
    time: '≈ 90 sek.',
  },
  {
    num: '02', kicker: 'Scan',
    title: 'Mes skaitome viską.',
    desc: 'Kiekvieną rytą 06:00 LT laiku peržiūrime ~4 000 naujų skelbimų per 5 portalus. GPT-4o įvertina kiekvieną 1–10 balu.',
    time: 'Kasdien · 06:00',
  },
  {
    num: '03', kicker: 'Match',
    title: 'Tu matai tik tai, kas tinka.',
    desc: 'Gauni el. laišką su top-5 pasiūlymais, kiekvienam — paaiškinimą kodėl. Jokio scrolling, jokio šlamšto.',
    time: 'Rytas · inbox',
  },
]

const PRICING_FEATURES = [
  'Neribota AI paieška',
  '5 Lietuvos portalai',
  'Score 1–10 su paaiškinimu',
  'Kasdienės el. ataskaitos',
  'Asmeninis dashboard',
  'Filtravimas pagal miestą',
  'Atlyginimų benchmark',
  'Atšaukti bet kada',
]

const FAQ = [
  {
    q: 'Kaip AI žino, kas man tinka?',
    a: 'Įkelus CV, GPT-4o-mini išskaido 24+ signalus: tavo stack\'ą, pozicijos lygį, miestą, atlyginimo ruožą, industrijas. Kiekvienas skelbimas lyginamas su šiuo profiliu ir gauna 1–10 balų su trumpu paaiškinimu — kodėl tinka arba kur spraga.',
  },
  {
    q: 'Kokius portalus skenuojate?',
    a: 'CVBankas.lt, CV.lt, CVmarket.lt, Unicorns.lt (startuoliai) ir UZT.lt. Visos skelbimų formuluotės normalizuojamos — pamatai tą pačią struktūrą, nesvarbu iš kur skelbimas.',
  },
  {
    q: 'Kiek dažnai gaunu pranešimus?',
    a: 'Vieną laišką rytą, ~06:30. Viduje — top-5 rezultatai. Jei norisi daugiau, dashboard\'e visada rasi pilną sąrašą su filtrais.',
  },
  {
    q: 'Kas su mano CV duomenimis?',
    a: 'CV apdorojamas vieną kartą ekstrahuoti signalams, po to failas saugomas privačiame Supabase bucket\'e tik tau. Trinam per 24 val. jei atšauki paskyrą. Row-level security — niekas, išskyrus tave, nemato tavo profilio.',
  },
  {
    q: 'Ar galiu atšaukti?',
    a: 'Taip, bet kada, iš dashboard\'o. Jokio skambučio, jokių klausimų. Pirmos 7 dienos — nemokamai, kortelės nereikia iš karto.',
  },
  {
    q: 'Ar tai veikia jei nesu IT srityje?',
    a: 'Visiškai. Modelio treniravimas apima visus sektorius — logistika, finansai, marketingas, sveikata, gamyba. Jei tavo sritis yra lietuviškuose portaluose, mes ją randame.',
  },
]

// ─── Live Stats Widget ────────────────────────────────────────────────────────

function LiveStats() {
  const [scanned, setScanned] = useState(3742)
  const [matches, setMatches] = useState(17)
  const [logs, setLogs] = useState([
    { t: '11:04:02', msg: 'cvbankas.lt — Senior React Developer', hit: true, score: 9 },
    { t: '11:04:01', msg: 'cv.lt — Marketing Manager', hit: false, score: null },
    { t: '11:03:59', msg: 'unicorns.lt — Backend Engineer (Go)', hit: true, score: 8 },
    { t: '11:03:57', msg: 'cvmarket.lt — Sales Assistant', hit: false, score: null },
  ])

  useEffect(() => {
    const samples = [
      { src: 'cvbankas.lt', roles: ['Product Designer', 'DevOps Engineer', 'Junior PM', 'Staff Engineer'] },
      { src: 'cv.lt',       roles: ['Finance Analyst', 'UX Researcher', 'Data Engineer'] },
      { src: 'unicorns.lt', roles: ['Growth Lead', 'Platform Engineer', 'Full-stack Dev'] },
      { src: 'cvmarket.lt', roles: ['Support Lead', 'Account Exec', 'Ops Manager'] },
      { src: 'uzt.lt',      roles: ['HR Specialist', 'Accountant', 'Project Coordinator'] },
    ]
    const id = setInterval(() => {
      setScanned((s) => s + Math.floor(1 + Math.random() * 3))
      if (Math.random() < 0.28) setMatches((m) => m + 1)
      const s = samples[Math.floor(Math.random() * samples.length)]
      const role = s.roles[Math.floor(Math.random() * s.roles.length)]
      const hit = Math.random() < 0.35
      const now = new Date()
      const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      setLogs((prev) => [
        { t: stamp, msg: `${s.src} — ${role}`, hit, score: hit ? 6 + Math.floor(Math.random() * 4) : null },
        ...prev,
      ].slice(0, 5))
    }, 1400)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="ld-statsA">
      <div className="ld-statsA-head">
        <span className="label">Network · Live feed</span>
        <span className="ld-statsA-live">
          <span className="ld-live-dot" /> Scanning now
        </span>
      </div>

      <div className="ld-statsA-counter">
        <div>
          <div className="ld-big">{scanned.toLocaleString('en')}</div>
          <div className="ld-arrow-drop">Skelbimų peržiūrėta / jobs scanned</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="ld-big ld-big-match">{matches}</div>
          <div className="ld-arrow-drop">Tinka tau / matched for you</div>
        </div>
      </div>

      <div className="ld-statsA-row">
        <div><div className="ld-cell-k">Avg score</div><div className="ld-cell-v">8.4 / 10</div></div>
        <div><div className="ld-cell-k">Šaltinių</div><div className="ld-cell-v">5 portalai</div></div>
        <div><div className="ld-cell-k">Atnaujinta</div><div className="ld-cell-v">prieš 2 min</div></div>
      </div>

      <div className="ld-statsA-sources">
        {['cvbankas.lt', 'cv.lt', 'cvmarket.lt', 'unicorns.lt', 'uzt.lt'].map((s) => (
          <span className="ld-source-chip" key={s}>
            <span className="ld-source-ok">●</span>{s}
          </span>
        ))}
      </div>

      <div className="ld-statsA-log">
        {logs.map((l, i) => (
          <div className="ld-log-line" key={l.t + i} style={{ opacity: 1 - i * 0.2 }}>
            <span className="ld-log-t">{l.t}</span>
            <span className={l.hit ? 'ld-log-hit' : 'ld-log-skip'}>
              {l.hit ? `[MATCH ${l.score}/10]` : '[skip]'}
            </span>{' '}
            {l.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`ld-faq-item${open ? ' open' : ''}`}>
      <button className="ld-faq-q" onClick={() => setOpen((o) => !o)}>
        <span>{q}</span>
        <span className="ld-faq-plus">+</span>
      </button>
      <div className="ld-faq-a">
        <div className="ld-faq-a-inner">{a}</div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setLoggedIn(true)
    })
  }, [])

  return (
    <div className="ld-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="ld-nav">
        <div className="ld-wrap ld-nav-inner">
          <Link href="/" className="ld-logo">
            <span className="ld-logo-dot" />
            gaukdarba
          </Link>
          <div className="ld-nav-links">
            <a href="#how">Kaip veikia</a>
            <a href="#pricing">Kaina</a>
            <a href="#faq">DUK</a>
          </div>
          <div className="ld-nav-cta">
            {loggedIn ? (
              <>
                <Link href="/dashboard" className="ld-btn ld-btn-ghost" style={{ display: 'none' }}>
                  Mano skydelis
                </Link>
                <Link href="/dashboard" className="ld-btn ld-btn-primary">
                  Mano skydelis <span className="arrow">→</span>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="ld-btn ld-btn-ghost" style={{ fontSize: 13.5 }}>
                  Prisijungti
                </Link>
                <Link href="/onboarding" className="ld-btn ld-btn-primary">
                  Pradėti nemokamai <span className="arrow">→</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="ld-hero">
        <div className="ld-wrap ld-hero-grid">
          <div>
            <div className="ld-hero-badge">
              <span className="ld-pulse" />
              AI job matching · Lithuania
            </div>

            <h1 className="ld-display">
              Nustok slinkti<br />
              <span className="ital acc">CVBankas</span> valandomis.
            </h1>

            <p className="ld-hero-sub">
              Įkelk CV. Mes kasdien peržiūrime{' '}
              <span className="strike">4 187 skelbimus</span>{' '}
              <span className="high">ir siunčiam tik tuos ~5</span>, kurie tikrai tinka
              tavo profiliui — su AI įvertinimu ir paaiškinimu kodėl.
            </p>

            <div className="ld-hero-ctas">
              <Link href="/onboarding" className="ld-btn ld-btn-primary ld-btn-lg">
                Įkelk CV — 7 d. nemokamai <span className="arrow">→</span>
              </Link>
              <a href="#how" className="ld-btn ld-btn-ghost ld-btn-lg">
                Kaip tai veikia
              </a>
            </div>

            <div className="ld-hero-meta">
              ⌁ Kortelės nereikia <span className="dot">·</span> Atšaukti bet kada <span className="dot">·</span> Made in Vilnius
            </div>
          </div>

          <div className="ld-hero-visual">
            <LiveStats />
          </div>
        </div>

        {/* Portals strip */}
        <div className="ld-wrap">
          <div className="ld-portals">
            <div className="ld-portals-grid">
              <div className="ld-portals-label">Skenuojam kasdien / scanning daily</div>
              {['CVBankas', 'CV.lt', 'CVmarket', 'Unicorns', 'UZT'].map((p) => (
                <div className="ld-portals-item" key={p}>{p}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section id="how" className="ld-how">
        <div className="ld-wrap">
          <div className="ld-how-head">
            <div>
              <div className="ld-kicker" style={{ marginBottom: 14 }}>// how it works</div>
              <h2 className="ld-section-title">
                Trys žingsniai tarp<br />tavęs ir naujo darbo.
              </h2>
            </div>
            <p className="ld-how-lede">
              Daug paieškos sistemų tiesiog rodo <em>daugiau</em> skelbimų.
              Mes rodom <em>mažiau</em> — bet tikrai tavo.
            </p>
          </div>

          <div className="ld-steps">
            {HOW_STEPS.map((s) => (
              <div className="ld-step" key={s.num}>
                <div className="ld-step-num">
                  <span>{s.num} / {s.kicker}</span>
                  <span className="ld-step-ico">●</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                <div className="ld-step-time">↳ {s.time}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="ld-pricing">
        <div className="ld-wrap">
          <div className="ld-price-head">
            <div className="ld-kicker" style={{ marginBottom: 14 }}>// pricing</div>
            <h2 className="ld-section-title">
              Vienas planas.<br />Pigiau nei vienas vakarėlis.
            </h2>
            <p>
              Jei per mėnesį sutaupysi bent 2 valandas naršydamas CVBankas — tai jau grąža.
              Dauguma sutaupo daugiau.
            </p>
          </div>

          <div className="ld-price-grid">
            <div className="ld-price-card">
              <div className="ld-price-tag">Pro · monthly</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="ld-price-big">€10</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 38, color: 'rgba(246,244,238,.4)', letterSpacing: '-.02em' }}>
                  /mėn.
                </span>
              </div>
              <div className="ld-price-per">Billed monthly · VAT included · Stripe</div>

              <ul className="ld-price-features">
                {PRICING_FEATURES.map((f) => (
                  <li key={f}>
                    <svg className="ld-check" width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="ld-price-cta-row">
                <Link href="/onboarding" className="ld-btn ld-btn-lg"
                  style={{ background: 'var(--accent-2)', color: 'var(--ink)', border: '1px solid var(--accent-2)' }}>
                  Start 7-day trial <span className="arrow">→</span>
                </Link>
                <Link href="/dashboard" className="ld-btn ld-btn-lg"
                  style={{ color: 'rgba(246,244,238,.85)', border: '1px solid rgba(255,255,255,.15)' }}>
                  Pažiūrėk demo
                </Link>
              </div>
              <div className="ld-price-foot">
                No card required for trial · Cancel anytime from dashboard
              </div>
            </div>

            <div className="ld-price-side">
              <div className="ld-price-why">
                <h3>Kodėl €10?</h3>
                <p style={{ marginBottom: 18 }}>
                  GPT-4o API skambučiai + 5 portalų scraping + infra. Mes turim padengti savo
                  kaštus ir vystyti produktą — ne pumpuot ads&apos;us.
                </p>
                <div className="ld-why-row">
                  <span className="ld-why-k">AI kaštai / user</span>
                  <span className="ld-why-v">~€3.40</span>
                </div>
                <div className="ld-why-row">
                  <span className="ld-why-k">Infra + scraping</span>
                  <span className="ld-why-v">~€1.10</span>
                </div>
                <div className="ld-why-row">
                  <span className="ld-why-k">Tavo laikas</span>
                  <span className="ld-why-v">nekainuoja</span>
                </div>
              </div>
              <div className="ld-price-why">
                <h3>Kam tai netinka?</h3>
                <p>
                  Jei nesi aktyviai ieškantis darbo arba ieškai <em>pasyvių</em> galimybių —
                  palik LinkedIn atidarytą. Mes optimizuojam aktyvių ieškotojų kelionę.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section id="faq" className="ld-faq">
        <div className="ld-wrap ld-faq-grid">
          <div>
            <div className="ld-kicker" style={{ marginBottom: 14 }}>// faq</div>
            <h2 className="ld-section-title">Dažni klausimai.</h2>
            <p style={{ marginTop: 20, color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.6, maxWidth: 360, marginBottom: 0 }}>
              Nori daugiau? Rašyk —{' '}
              <a href="mailto:labas@gaukdarba.lt" style={{ textDecoration: 'underline' }}>
                labas@gaukdarba.lt
              </a>. Atsakom tą pačią dieną.
            </p>
          </div>
          <div className="ld-faq-list">
            {FAQ.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA strip ──────────────────────────────────────────────────────── */}
      <section className="ld-cta-strip">
        <div className="ld-wrap">
          <div className="ld-kicker" style={{ marginBottom: 22 }}>// last thing</div>
          <h2 className="ld-display">
            Šiandien tau tinka<br />
            <span className="ital acc">4 darbai.</span>
          </h2>
          <div className="ld-hero-ctas">
            <Link href="/onboarding" className="ld-btn ld-btn-accent ld-btn-lg">
              Įkelk CV → pamatyk juos <span className="arrow">→</span>
            </Link>
            <a href="#faq" className="ld-btn ld-btn-ghost ld-btn-lg">
              Dar abejoji?
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="ld-footer">
        <div className="ld-wrap">
          <div className="ld-footer-grid">
            <div>
              <Link href="/" className="ld-logo">
                <span className="ld-logo-dot" />
                gaukdarba
              </Link>
              <p className="ld-footer-desc">
                AI darbo paieška Lietuvai. Mes skaitom skelbimus, tu skaitai pasiūlymus.
                Built in Vilnius 🇱🇹
              </p>
            </div>
            <div>
              <div className="ld-footer-col-title">Produktas</div>
              <ul className="ld-footer-links">
                <li><a href="#how">Kaip veikia</a></li>
                <li><a href="#pricing">Kaina</a></li>
                <li><a href="#faq">DUK</a></li>
                <li><Link href="/dashboard">Demo</Link></li>
              </ul>
            </div>
            <div>
              <div className="ld-footer-col-title">Paskyra</div>
              <ul className="ld-footer-links">
                <li><Link href="/login">Prisijungti</Link></li>
                <li><Link href="/onboarding">Registruotis</Link></li>
                <li><Link href="/dashboard">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <div className="ld-footer-col-title">Kita</div>
              <ul className="ld-footer-links">
                <li><a href="#">Privatumas</a></li>
                <li><a href="#">Sąlygos</a></li>
                <li><a href="mailto:labas@gaukdarba.lt">labas@gaukdarba.lt</a></li>
              </ul>
            </div>
          </div>
          <div className="ld-footer-bot">
            <span>© 2026 gaukdarba.lt</span>
            <span>v.2026.04 · all quiet</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
