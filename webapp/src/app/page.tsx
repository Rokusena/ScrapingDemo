import Link from 'next/link'
import { ArrowRight, CheckCircle, BrainCircuit, Rss, Mail } from 'lucide-react'

const steps = [
  {
    num: '01',
    icon: <BrainCircuit className="w-7 h-7 text-indigo-400" />,
    title: 'Užpildykite profilį',
    desc: 'Nurodykite pageidaujamą poziciją, įgūdžius, miestus ir minimalų atlyginimą. Užtrunka 2 minutes.',
  },
  {
    num: '02',
    icon: <Rss className="w-7 h-7 text-violet-400" />,
    title: 'AI skaituoja CVBankas kasdien',
    desc: 'Automatiškai perrenkame visus naujus CVBankas.lt skelbimus ir AI juos vertina pagal jūsų profilį.',
  },
  {
    num: '03',
    icon: <Mail className="w-7 h-7 text-purple-400" />,
    title: 'Gaukite geriausius pasiūlymus',
    desc: 'Matote tik labiausiai tinkančius darbus su AI įvertinimu ir paaiškinimu, kodėl skelbimai atitinka.',
  },
]

const features = [
  'Neribota darbo paieška',
  'AI vertinimas 1–10 balų',
  'El. pašto pranešimai',
  'Asmeninis valdymo skydelis',
  'Paaiškinimai, kodėl tinka',
  'Atnaujinama kasdien',
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-extrabold text-xl tracking-tight">
            <span className="text-indigo-400">Gauk</span>Darba
          </span>
          <Link
            href="/login"
            className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition"
          >
            Prisijungti
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-violet-950/30" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full bg-indigo-600/8 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 rounded-full border border-indigo-800/50 bg-indigo-950/40 text-indigo-300 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            AI darbo paieška · Lietuva
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.1] mb-6 tracking-tight">
            Rask darbą{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              greičiau su AI
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Kasdien automatiškai perrenkame CVBankas.lt skelbimus ir AI pagalba
            atrandame tuos, kurie labiausiai atitinka <em className="text-gray-200 not-italic">jūsų</em> profilį.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition text-lg shadow-lg shadow-indigo-900/40"
            >
              Pradėti nemokamai
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center px-8 py-4 bg-gray-800/50 hover:bg-gray-800 text-gray-300 font-semibold rounded-xl border border-gray-700 transition text-lg"
            >
              Kaip tai veikia?
            </a>
          </div>

          <p className="mt-6 text-gray-600 text-sm">Pirmosios 7 dienos nemokamai · Atšaukti galima bet kada</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Kaip tai veikia?</h2>
          <p className="text-gray-400 text-lg">Trys žingsniai iki tobulo darbo pasiūlymo</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div
              key={s.num}
              className="relative p-8 bg-gray-900/60 border border-gray-800 rounded-2xl hover:border-indigo-800/60 transition-colors"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-gray-800">{s.icon}</div>
                <span className="font-mono text-xs font-bold text-gray-600 tracking-widest">{s.num}</span>
              </div>
              <h3 className="text-lg font-bold mb-2">{s.title}</h3>
              <p className="text-gray-400 leading-relaxed text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Paprasta kainodara</h2>
          <p className="text-gray-400 text-lg">Vienas planas — viskas įskaičiuota</p>
        </div>

        <div className="max-w-sm mx-auto">
          <div className="relative p-8 bg-gradient-to-b from-indigo-950/60 to-gray-900/60 border border-indigo-700/40 rounded-2xl shadow-xl shadow-indigo-950/30">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full uppercase tracking-wide">
                Pro
              </span>
            </div>

            <div className="text-center mb-8">
              <div className="flex items-end justify-center gap-1">
                <span className="text-6xl font-extrabold">€10</span>
              </div>
              <p className="text-gray-500 mt-1">per mėnesį</p>
            </div>

            <ul className="space-y-3 mb-8">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-gray-300 text-sm">
                  <CheckCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/login"
              className="block w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-center transition text-lg"
            >
              Pradėti dabar
            </Link>
            <p className="text-center text-gray-600 text-xs mt-4">Atšaukti galima bet kada</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-extrabold text-lg">
            <span className="text-indigo-400">Gauk</span>Darba
          </span>
          <p className="text-gray-600 text-sm">© 2024 GaukDarba. Visos teisės saugomos.</p>
        </div>
      </footer>
    </div>
  )
}
