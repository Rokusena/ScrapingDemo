import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'
import DashboardNav from './DashboardNav'
import DashboardTopbar from './DashboardTopbar'

// ─── Dashboard CSS ────────────────────────────────────────────────────────────

const CSS = `
:root {
  --ink:        #0c0c0a; --ink-2: #2a2a27; --ink-3: #55554f; --ink-4: #86867e;
  --paper:      #f6f4ee; --paper-2: #efece3; --paper-3: #e6e2d5;
  --line:       #d9d5c6; --line-2: #c3beab;
  --accent:     #1f4d3d; --accent-ink: #f6f4ee; --accent-2: #d7f26a;
  --amber:      #c47d2b; --red: #b54a2c;
  --font-display: "Instrument Serif","Times New Roman",serif;
  --font-sans:    "Inter Tight",Inter,system-ui,sans-serif;
  --font-mono:    "JetBrains Mono",ui-monospace,Menlo,monospace;
}
.db-root *, .db-root *::before, .db-root *::after { box-sizing: border-box; }
.db-root { font-family: var(--font-sans); background: var(--paper); color: var(--ink);
  -webkit-font-smoothing: antialiased; font-feature-settings: "ss01","cv11"; line-height: 1.45; }
.db-root a { color: inherit; text-decoration: none; }
.db-root button { font-family: inherit; cursor: pointer; border: none; background: none; padding: 0; }

/* Shell */
.db-shell { display: flex; min-height: 100vh; }

/* Sidebar */
.db-side { width: 244px; flex-shrink: 0; border-right: 1px solid var(--line);
  background: var(--paper-2); display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh; }
.db-side-head { padding: 22px 22px 18px; border-bottom: 1px solid var(--line); }
.db-logo { display: flex; align-items: center; gap: 8px;
  font-family: var(--font-display); font-size: 22px; font-style: italic; letter-spacing: -0.02em; }
.db-logo .db-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); transform: translateY(-2px); }
.db-nav { padding: 16px 12px; display: flex; flex-direction: column; gap: 2px; }
.db-link { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 8px;
  font-size: 13.5px; color: var(--ink-3);
  transition: background .15s, color .15s; position: relative; }
.db-link:hover { background: color-mix(in oklab, var(--paper-3) 70%, transparent); color: var(--ink); }
.db-link.active { background: var(--ink); color: var(--paper); }
.db-link-ico { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; opacity: .75; flex-shrink: 0; }
.db-link-badge { font-family: var(--font-mono); font-size: 10.5px; padding: 2px 7px;
  border-radius: 999px; background: var(--accent-2); color: var(--ink); font-weight: 500; }
.db-today { margin: 8px 14px; padding: 14px; background: var(--ink); color: var(--paper);
  border-radius: 10px; position: relative; overflow: hidden; }
.db-today::before { content: ""; position: absolute; top: -30px; right: -30px; width: 100px; height: 100px;
  background: radial-gradient(closest-side, color-mix(in oklab, var(--accent-2) 22%, transparent), transparent); }
.db-today .k { font-family: var(--font-mono); font-size: 10px; letter-spacing: .12em;
  text-transform: uppercase; color: rgba(246,244,238,.55); margin-bottom: 8px; position: relative; }
.db-today .v { font-family: var(--font-display); font-size: 32px; letter-spacing: -.02em;
  line-height: 1; position: relative; }
.db-today .s { font-family: var(--font-mono); font-size: 11px; color: var(--accent-2);
  margin-top: 6px; position: relative; }
.db-side-foot { margin-top: auto; padding: 14px; border-top: 1px solid var(--line);
  display: flex; align-items: center; gap: 10px; }
.db-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--ink); color: var(--paper);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-size: 14px; font-style: italic; flex-shrink: 0; }
.db-user-email { flex: 1; font-size: 12.5px; color: var(--ink-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Main */
.db-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.db-topbar { position: sticky; top: 0; z-index: 20;
  background: color-mix(in oklab, var(--paper) 90%, transparent);
  backdrop-filter: blur(12px); border-bottom: 1px solid var(--line);
  padding: 14px 32px; display: flex; align-items: center; justify-content: space-between; }
.db-crumb { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;
  color: var(--ink-3); text-transform: uppercase; }
.db-crumb .sep { color: var(--line-2); margin: 0 8px; }
.db-crumb .cur { color: var(--ink); }
.db-topbar-right { display: flex; align-items: center; gap: 10px; }
.db-scan-chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px 6px 8px;
  border: 1px solid var(--line); border-radius: 999px;
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
  background: color-mix(in oklab, var(--paper) 70%, white); }
.db-scan-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
  animation: dbpulse 2s infinite; flex-shrink: 0; }
@keyframes dbpulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 60%, transparent); }
  70%  { box-shadow: 0 0 0 8px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.db-icon-btn { width: 34px; height: 34px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--ink-3); border: 1px solid var(--line); background: transparent;
  transition: border-color .15s, color .15s; }
.db-icon-btn:hover { color: var(--ink); border-color: var(--line-2); }
.db-content { padding: 36px 32px 80px; width: 100%; }

/* Page hero */
.db-page-hero { display: grid; grid-template-columns: 1.4fr 1fr; gap: 40px; align-items: end; margin-bottom: 36px; }
@media (max-width: 920px) { .db-page-hero { grid-template-columns: 1fr; } }
.db-page-hero h1 { font-family: var(--font-display); font-weight: 400;
  font-size: clamp(44px, 5.4vw, 72px); letter-spacing: -0.022em; line-height: 1; margin: 14px 0 16px; }
.db-page-hero h1 .ital { font-style: italic; color: var(--accent); }
.db-page-lede { font-size: 15px; color: var(--ink-2); max-width: 520px; margin: 0; }
.db-page-lede .pill { display: inline-block; font-family: var(--font-mono); font-size: 11px;
  padding: 2px 7px; background: var(--ink); color: var(--paper); border-radius: 4px; margin: 0 2px; }
.db-hero-numbers { display: grid; grid-template-columns: repeat(3,1fr); border-left: 1px solid var(--line); }
.db-hero-cell { padding: 14px 18px; border-right: 1px solid var(--line); }
.db-hero-cell:last-child { border-right: none; }
.db-hero-k { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3); margin-bottom: 8px; }
.db-hero-v { font-family: var(--font-display); font-size: 40px; line-height: 1; letter-spacing: -0.02em; }
.db-hero-v.accent { color: var(--accent); }
.db-hero-sub { font-family: var(--font-mono); font-size: 11px; color: var(--ink-4); margin-top: 6px; }
.db-hero-delta { color: var(--accent); }

/* Prefs bar */
.db-prefs { background: var(--paper-2); border: 1px solid var(--line); border-radius: 14px;
  padding: 18px 22px; margin-bottom: 26px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.db-prefs-kicker { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3); margin-bottom: 2px; }
.db-prefs-name { font-family: var(--font-display); font-size: 22px; letter-spacing: -0.01em; margin-top: 2px; }
.db-prefs-tags { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; }
.db-prefs-tag { font-family: var(--font-mono); font-size: 12px; padding: 4px 10px;
  background: white; border: 1px solid var(--line); border-radius: 999px; color: var(--ink-2); }
.db-prefs-tag .k { color: var(--ink-4); margin-right: 6px; }
.db-edit { font-size: 13px; color: var(--ink-3); display: inline-flex; gap: 6px; align-items: center;
  padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px;
  transition: border-color .15s, color .15s; }
.db-edit:hover { border-color: var(--ink-3); color: var(--ink); }

/* Section head */
.db-section-head { display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; flex-wrap: wrap; gap: 14px; }
.db-section-title { font-family: var(--font-display); font-size: 30px; letter-spacing: -0.018em;
  line-height: 1; font-weight: 400; }
.db-section-title .ct { color: var(--ink-4); font-family: var(--font-mono); font-size: 14px;
  margin-left: 14px; letter-spacing: 0; }

/* Filters */
.db-filters { display: flex; gap: 2px; background: var(--paper-2); border: 1px solid var(--line);
  border-radius: 10px; padding: 3px; }
.db-filter-btn { padding: 7px 14px; border-radius: 7px; font-size: 13px; color: var(--ink-3);
  font-weight: 500; display: inline-flex; align-items: center; gap: 8px;
  transition: background .15s, color .15s; }
.db-filter-btn .c { font-family: var(--font-mono); font-size: 11px; padding: 1px 6px;
  border-radius: 999px; background: var(--paper-3); color: var(--ink-3); }
.db-filter-btn:hover { color: var(--ink); }
.db-filter-btn.active { background: var(--ink); color: var(--paper); }
.db-filter-btn.active .c { background: var(--accent-2); color: var(--ink); }

/* Match grid */
.db-matches { display: grid; grid-template-columns: repeat(auto-fill,minmax(340px,1fr)); gap: 16px; }

/* Match card */
.db-card { background: white; border: 1px solid var(--line); border-radius: 14px; padding: 20px;
  display: flex; flex-direction: column; gap: 14px; position: relative;
  transition: border-color .15s, transform .15s, box-shadow .15s; }
.db-card:hover { border-color: var(--ink-3); transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(12,12,10,.04); }
.db-card.high { border-top: 3px solid var(--accent); }
.db-card.mid  { border-top: 3px solid var(--amber); }
.db-card.low  { border-top: 3px solid var(--line-2); }
.db-card-top { display: flex; align-items: flex-start; gap: 14px; justify-content: space-between; }
.db-card-title { font-weight: 600; font-size: 15.5px; line-height: 1.25;
  letter-spacing: -0.005em; margin-bottom: 4px; }
.db-card.is-new .db-card-title::after {
  content: "NEW"; display: inline-block; font-family: var(--font-mono); font-size: 9px;
  vertical-align: middle; padding: 2px 5px; margin-left: 8px;
  background: var(--accent-2); color: var(--ink); border-radius: 3px;
  letter-spacing: 0.1em; transform: translateY(-2px); }
.db-card-company { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-3); letter-spacing: .01em; }
.db-score { flex-shrink: 0; text-align: right; display: flex; flex-direction: column;
  align-items: flex-end; gap: 2px; min-width: 60px; }
.db-score .n { font-family: var(--font-display); font-size: 40px; line-height: .9; letter-spacing: -0.02em; }
.db-card.high .db-score .n { color: var(--accent); }
.db-card.mid  .db-score .n { color: var(--amber); }
.db-card.low  .db-score .n { color: var(--ink-3); }
.db-score .l { font-family: var(--font-mono); font-size: 10px; color: var(--ink-4); letter-spacing: .08em; }
.db-card-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.db-chip { font-family: var(--font-mono); font-size: 11.5px; padding: 3px 8px;
  background: var(--paper-2); border: 1px solid var(--line); border-radius: 6px; color: var(--ink-2); }
.db-chip .k { color: var(--ink-4); margin-right: 4px; }
.db-reason { background: var(--paper-2); border-left: 2px solid var(--accent); padding: 10px 14px;
  color: var(--ink-2); line-height: 1.55; border-radius: 0 6px 6px 0;
  font-family: var(--font-display); font-style: italic; font-size: 15.5px; letter-spacing: -0.005em; }
.db-card.mid .db-reason { border-left-color: var(--amber); }
.db-card.low .db-reason { border-left-color: var(--line-2); }
.db-card-foot { display: flex; align-items: center; justify-content: space-between;
  margin-top: auto; padding-top: 12px; border-top: 1px solid var(--line); }
.db-foot-left { display: flex; gap: 12px; align-items: center;
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-4); }
.db-foot-actions { display: flex; gap: 6px; }
.db-ia { width: 28px; height: 28px; border-radius: 6px; display: inline-flex;
  align-items: center; justify-content: center; color: var(--ink-3);
  border: 1px solid var(--line); transition: all .15s; font-size: 13px; }
.db-ia:hover { color: var(--ink); border-color: var(--ink-3); background: var(--paper-2); }
.db-ia.primary { background: var(--ink); color: var(--paper); border-color: var(--ink);
  width: auto; padding: 0 14px; font-size: 12px; font-weight: 500;
  font-family: var(--font-sans); letter-spacing: -.005em; gap: 6px; }
.db-ia.primary:hover { background: #1e1e1a; }

/* Today log */
.db-log { margin-top: 48px; padding: 24px; background: var(--ink); color: var(--paper);
  border-radius: 14px; display: grid; grid-template-columns: 260px 1fr; gap: 32px; }
@media (max-width: 820px) { .db-log { grid-template-columns: 1fr; } }
.db-log-title { font-family: var(--font-display); font-size: 30px; letter-spacing: -0.015em; line-height: 1.05; }
.db-log-title .acc { color: var(--accent-2); font-style: italic; }
.db-log-kicker { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .14em;
  text-transform: uppercase; color: rgba(246,244,238,.55); margin-bottom: 12px; }
.db-log-note { margin-top: 14px; font-size: 13px; color: rgba(246,244,238,.6); line-height: 1.5; }
.db-log-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.db-log-row { display: grid; grid-template-columns: 80px 80px 1fr; font-family: var(--font-mono);
  font-size: 12px; color: rgba(246,244,238,.65); gap: 14px; padding: 4px 0;
  border-bottom: 1px dashed rgba(255,255,255,.08); }
.db-log-row .tag { color: var(--accent-2); }
.db-log-row .tag.skip { color: rgba(246,244,238,.35); }
.db-log-row.hit .msg { color: var(--paper); }

/* Empty state */
.db-empty { padding: 80px 0; text-align: center; border: 1px dashed var(--line-2); border-radius: 14px; }
.db-empty p { color: var(--ink-3); }

/* Responsive */
@media (max-width: 760px) {
  .db-side { display: none; }
  .db-content { padding: 22px 18px 60px; }
  .db-topbar { padding: 12px 18px; }
  .db-matches { grid-template-columns: 1fr; }
}
`

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cutoff24h = new Date(Date.now() - 86_400_000).toISOString()
  const { count: newCount } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('matched_at', cutoff24h)
  const newMatchCount = newCount ?? 0

  const initial = (user.email ?? 'U').charAt(0).toUpperCase()


  return (
    <div className="db-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="db-shell">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="db-side">
          <div className="db-side-head">
            <Link href="/dashboard" className="db-logo">
              <span className="db-dot" />
              gaukdarba
            </Link>
          </div>

          <DashboardNav newMatchCount={newMatchCount} />

          {newMatchCount > 0 && (
            <div className="db-today">
              <div className="k">Šiandien nauja</div>
              <div className="v">+{newMatchCount}</div>
              <div className="s">atitikimų 8+</div>
            </div>
          )}

          <div className="db-side-foot">
            <span className="db-avatar">{initial}</span>
            <span className="db-user-email">{user.email}</span>
            <SignOutButton />
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <div className="db-main">
          <DashboardTopbar />

          <div className="db-content">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
