import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PIPELINE_API_URL = process.env.PIPELINE_API_URL || 'http://localhost:8080'
const API_SECRET = process.env.API_SECRET || ''

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Neprisijungęs' }, { status: 401 })
  }

  // Check that user has active preferences
  const { data: prefs } = await supabase
    .from('job_preferences')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!prefs) {
    return NextResponse.json(
      { error: 'Pirmiausia užpildykite paieškos nustatymus' },
      { status: 400 }
    )
  }

  try {
    const res = await fetch(`${PIPELINE_API_URL}/scan-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}),
      },
      body: JSON.stringify({ user_id: user.id }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || 'Skenavimas nepavyko' },
        { status: res.status }
      )
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'Nepavyko prisijungti prie skenavimo serverio' },
      { status: 502 }
    )
  }
}
