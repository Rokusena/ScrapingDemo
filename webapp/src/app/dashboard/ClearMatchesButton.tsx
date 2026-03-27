'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

export default function ClearMatchesButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClear() {
    if (!confirm('Ar tikrai norite išvalyti visus atitikimus?')) return

    setLoading(true)
    try {
      const res = await fetch('/api/clear-matches', { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClear}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-red-950/40 hover:bg-red-950/60 border border-red-800/50 text-red-400 rounded-lg transition disabled:opacity-50"
    >
      <Trash2 className="w-4 h-4" />
      {loading ? 'Valoma...' : 'Išvalyti visus'}
    </button>
  )
}
