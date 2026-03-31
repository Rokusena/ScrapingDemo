'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignOutButton() {
  const supabase = createClient()
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full px-3 py-2 text-sm text-[#8892b0] hover:text-white hover:bg-[#141c33] rounded-xl transition text-left"
    >
      Atsijungti
    </button>
  )
}
