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

  const missing = [
    !owner && 'GITHUB_REPO_OWNER',
    !repo   && 'GITHUB_REPO_NAME',
    !pat    && 'GITHUB_PAT',
  ].filter(Boolean).join(', ')
  if (missing) {
    return NextResponse.json({ error: `Missing env vars: ${missing}` }, { status: 500 })
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
        body: JSON.stringify({ ref: 'master' }),
      }
    )

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = body.message ?? ''
      const hint =
        res.status === 401 ? 'GITHUB_PAT invalid or expired' :
        res.status === 404 ? 'Workflow/repo not found — check GITHUB_REPO_OWNER, GITHUB_REPO_NAME' :
        res.status === 422 ? 'Branch "main" not found or workflow disabled' :
        detail || 'GitHub API error'
      console.error(`GitHub dispatch ${res.status}:`, detail)
      return NextResponse.json(
        { error: `GitHub ${res.status}: ${hint}` },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('GitHub dispatch network error:', msg)
    return NextResponse.json({ error: `Network error: ${msg}` }, { status: 502 })
  }
}
