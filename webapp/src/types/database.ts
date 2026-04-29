export type PlanStatus = 'free' | 'active' | 'cancelled'
export type ApplicationStatus = 'applied' | 'ignored' | 'no_response' | 'rejected' | 'interview' | 'offer'
export type ExperienceLevel = 'intern' | 'junior' | 'mid' | 'senior'
export type JobSource = 'cvbankas' | 'cvonline' | 'cvmarket' | 'unicorns' | 'uzt'
export type WorkFormat = 'remote' | 'hybrid' | 'onsite'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  stripe_customer_id: string | null
  plan_status: PlanStatus
  created_at: string
}

export interface JobPreferences {
  id: string
  user_id: string
  desired_position: string | null
  skills: string | null
  preferred_cities: string[] | null
  preferred_salary_min: number | null
  experience_level: ExperienceLevel | null
  work_format: WorkFormat | null
  languages: string[] | null
  keywords: string | null
  is_active: boolean
  updated_at: string
}

export interface RawListing {
  id: string
  job_id: string
  source: JobSource
  title: string | null
  company: string | null
  salary_raw: string | null
  location: string | null
  url: string | null
  scraped_at: string
}

export interface ListingDetails {
  id: string
  job_id: string
  description: string | null
  full_salary: string | null
  requirements: string | null
  scraped_at: string
}

export interface Match {
  id: string
  user_id: string
  job_id: string
  title_score: number | null
  detail_score: number | null
  reason: string | null
  matched_at: string
  notified: boolean
  application_status: ApplicationStatus | null
  applied_at: string | null
}

export interface MatchWithListing extends Match {
  raw_listings: RawListing | null
}

export interface ScraperRun {
  id: string
  source: JobSource
  started_at: string
  ended_at: string | null
  jobs_found: number
  jobs_inserted: number
  error: string | null
  created_at: string
}
