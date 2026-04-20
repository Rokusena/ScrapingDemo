'use client'

import { useState } from 'react'

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
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 20px',
        background: 'var(--accent-2)', color: 'var(--ink)',
        border: 'none', borderRadius: 10,
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
        opacity: loading ? .5 : 1, flexShrink: 0,
        transition: 'opacity .15s',
      }}
    >
      {loading ? 'Kraunama...' : 'Aktyvuoti Pro →'}
    </button>
  )
}
