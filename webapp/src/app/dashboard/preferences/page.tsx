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
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Paieškos nustatymai</h1>
        <p className="text-gray-400">
          Nurodykite ko ieškote — AI naudos šiuos nustatymus skenuodamas CVBankas.lt kasdien.
        </p>
      </div>

      <PreferencesForm userId={user.id} initialPreferences={preferences} />
    </div>
  )
}
