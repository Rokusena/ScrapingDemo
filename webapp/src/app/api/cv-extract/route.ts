import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

const VALID_POSITIONS = [
  // IT
  'frontend developer',
  'backend developer',
  'fullstack developer',
  'ai engineer',
  'data scientist',
  'devops engineer',
  'qa engineer',
  'project manager',
  // Non-IT
  'warehouse worker',
  'driver',
  'cleaner',
  'sales assistant',
  'accountant',
  'construction worker',
  'cook',
  'security guard',
  'manufacturing worker',
  'nurse',
  'hr specialist',
] as const

export type ValidPosition = typeof VALID_POSITIONS[number]

const CV_EXTRACT_PROMPT = `You are a CV analyzer for a Lithuanian job matching platform.
A user uploads their CV. Extract structured job search preferences from it.

Return ONLY this JSON. No explanation, no markdown, no extra text:

{
  "desired_position": "",
  "skills": "",
  "experience_level": "intern | junior | mid | senior",
  "work_format": "onsite | remote | hybrid",
  "preferred_cities": ["Vilnius"],
  "languages": ["Lietuvių"],
  "summary_bullets": ["bullet 1", "bullet 2"]
}

Rules:

1. desired_position: You MUST return EXACTLY ONE of these values (copy the exact string):
   IT roles:
   - "frontend developer"    — React, Vue, Angular, Next.js, UI developer
   - "backend developer"     — Python, Java, Node.js, .NET, API developer
   - "fullstack developer"   — Both frontend + backend, full-stack web developer
   - "ai engineer"           — AI, ML, LLM, NLP, machine learning engineer
   - "data scientist"        — Data analyst, BI analyst, data scientist
   - "devops engineer"       — DevOps, cloud, SRE, infrastructure, Kubernetes
   - "qa engineer"           — QA, tester, test automation, quality assurance
   - "project manager"       — Project manager, product manager, scrum master
   Non-IT roles:
   - "warehouse worker"      — Sandėlio darbuotojas, logistikos specialistas, ekspeditorius
   - "driver"                — Vairuotojas, kurjeris, ekspeditorius
   - "cleaner"               — Valytoja, valytojas, patalpų priežiūra
   - "sales assistant"       — Pardavėjas, konsultantas, kasininkas, vadybininkas
   - "accountant"            — Buhalteris, finansininkas, apskaita
   - "construction worker"   — Statybininkas, montuotojas, suvirintojas, elektrikas
   - "cook"                  — Virėjas, kepėjas, konditeris, padavėjas
   - "security guard"        — Apsaugos darbuotojas, sargybininkas
   - "manufacturing worker"  — Gamybos darbuotojas, operatorius, gamykla
   - "nurse"                 — Slaugytoja, gydytojas, farmaceutas, vaistininkas
   - "hr specialist"         — Personalo specialistas, įdarbinimo specialistas, HR
   Pick the CLOSEST match. Do NOT invent other values.

2. skills: Extract ALL skills as a comma-separated string — hard skills (tools, systems, certifications) AND soft skills.

3. experience_level:
   - Student or no work experience → "intern"
   - Less than 2 years total work experience → "junior"
   - 2–5 years → "mid"
   - 5+ years → "senior"

4. work_format: Default to "onsite" unless CV explicitly mentions remote work preference.

5. preferred_cities: Extract city from CV address as an array. Default to ["Vilnius"] if not specified.

6. languages: List languages the candidate knows, using these exact values: "Lietuvių", "Anglų", "Rusų".

7. summary_bullets: 3–5 short bullet points (1 sentence each) describing the candidate's experience.

CV TEXT:
`

async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  // Polyfill DOMMatrix for Node.js (pdfjs-dist requires it)
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      is2D = true; isIdentity = true;
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length === 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          this.m11 = this.a; this.m12 = this.b;
          this.m21 = this.c; this.m22 = this.d;
          this.m41 = this.e; this.m42 = this.f;
        }
      }
    } as unknown as typeof DOMMatrix;
  }

  // Set globalThis.pdfjsWorker so pdfjs uses it instead of dynamic-importing the worker file
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(globalThis as any).pdfjsWorker) {
    // @ts-expect-error — no type declarations for worker module
    const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ;(globalThis as any).pdfjsWorker = workerModule
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise

  const pageTexts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageTexts.push(text)
  }

  return pageTexts.join('\n').trim()
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Neprisijungęs' }, { status: 401 })
  }

  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Prašome įkelti PDF failą' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Failas per didelis (max 10MB)' }, { status: 400 })
  }

  // Step 1: Extract text from PDF
  let cvText: string
  try {
    const arrayBuffer = await file.arrayBuffer()
    cvText = await extractTextFromPdf(arrayBuffer)
  } catch (err) {
    console.error('PDF parse error:', err)
    return NextResponse.json(
      { error: `Nepavyko nuskaityti PDF: ${err instanceof Error ? err.message : 'nežinoma klaida'}` },
      { status: 400 }
    )
  }

  if (!cvText || cvText.length < 50) {
    return NextResponse.json(
      { error: 'Nepavyko išgauti teksto iš PDF. Patikrinkite ar failas nėra tuščias arba nuskanuotas vaizdas.' },
      { status: 400 }
    )
  }

  // Step 2: Send to OpenAI for extraction
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a CV analyzer assistant. Return ONLY valid JSON, no markdown, no explanation.' },
          { role: 'user', content: CV_EXTRACT_PROMPT + cvText.slice(0, 8000) },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('OpenAI API error:', response.status, errBody)
      return NextResponse.json({ error: 'AI analizė nepavyko' }, { status: 500 })
    }

    const data = await response.json()
    let content = data.choices?.[0]?.message?.content || ''

    // Strip markdown code fences if present
    content = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

    const extracted = JSON.parse(content)

    // Ensure desired_position is one of the valid keys; fall back to closest match
    if (!VALID_POSITIONS.includes(extracted.desired_position)) {
      const raw = (extracted.desired_position || '').toLowerCase()
      extracted.desired_position =
        VALID_POSITIONS.find((p) => raw.includes(p) || p.split(' ').some((w) => raw.includes(w))) ??
        'fullstack developer'
    }

    return NextResponse.json({ extracted })
  } catch (err) {
    console.error('CV AI extraction error:', err)
    return NextResponse.json(
      { error: `AI analizė nepavyko: ${err instanceof Error ? err.message : 'nežinoma klaida'}` },
      { status: 500 }
    )
  }
}
