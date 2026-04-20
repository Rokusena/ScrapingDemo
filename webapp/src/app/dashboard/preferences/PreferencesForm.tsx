'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { JobPreferences } from '@/types/database'

const CSS = `
  .pf-form { max-width: 640px; }
  .pf-section {
    background: white;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 24px;
    margin-bottom: 16px;
  }
  .pf-section-title {
    font-size: 11px;
    font-family: var(--font-mono);
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--ink-4);
    margin: 0 0 16px;
  }
  .pf-label {
    display: block;
    font-size: 11px;
    font-family: var(--font-mono);
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--ink-4);
    margin-bottom: 6px;
  }
  .pf-label .note { text-transform: none; letter-spacing: 0; font-size: 10px; margin-left: 4px; }
  .pf-sub { font-size: 12px; color: var(--ink-4); margin: -10px 0 12px; }
  .pf-input {
    width: 100%;
    padding: 11px 14px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 14px;
    color: var(--ink);
    outline: none;
    transition: border-color .15s;
    box-sizing: border-box;
    font-family: inherit;
  }
  .pf-input:focus { border-color: var(--accent); }
  .pf-input::placeholder { color: var(--ink-4); }
  .pf-textarea {
    width: 100%;
    padding: 11px 14px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 14px;
    color: var(--ink);
    outline: none;
    transition: border-color .15s;
    box-sizing: border-box;
    resize: none;
    font-family: inherit;
  }
  .pf-textarea:focus { border-color: var(--accent); }
  .pf-textarea::placeholder { color: var(--ink-4); }
  .pf-select {
    padding: 11px 14px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 14px;
    color: var(--ink);
    outline: none;
    transition: border-color .15s;
    font-family: inherit;
    cursor: pointer;
  }
  .pf-select:focus { border-color: var(--accent); }
  .pf-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .pf-chip {
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--paper-2);
    color: var(--ink-4);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all .15s;
    font-family: inherit;
  }
  .pf-chip:hover { border-color: var(--accent); color: var(--ink); }
  .pf-chip.on {
    background: color-mix(in oklab, var(--accent) 8%, transparent);
    border-color: var(--accent);
    color: var(--accent);
  }
  .pf-cities-label { font-size: 11px; color: var(--ink-4); margin: 0 0 8px; }
  .pf-cities-group { margin-bottom: 14px; }
  .pf-toggle-row { display: flex; align-items: center; gap: 12px; }
  .pf-toggle {
    position: relative;
    display: inline-flex;
    height: 24px;
    width: 44px;
    align-items: center;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    transition: background .2s;
    flex-shrink: 0;
  }
  .pf-toggle-thumb {
    display: inline-block;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: white;
    transition: transform .2s;
  }
  .pf-toggle-label { font-size: 14px; color: var(--ink); }
  .pf-field { margin-bottom: 20px; }
  .pf-field:last-child { margin-bottom: 0; }

  /* CV upload */
  .pf-cv-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--paper-2);
    color: var(--ink);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all .15s;
    font-family: inherit;
  }
  .pf-cv-btn:hover { border-color: var(--accent); }
  .pf-cv-btn:disabled { opacity: .5; cursor: not-allowed; }
  .pf-cv-bullets {
    margin-top: 14px;
    padding: 14px;
    background: var(--paper-2);
    border-radius: 10px;
    border: 1px solid var(--line);
  }
  .pf-cv-bullets-title { font-size: 11px; font-family: var(--font-mono); color: var(--ink-4); margin: 0 0 8px; }
  .pf-cv-bullet { font-size: 13px; color: var(--ink); padding: 3px 0; display: flex; gap: 8px; }
  .pf-cv-bullet::before { content: '·'; color: var(--accent); flex-shrink: 0; }
  .pf-cv-notice {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px;
    background: color-mix(in oklab, var(--amber, #c47d2b) 8%, transparent);
    border: 1px solid color-mix(in oklab, var(--amber, #c47d2b) 20%, transparent);
    border-radius: 10px;
    font-size: 13px;
    color: var(--ink);
    margin-bottom: 16px;
  }

  /* Actions */
  .pf-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .pf-btn-save {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 11px 22px;
    background: var(--accent);
    border: none; border-radius: 10px;
    color: #f6f4ee; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: opacity .15s;
    font-family: inherit;
  }
  .pf-btn-save:hover { opacity: .88; }
  .pf-btn-save:disabled { opacity: .45; cursor: not-allowed; }
  .pf-btn-scan {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 11px 22px;
    background: var(--paper-2);
    border: 1px solid var(--line); border-radius: 10px;
    color: var(--ink); font-size: 14px; font-weight: 500;
    cursor: pointer; transition: all .15s;
    font-family: inherit;
  }
  .pf-btn-scan:hover { border-color: var(--accent); }
  .pf-btn-scan:disabled { opacity: .45; cursor: not-allowed; }
  .pf-saved { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--accent); }
  .pf-error {
    font-size: 13px; color: #b33;
    background: rgba(180,50,50,.07);
    border: 1px solid rgba(180,50,50,.2);
    border-radius: 8px; padding: 10px 14px;
    margin-bottom: 12px;
  }
  .pf-scanning {
    display: flex; align-items: center; gap: 10px;
    padding: 14px;
    background: color-mix(in oklab, var(--accent) 6%, transparent);
    border: 1px solid color-mix(in oklab, var(--accent) 15%, transparent);
    border-radius: 10px; font-size: 13px; color: var(--ink);
  }
  .pf-scan-result {
    display: flex; align-items: center; gap: 10px;
    padding: 14px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 10px; font-size: 13px; color: var(--ink);
  }
  @keyframes pf-spin { to { transform: rotate(360deg); } }
  .pf-spin { animation: pf-spin .8s linear infinite; display: inline-block; }
`

