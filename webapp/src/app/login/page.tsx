'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const CSS = `
  .lg-wrap {
    min-height: 100vh;
    background: var(--paper);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    position: relative;
  }
  .lg-back {
    position: absolute;
    top: 24px;
    left: 24px;
    font-size: 13px;
    color: var(--ink-4);
    text-decoration: none;
    transition: color .15s;
  }
  .lg-back:hover { color: var(--ink); }
  .lg-box { width: 100%; max-width: 400px; }
  .lg-logo {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 26px;
    letter-spacing: -.02em;
    margin-bottom: 32px;
    text-align: center;
    color: var(--ink);
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .lg-logo .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    transform: translateY(-2px);
    flex-shrink: 0;
  }
  .lg-card {
    background: white;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 32px;
  }
  .lg-sent { text-align: center; }
  .lg-sent-icon {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: color-mix(in oklab, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in oklab, var(--accent) 20%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    font-size: 22px;
    line-height: 1;
  }
  .lg-sent h2 {
    font-family: var(--font-display);
    font-size: 22px;
    letter-spacing: -.01em;
    margin: 0 0 8px;
    color: var(--ink);
  }
  .lg-sent p { font-size: 14px; color: var(--ink-4); line-height: 1.6; margin: 0; }
  .lg-sent-email { color: var(--ink); font-weight: 600; }
  .lg-link-btn {
    margin-top: 20px;
    font-size: 13px;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: inline-block;
  }
  .lg-h1 {
    font-family: var(--font-display);
    font-size: 22px;
    letter-spacing: -.01em;
    margin: 0 0 6px;
    color: var(--ink);
  }
  .lg-sub { font-size: 13px; color: var(--ink-4); margin: 0 0 24px; }
  .lg-google {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px;
    background: white;
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    cursor: pointer;
    transition: background .15s;
    margin-bottom: 20px;
  }
  .lg-google:hover { background: var(--paper-2); }
  .lg-google:disabled { opacity: .5; cursor: not-allowed; }
  .lg-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  .lg-divider-line { flex: 1; height: 1px; background: var(--line); }
  .lg-divider-text {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--ink-4);
    letter-spacing: .08em;
    white-space: nowrap;
  }
  .lg-label {
    display: block;
    font-size: 11px;
    font-family: var(--font-mono);
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--ink-4);
    margin-bottom: 6px;
  }
  .lg-input {
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
  .lg-input:focus { border-color: var(--accent); }
  .lg-input::placeholder { color: var(--ink-4); }
  .lg-error {
    font-size: 13px;
    color: #b33;
    background: rgba(180,50,50,.07);
    border: 1px solid rgba(180,50,50,.2);
    border-radius: 8px;
    padding: 10px 14px;
    margin-top: 10px;
  }
  .lg-btn {
    width: 100%;
    padding: 13px;
    background: var(--accent);
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    color: #f6f4ee;
    cursor: pointer;
    transition: opacity .15s;
    margin-top: 14px;
    font-family: inherit;
  }
  .lg-btn:hover { opacity: .88; }
  .lg-btn:disabled { opacity: .45; cursor: not-allowed; }
  .lg-fine { text-align: center; font-size: 11px; color: var(--ink-4); margin-top: 20px; }
`

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) setError(error.message)
      else setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepavyko išsiųsti nuorodos. Bandykite dar kartą.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lg-wrap">
        <Link href="/" className="lg-back">← Grįžti</Link>

        <div className="lg-box">
          <Link href="/" className="lg-logo">
            <span className="dot" />gaukdarba
          </Link>

          {sent ? (
            <div className="lg-card lg-sent">
              <div className="lg-sent-icon">✉</div>
              <h2>Patikrinkite el. paštą</h2>
              <p>
                Išsiuntėme prisijungimo nuorodą adresu{' '}
                <span className="lg-sent-email">{email}</span>.
                Nuoroda galioja 1 valandą.
              </p>
              <button className="lg-link-btn" onClick={() => setSent(false)}>
                ← Naudoti kitą el. paštą
              </button>
            </div>
          ) : (
            <div className="lg-card">
              <h1 className="lg-h1">Prisijungti</h1>
              <p className="lg-sub">Įveskite el. paštą — išsiųsime prisijungimo nuorodą.</p>

              <button
                type="button"
                className="lg-google"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
              >
                <GoogleIcon />
                {googleLoading ? 'Jungiamasi...' : 'Prisijungti su Google'}
              </button>

              <div className="lg-divider">
                <div className="lg-divider-line" />
                <span className="lg-divider-text">arba el. paštu</span>
                <div className="lg-divider-line" />
              </div>

              <form onSubmit={handleSubmit}>
                <label className="lg-label">El. pašto adresas</label>
                <input
                  className="lg-input"
                  type="email"
                  placeholder="jusu@epastas.lt"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                {error && <p className="lg-error">{error}</p>}
                <button className="lg-btn" type="submit" disabled={loading || !email}>
                  {loading ? 'Siunčiama...' : 'Gauti prisijungimo nuorodą'}
                </button>
              </form>

              <p className="lg-fine">Prisijungdami sutinkate su mūsų paslaugų teikimo sąlygomis.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
