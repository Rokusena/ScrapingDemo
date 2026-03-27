import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

const CV_EXTRACT_PROMPT = `Iš pateikto CV teksto ištrauk šią informaciją JSON formatu:

{
  "desired_position": "pagrindinė pozicija kurią kandidatas siekia arba atitinka",
  "skills": "įgūdžiai atskirti kableliais (pvz. React, JavaScript, TypeScript, CSS, HTML)",
  "experience_level": "junior | mid | senior",
  "languages": ["Lietuvių", "Anglų"],
  "summary_bullets": [
    "3 metai React/TypeScript patirties fintech sektoriuje",
    "Dalyvavo 5+ projektų kūrime naudojant Next.js",
    "Patirtis dirbant Agile/Scrum komandose"
  ]
}

TAISYKLĖS:
- skills: tik techniniai įgūdžiai, atskirti kableliais
- experience_level: junior (<2m darbo patirties), mid (2-5m), senior (5+m)
- summary_bullets: 3-5 punktai, kiekvienas 1 sakinys
- languages: kalbos kurias kandidatas moka
- Jei CV nenurodyta — palik tuščią arba "Nenurodyta"
- Grąžink TIK JSON, be jokio papildomo teksto

CV TEKSTAS:
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
          { role: 'system', content: 'Tu esi CV analizės asistentas. Grąžink TIK JSON, be jokio papildomo teksto.' },
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

    return NextResponse.json({ extracted })
  } catch (err) {
    console.error('CV AI extraction error:', err)
    return NextResponse.json(
      { error: `AI analizė nepavyko: ${err instanceof Error ? err.message : 'nežinoma klaida'}` },
      { status: 500 }
    )
  }
}
