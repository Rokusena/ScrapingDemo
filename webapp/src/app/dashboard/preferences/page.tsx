import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { JobPreferences } from '@/types/database'
import PreferencesForm from './PreferencesForm'

export default async function PreferencesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: preferences } = await supabase
    .from('job_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle<JobPreferences>()

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 8 }}>
          // nustatymai
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-.01em', margin: '0 0 6px' }}>
          Paieškos nustatymai
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-4)', margin: 0 }}>
          Nurodykite ko ieškote — AI naudos šiuos nustatymus skenuodamas 5 portalus kasdien.
        </p>
      </div>

      <PreferencesForm userId={user.id} initialPreferences={preferences} />
    </div>
  )
}
