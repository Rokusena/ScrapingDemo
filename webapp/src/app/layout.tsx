import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GaukDarba — Rask darbą greičiau su AI',
  description:
    'AI pagrindu veikianti darbo paieška Lietuvoje. Kasdien skenuojame CVBankas.lt ir surandame skelbimus, labiausiai atitinkančius jūsų profilį.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="lt" className="dark">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  )
}
