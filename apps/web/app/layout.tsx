import '@/styles/globals.css'
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import Providers from '@/components/providers'

const sfPro = localFont({
  src: '../assets/fonts/SFProRounded-Bold.otf',
  variable: '--font-sf-pro',
})

export const metadata: Metadata = {
  title: 'Pickem',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${sfPro.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
