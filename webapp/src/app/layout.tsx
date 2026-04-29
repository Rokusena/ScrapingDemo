import type { Metadata } from 'next'
// @ts-ignore
import './globals.css'

export const metadata: Metadata = {
  title: 'gaukdarba — AI darbo paieška Lietuvoje',
  description:
    'AI pagrindu veikianti darbo paieška Lietuvoje. Kasdien skenuojame CVBankas.lt ir surandame skelbimus, labiausiai atitinkančius jūsų profilį.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="lt">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
