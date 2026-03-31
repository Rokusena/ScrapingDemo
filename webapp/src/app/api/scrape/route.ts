import { NextResponse, type NextRequest } from 'next/server'

const SCRAPE_SECRET = process.env.SCRAPE_SECRET
const PIPELINE_API_URL = process.env.PIPELINE_API_URL

/**
 * POST /api/scrape
 * Protected with x-scrape-secret header.
 * Triggers all scrapers via the Python pipeline API.
 * Called by Vercel Cron at 3am UTC (6am Lithuanian time).
 */
export async function POST(request: NextRequest) {
  // Vercel Cron sends: Authorization: Bearer {CRON_SECRET}
  // Manual calls send: x-scrape-secret: {SCRAPE_SECRET}
  const manualSecret = request.headers.get('x-scrape-secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!SCRAPE_SECRET || (manualSecret !== SCRAPE_SECRET && bearerSecret !== SCRAPE_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!PIPELINE_API_URL) {
    return NextResponse.json({ error: 'PIPELINE_API_URL not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`${PIPELINE_API_URL}/run-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': process.env.API_SECRET ?? '',
      },
      signal: AbortSignal.timeout(30_000), // 30s to start the job; pipeline runs async
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: 'Pipeline error', detail: text },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
