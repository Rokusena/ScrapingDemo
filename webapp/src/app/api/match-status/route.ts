import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ApplicationStatus } from '@/types/database'

const VALID_STATUSES: ApplicationStatus[] = [
  'applied', 'ignored', 'no_response', 'rejected', 'interview', 'offer',
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

  const { error } = await supabase
    .from('matches')
    .update(update)
    .eq('id', match_id)
    .eq('user_id', user.id)  // ensure user owns this match

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
