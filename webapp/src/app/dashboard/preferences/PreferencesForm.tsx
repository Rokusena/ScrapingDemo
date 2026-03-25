'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { JobPreferences } from '@/types/database'
import { Save, CheckCircle } from 'lucide-react'

const CITIES = ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys', 'Remote']
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

  const supabase = createClient()
  const router = useRouter()

  const toggle = (key: 'preferred_cities' | 'languages', value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((x) => x !== value)
        : [...prev[key], value],
    }))
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
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
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

      {/* Cities */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Pageidaujami miestai
        </label>
        <div className="flex flex-wrap gap-2">
          {CITIES.map((city) => (
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

        {saved && (
          <span className="inline-flex items-center gap-1.5 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            Išsaugota
          </span>
        )}
      </div>
    </form>
  )
}
