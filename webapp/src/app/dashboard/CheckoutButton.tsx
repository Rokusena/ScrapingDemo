'use client'

import { useState } from 'react'
import { Zap } from 'lucide-react'

export default function CheckoutButton() {
  const [loading, setLoading] = useState(false)

  const handleCheckout = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const { url, error } = await res.json()
      if (error) {
        alert(error)
        setLoading(false)
        return
      }
      window.location.href = url
    } catch {
      alert('Įvyko klaida. Bandykite dar kartą.')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition flex-shrink-0"
    >
      <Zap className="w-4 h-4" />
      {loading ? 'Kraunama...' : 'Aktyvuoti Pro'}
    </button>
  )
}
