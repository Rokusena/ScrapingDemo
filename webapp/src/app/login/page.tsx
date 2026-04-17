'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'

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
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
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
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
      } else {
        setSent(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepavyko išsiųsti nuorodos. Bandykite dar kartą.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      {/* Back to home */}
      <Link
        href="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Grįžti
      </Link>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block font-extrabold text-2xl">
            <span className="text-indigo-400">Gauk</span>Darba
          </Link>
        </div>

        {sent ? (
          <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl text-center">
            <div className="w-14 h-14 bg-indigo-950 rounded-full flex items-center justify-center mx-auto mb-5">
              <Mail className="w-7 h-7 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Patikrinkite el. paštą</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Išsiuntėme prisijungimo nuorodą adresu{' '}
              <span className="text-white font-medium">{email}</span>.
              Nuoroda galioja 1 valandą.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-6 text-sm text-indigo-400 hover:text-indigo-300 transition"
            >
              Naudoti kitą el. paštą
            </button>
          </div>
        ) : (
          <div className="p-8 bg-gray-900 border border-gray-800 rounded-2xl">
            <h1 className="text-2xl font-bold mb-1">Prisijungti</h1>
            <p className="text-gray-400 text-sm mb-6">
              Įveskite el. paštą — išsiųsime prisijungimo nuorodą.
            </p>

            {/* Google sign-in */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 py-3 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 font-semibold rounded-lg transition mb-5"
            >
              <GoogleIcon />
              {googleLoading ? 'Jungiamasi...' : 'Prisijungti su Google'}
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-gray-600 text-xs">arba el. paštu</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                  El. pašto adresas
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="jusu@epastas.lt"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
              >
                {loading ? 'Siunčiama...' : 'Gauti prisijungimo nuorodą'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-gray-600">
              Prisijungdami sutinkate su mūsų paslaugų teikimo sąlygomis.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
