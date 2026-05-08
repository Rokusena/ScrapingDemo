import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ApplicationStatus } from '@/types/database'

const VALID_STATUSES: ApplicationStatus[] = [
  'applied', 'not_applied', 'ignored', 'no_response', 'rejected', 'interview', 'offer',
]

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { match_id, status } = await request.json()
  if (!match_id) return NextResponse.json({ error: 'match_id required' }, { status: 400 })
  if (status !== null && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const update: Record<string, unknown> = { application_status: status }
  if (status === 'applied') update.applied_at = new Date().toISOString()
  if (status === null) update.applied_at = null

  // Fetch job_id for this match so we can update user_job_actions
  const { data: matchRow, error: fetchErr } = await supabase
    .from('matches')
    .select('job_id')
    .eq('id', match_id)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !matchRow) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  const { error } = await supabase
    .from('matches')
    .update(update)
    .eq('id', match_id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep user_job_actions in sync so scraper skips re-matching actioned listings
  if (status !== null) {
    await supabase.from('user_job_actions').upsert({
      user_id: user.id,
      job_id: matchRow.job_id,
      status,
      actioned_at: new Date().toISOString(),
    }, { onConflict: 'user_id,job_id' })
  } else {
    await supabase.from('user_job_actions')
      .delete()
      .eq('user_id', user.id)
      .eq('job_id', matchRow.job_id)
  }

  return NextResponse.json({ ok: true })
}
