import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Neprisijungęs' }, { status: 401 })
  }

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

  const owner = process.env.GITHUB_REPO_OWNER
  const repo = process.env.GITHUB_REPO_NAME
  const pat = process.env.GITHUB_PAT

  if (!owner || !repo || !pat) {
    return NextResponse.json({ error: 'GitHub configuration missing' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/matcher.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    )

    if (!res.ok) {
      const text = await res.text()
      console.error('GitHub dispatch failed:', res.status, text)
      return NextResponse.json({ error: 'Nepavyko paleisti skenavimo' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Nepavyko paleisti skenavimo' }, { status: 502 })
  }
}
