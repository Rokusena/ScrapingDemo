'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClearMatchesButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClear() {
    if (!confirm('Ar tikrai norite išvalyti visus atitikimus?')) return

    setLoading(true)
    try {
      const res = await fetch('/api/clear-matches', { method: 'DELETE' })
      if (res.ok) router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClear}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px',
        background: 'transparent',
        border: '1px solid rgba(180,40,40,.3)',
        color: 'rgba(180,40,40,.7)',
        borderRadius: 8, fontSize: 12,
        cursor: 'pointer', opacity: loading ? .5 : 1,
        transition: 'opacity .15s',
      }}
    >
      {loading ? 'Valoma...' : 'Išvalyti visus'}
    </button>
  )
}