const MAJOR_CITIES = ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys']
const OTHER_CITIES = [
  'Alytus', 'Marijampolė', 'Mažeikiai', 'Jonava', 'Utena',
  'Kėdainiai', 'Telšiai', 'Tauragė', 'Ukmergė', 'Visaginas',
  'Plungė', 'Kretinga', 'Palanga', 'Radviliškis', 'Druskininkai',
  'Biržai', 'Rokiškis', 'Elektrėnai', 'Jurbarkas', 'Garliava',
  'Lentvaris', 'Grigiškės', 'Naujoji Vilnia',
]
const WORK_MODES = [
  { label: 'Vietoje', value: 'onsite' },
  { label: 'Hibridinis', value: 'hybrid' },
  { label: 'Nuotolinis', value: 'remote' },
]
const LANGUAGES = ['Lietuvių', 'Anglų', 'Rusų']
const EXPERIENCE_LEVELS: { value: string; label: string }[] = [
  { value: '', label: 'Nepasirinkta' },
  { value: 'intern', label: 'Be patirties / Studentas' },
  { value: 'junior', label: 'Pradedantysis (iki 2 m.)' },
  { value: 'mid', label: 'Patyręs (2–5 m.)' },
  { value: 'senior', label: 'Ekspertas (5+ m.)' },
]

interface Props {
  userId: string
  initialPreferences: JobPreferences | null
}

