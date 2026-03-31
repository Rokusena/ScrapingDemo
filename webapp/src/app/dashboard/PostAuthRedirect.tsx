'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Reads `gaukdarba-post-auth` from localStorage.
 * If set, redirects the user there once (e.g. back to /onboarding after magic link).
 * Clears the key immediately so it only fires once.
 */
export default function PostAuthRedirect() {
  const router = useRouter()

  useEffect(() => {
    const dest = localStorage.getItem('gaukdarba-post-auth')
    if (dest) {
      localStorage.removeItem('gaukdarba-post-auth')
      router.replace(dest)
    }
  }, [router])

  return null
}
