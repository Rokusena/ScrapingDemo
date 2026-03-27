'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { JobPreferences } from '@/types/database'
import { Save, CheckCircle, Upload, Loader2 } from 'lucide-react'

const MAJOR_CITIES = ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys']
const OTHER_CITIES = [
  'Alytus', 'Marijampolė', 'Mažeikiai', 'Jonava', 'Utena',
  'Kėdainiai', 'Telšiai', 'Tauragė', 'Ukmergė', 'Visaginas',
  'Plungė', 'Kretinga', 'Palanga', 'Radviliškis', 'Druskininkai',
  'Biržai', 'Rokiškis', 'Elektrėnai', 'Jurbarkas', 'Garliava',
  'Lentvaris', 'Grigiškės', 'Naujoji Vilnia',
]
const WORK_MODES = ['Remote', 'Hybrid', 'Vietoje']
const LANGUAGES = ['Lietuvių', 'Anglų', 'Rusų']
const EXPERIENCE_LEVELS: { value: string; label: string }[] = [
  { value: '', label: 'Nepasirinkta' },
  { value: 'intern', label: 'Stažuotojas (Intern)' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
]

interface Props {
  userId: string
  initialPreferences: JobPreferences | null
}

function ToggleChip({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
        selected
          ? 'bg-indigo-600/30 border-indigo-600 text-indigo-300'
          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
      }`}
    >
      {label}
    </button>
  )
}

export default function PreferencesForm({ userId, initialPreferences }: Props) {
  const [form, setForm] = useState({
    desired_position: initialPreferences?.desired_position ?? '',
    skills: initialPreferences?.skills ?? '',
    preferred_cities: initialPreferences?.preferred_cities ?? ([] as string[]),
    preferred_salary_min: initialPreferences?.preferred_salary_min?.toString() ?? '',
    experience_level: initialPreferences?.experience_level ?? '',
    languages: initialPreferences?.languages ?? ([] as string[]),
    keywords: initialPreferences?.keywords ?? '',
    is_active: initialPreferences?.is_active ?? true,
  })

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

      if (!res.ok) {
        setError(data.error || 'Nepavyko apdoroti CV')
        return
      }

      const ext = data.extracted
      setForm((prev) => ({
        ...prev,
        desired_position: ext.desired_position || prev.desired_position,
        skills: ext.skills || prev.skills,
        experience_level: ext.experience_level || prev.experience_level,
        languages: ext.languages?.length ? ext.languages : prev.languages,
      }))
      setCvBullets(ext.summary_bullets || [])
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

  const triggerScan = async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch('/api/scan-now', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setScanResult(
          data.matches_found > 0
            ? `Rasta ${data.matches_found} atitikimų!${data.top_match ? ` Geriausias: ${data.top_match.title} (${data.top_match.score}/10)` : ''}`
            : 'Šiuo metu naujų atitikimų nerasta.'
        )
        router.refresh()
      } else {
        setScanResult(data.error || 'Skenavimas nepavyko')
      }
    } catch {
      setScanResult('Nepavyko prisijungti prie skenavimo serverio')
    } finally {
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
      preferred_salary_min: form.preferred_salary_min
        ? parseInt(form.preferred_salary_min, 10)
        : null,
      experience_level: (form.experience_level || null) as JobPreferences['experience_level'],
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
      // Auto-trigger scan after saving preferences
      triggerScan()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      {/* CV Upload */}
      <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Automatiškai užpildyti iš CV
        </label>
        <p className="text-gray-500 text-xs mb-3">
          Įkelkite PDF CV — AI automatiškai užpildys poziciją, įgūdžius ir patirtį.
        </p>
        <label className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition cursor-pointer ${
          cvLoading
            ? 'bg-gray-800 border-gray-700 text-gray-500'
            : 'bg-indigo-600/20 border-indigo-700/40 text-indigo-300 hover:bg-indigo-600/30'
        }`}>
          {cvLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {cvLoading ? 'AI analizuoja CV...' : 'Įkelti CV (PDF)'}
          <input
            type="file"
            accept=".pdf"
            onChange={handleCvUpload}
            disabled={cvLoading}
            className="hidden"
          />
        </label>

        {cvBullets && cvBullets.length > 0 && (
          <div className="mt-4 p-3 bg-gray-800 rounded-lg">
            <p className="text-xs text-gray-400 mb-2 font-medium">AI aptiko iš CV:</p>
            <ul className="space-y-1">
              {cvBullets.map((bullet, i) => (
                <li key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-indigo-400 flex-shrink-0">•</span>
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Desired position */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          Pageidaujama pozicija
        </label>
        <input
          type="text"
          placeholder="pvz. Frontend Developer, Buhalteris, Projektų vadovas"
          value={form.desired_position}
          onChange={(e) => setForm((p) => ({ ...p, desired_position: e.target.value }))}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
        />
      </div>

      {/* Skills */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          Įgūdžiai
          <span className="text-gray-500 font-normal ml-1">(atskirti kableliais)</span>
        </label>
        <input
          type="text"
          placeholder="pvz. React, TypeScript, SQL, projektų valdymas"
          value={form.skills}
          onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
        />
      </div>

      {/* Work mode */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Darbo būdas
        </label>
        <div className="flex flex-wrap gap-2">
          {WORK_MODES.map((mode) => (
            <ToggleChip
              key={mode}
              label={mode}
              selected={form.preferred_cities.includes(mode)}
              onToggle={() => toggle('preferred_cities', mode)}
            />
          ))}
        </div>
      </div>

      {/* Cities */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Pageidaujami miestai
        </label>
        <p className="text-gray-500 text-xs mb-2">Didieji miestai</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {MAJOR_CITIES.map((city) => (
            <ToggleChip
              key={city}
              label={city}
              selected={form.preferred_cities.includes(city)}
              onToggle={() => toggle('preferred_cities', city)}
            />
          ))}
        </div>
        <p className="text-gray-500 text-xs mb-2">Kiti miestai</p>
        <div className="flex flex-wrap gap-2">
          {OTHER_CITIES.map((city) => (
            <ToggleChip
              key={city}
              label={city}
              selected={form.preferred_cities.includes(city)}
              onToggle={() => toggle('preferred_cities', city)}
            />
          ))}
        </div>
      </div>

      {/* Salary */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          Minimalus atlyginimas (€, neatskaičius mokesčių)
        </label>
        <input
          type="number"
          min={0}
          step={100}
          placeholder="pvz. 2000"
          value={form.preferred_salary_min}
          onChange={(e) => setForm((p) => ({ ...p, preferred_salary_min: e.target.value }))}
          className="w-full sm:w-48 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
        />
      </div>

      {/* Experience level */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          Patirties lygis
        </label>
        <select
          value={form.experience_level}
          onChange={(e) => setForm((p) => ({ ...p, experience_level: e.target.value }))}
          className="w-full sm:w-64 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
        >
          {EXPERIENCE_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Languages */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Kalbos
        </label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <ToggleChip
              key={lang}
              label={lang}
              selected={form.languages.includes(lang)}
              onToggle={() => toggle('languages', lang)}
            />
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          Papildomi raktažodžiai
          <span className="text-gray-500 font-normal ml-1">(neprivaloma)</span>
        </label>
        <textarea
          rows={3}
          placeholder="pvz. nuotolinis darbas, startuolis, lankstus grafikas..."
          value={form.keywords}
          onChange={(e) => setForm((p) => ({ ...p, keywords: e.target.value }))}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
        />
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            form.is_active ? 'bg-indigo-600' : 'bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              form.is_active ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-gray-300">
          {form.is_active ? 'Paieška aktyvi' : 'Paieška pristabdyta'}
        </span>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold rounded-lg transition"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Saugoma...' : 'Išsaugoti nustatymus'}
        </button>

        {saved && !scanning && (
          <span className="inline-flex items-center gap-1.5 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            Išsaugota
          </span>
        )}

        <button
          type="button"
          onClick={triggerScan}
          disabled={scanning || loading}
          className="inline-flex items-center gap-2 px-5 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-60 text-white font-medium rounded-lg border border-gray-700 transition"
        >
          {scanning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <span className="text-base leading-none">&#x1F50D;</span>
          )}
          {scanning ? 'AI ieško darbo pasiūlymų...' : 'Ieškoti dabar'}
        </button>
      </div>

      {/* Scan status */}
      {scanning && (
        <div className="flex items-center gap-3 p-4 bg-indigo-950/40 border border-indigo-800/50 rounded-xl text-indigo-300 text-sm">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          AI analizuoja darbo skelbimus pagal jūsų profilį... Tai gali užtrukti iki 2 minučių.
        </div>
      )}

      {scanResult && !scanning && (
        <div className="flex items-center gap-3 p-4 bg-gray-800 border border-gray-700 rounded-xl text-gray-300 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0 text-green-400" />
          {scanResult}
        </div>
      )}
    </form>
  )
}