export default function PreferencesForm({ userId, initialPreferences }: Props) {
  const [form, setForm] = useState({
    desired_position: initialPreferences?.desired_position ?? '',
    skills: initialPreferences?.skills ?? '',
    preferred_cities: initialPreferences?.preferred_cities ?? ([] as string[]),
    preferred_salary_min: initialPreferences?.preferred_salary_min?.toString() ?? '',
    experience_level: initialPreferences?.experience_level ?? '',
    work_format: initialPreferences?.work_format ?? '',
    languages: initialPreferences?.languages ?? ([] as string[]),
    keywords: initialPreferences?.keywords ?? '',
    is_active: initialPreferences?.is_active ?? true,
  })
  const [cvAutoFilled, setCvAutoFilled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cvLoading, setCvLoading] = useState(false)
  const [cvBullets, setCvBullets] = useState<string[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCvLoading(true)
    setError(null)
    setCvBullets(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/cv-extract', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) { setError(data.error || 'Nepavyko apdoroti CV'); return }

      const ext = data.extracted
      setForm((prev) => ({
        ...prev,
        desired_position: ext.desired_position || prev.desired_position,
        skills: ext.skills || prev.skills,
        experience_level: ext.experience_level || prev.experience_level,
        work_format: ext.work_format || prev.work_format,
        preferred_cities: ext.preferred_cities?.length ? ext.preferred_cities : prev.preferred_cities,
        languages: ext.languages?.length ? ext.languages : prev.languages,
      }))
      setCvBullets(ext.summary_bullets || [])
      setCvAutoFilled(true)
    } catch {
      setError('Nepavyko apdoroti CV failo')
    } finally {
      setCvLoading(false)
      e.target.value = ''
    }
  }

  const toggle = (key: 'preferred_cities' | 'languages', value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((x) => x !== value)
        : [...prev[key], value],
    }))
  }

  const pollScanStatus = (scanId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/scan-now?scan_id=${scanId}`)
        const data = await res.json()

        if (data.status === 'complete') {
          const result = data.result || {}
          setScanResult(
            result.matches_found > 0
              ? `Rasta ${result.matches_found} atitikimų!${result.top_match ? ` Geriausias: ${result.top_match.title} (${result.top_match.score}/10)` : ''}`
              : 'Šiuo metu naujų atitikimų nerasta.'
          )
          setScanning(false)
          router.refresh()
        } else if (data.status === 'failed') {
          setScanResult(data.result?.error || 'Skenavimas nepavyko')
          setScanning(false)
        } else {
          setTimeout(poll, 3000)
        }
      } catch {
        setScanResult('Nepavyko patikrinti skenavimo būsenos')
        setScanning(false)
      }
    }
    setTimeout(poll, 3000)
  }

  const triggerScan = async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch('/api/scan-now', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        if (data.scan_id) { pollScanStatus(data.scan_id); return }
        setScanResult(data.error || 'Skenavimas nepavyko')
        setScanning(false)
        return
      }
      pollScanStatus(data.scan_id)
    } catch {
      setScanResult('Nepavyko prisijungti prie skenavimo serverio')
      setScanning(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)

    const payload = {
      user_id: userId,
      desired_position: form.desired_position || null,
      skills: form.skills || null,
      preferred_cities: form.preferred_cities.length > 0 ? form.preferred_cities : null,
      preferred_salary_min: form.preferred_salary_min ? parseInt(form.preferred_salary_min, 10) : null,
      experience_level: (form.experience_level || null) as JobPreferences['experience_level'],
      work_format: (form.work_format || null) as JobPreferences['work_format'],
      languages: form.languages.length > 0 ? form.languages : null,
      keywords: form.keywords || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('job_preferences')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) {
      setError(error.message)
    } else {
      setSaved(true)
      router.refresh()
      triggerScan()
    }
    setLoading(false)
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <form onSubmit={handleSubmit} className="pf-form">

        {/* CV Upload */}
        <div className="pf-section">
          <p className="pf-section-title">// automatinis užpildymas</p>
          <label className="pf-label">Įkelkite CV</label>
          <p className="pf-sub">PDF CV — AI automatiškai užpildys poziciją, įgūdžius ir patirtį.</p>

          <label className="pf-cv-btn" style={cvLoading ? { opacity: .5, cursor: 'not-allowed' } : {}}>
            {cvLoading ? (
              <><span className="pf-spin">↻</span> AI analizuoja CV...</>
            ) : (
              <>⬆ Įkelti CV (PDF)</>
            )}
            <input type="file" accept=".pdf" onChange={handleCvUpload} disabled={cvLoading} style={{ display: 'none' }} />
          </label>

          {cvBullets && cvBullets.length > 0 && (
            <div className="pf-cv-bullets">
              <p className="pf-cv-bullets-title">// AI aptiko iš CV</p>
              {cvBullets.map((bullet, i) => (
                <div key={i} className="pf-cv-bullet">{bullet}</div>
              ))}
            </div>
          )}
        </div>

        {cvAutoFilled && (
          <div className="pf-cv-notice">
            <span>✏️</span>
            <span><strong>Patikrink ir pakoreguok</strong> — AI užpildė laukus pagal tavo CV.</span>
          </div>
        )}

        {/* Main fields */}
        <div className="pf-section">
          <p className="pf-section-title">// darbo pageidavimai</p>

          <div className="pf-field">
            <label className="pf-label">Pageidaujama pozicija</label>
            <input
              className="pf-input"
              type="text"
              placeholder="pvz. sandėlio darbuotojas, pardavėjas, programuotojas"
              value={form.desired_position}
              onChange={(e) => setForm((p) => ({ ...p, desired_position: e.target.value }))}
            />
          </div>

          <div className="pf-field">
            <label className="pf-label">Įgūdžiai <span className="note">(atskirti kableliais)</span></label>
            <input
              className="pf-input"
              type="text"
              placeholder="pvz. sandėlio logistika, vairavimas B kat., MS Office"
              value={form.skills}
              onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))}
            />
          </div>

          <div className="pf-field">
            <label className="pf-label">Darbo būdas</label>
            <div className="pf-chips">
              {WORK_MODES.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  className={`pf-chip${form.work_format === value ? ' on' : ''}`}
                  onClick={() => setForm((p) => ({ ...p, work_format: p.work_format === value ? '' : value }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="pf-field">
            <label className="pf-label">Pageidaujami miestai</label>
            <div className="pf-cities-group">
              <p className="pf-cities-label">Didieji miestai</p>
              <div className="pf-chips">
                {MAJOR_CITIES.map((city) => (
                  <button
                    key={city}
                    type="button"
                    className={`pf-chip${form.preferred_cities.includes(city) ? ' on' : ''}`}
                    onClick={() => toggle('preferred_cities', city)}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
            <div className="pf-cities-group">
              <p className="pf-cities-label">Kiti miestai</p>
              <div className="pf-chips">
                {OTHER_CITIES.map((city) => (
                  <button
                    key={city}
                    type="button"
                    className={`pf-chip${form.preferred_cities.includes(city) ? ' on' : ''}`}
                    onClick={() => toggle('preferred_cities', city)}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pf-field">
            <label className="pf-label">Minimalus atlyginimas <span className="note">(€, neatskaičius mokesčių)</span></label>
            <input
              className="pf-input"
              type="number"
              min={0}
              step={100}
              placeholder="pvz. 2000"
              value={form.preferred_salary_min}
              onChange={(e) => setForm((p) => ({ ...p, preferred_salary_min: e.target.value }))}
              style={{ width: 180 }}
            />
          </div>

          <div className="pf-field">
            <label className="pf-label">Patirties lygis</label>
            <select
              className="pf-select"
              value={form.experience_level}
              onChange={(e) => setForm((p) => ({ ...p, experience_level: e.target.value }))}
            >
              {EXPERIENCE_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          <div className="pf-field">
            <label className="pf-label">Kalbos</label>
            <div className="pf-chips">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={`pf-chip${form.languages.includes(lang) ? ' on' : ''}`}
                  onClick={() => toggle('languages', lang)}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <div className="pf-field">
            <label className="pf-label">Papildoma informacija <span className="note">(neprivaloma)</span></label>
            <textarea
              className="pf-textarea"
              rows={3}
              placeholder="pvz. tik 0.5 etatas, tik ryto pamaina, vairuotojo pažymėjimas būtinas..."
              value={form.keywords}
              onChange={(e) => setForm((p) => ({ ...p, keywords: e.target.value }))}
            />
          </div>

          <div className="pf-toggle-row">
            <button
              type="button"
              className="pf-toggle"
              style={{ background: form.is_active ? 'var(--accent)' : 'var(--line)' }}
              onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
            >
              <span
                className="pf-toggle-thumb"
                style={{ transform: form.is_active ? 'translateX(20px)' : 'translateX(4px)' }}
              />
            </button>
            <span className="pf-toggle-label">{form.is_active ? 'Paieška aktyvi' : 'Paieška pristabdyta'}</span>
          </div>
        </div>

        {error && <p className="pf-error">{error}</p>}

        <div className="pf-actions">
          <button type="submit" className="pf-btn-save" disabled={loading}>
            {loading ? 'Saugoma...' : '✓ Išsaugoti nustatymus'}
          </button>

          {saved && !scanning && (
            <span className="pf-saved">✓ Išsaugota</span>
          )}

          <button type="button" className="pf-btn-scan" onClick={triggerScan} disabled={scanning || loading}>
            {scanning ? <span className="pf-spin">↻</span> : '🔍'}
            {scanning ? 'AI ieško darbo pasiūlymų...' : 'Ieškoti dabar'}
          </button>
        </div>

        {scanning && (
          <div className="pf-scanning" style={{ marginTop: 12 }}>
            <span className="pf-spin" style={{ fontSize: 16 }}>↻</span>
            AI analizuoja darbo skelbimus pagal jūsų profilį... Tai gali užtrukti iki 5 minučių.
          </div>
        )}

        {scanResult && !scanning && (
          <div className="pf-scan-result" style={{ marginTop: 12 }}>
            <span style={{ color: 'var(--accent)' }}>✓</span>
            {scanResult}
          </div>
        )}
      </form>
    </>
  )
}
