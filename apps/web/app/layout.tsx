import '@/styles/globals.css'
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import Providers from '@/components/providers'

const sfPro = localFont({
  src: [
    {
      path: '../assets/fonts/SFProRounded-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/SFProRounded-Medium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../assets/fonts/SFProRounded-Semibold.otf',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../assets/fonts/SFProRounded-Bold.otf',
      weight: '700',
      style: 'normal',
    },
  ],
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
      <body className={`${sfPro.variable} antialiased`}>{children}</body>
    </html>
  )
}
