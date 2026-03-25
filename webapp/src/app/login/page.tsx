'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
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
            <span className="text-indigo-400">Darb</span>AI
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
            <p className="text-gray-400 text-sm mb-8">
              Įveskite el. paštą — išsiųsime prisijungimo nuorodą.
            </p>

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
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
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
