import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import { Providers } from '@/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'PNP SDK Demo',
  description: 'Demo app for PNP Protocol TypeScript SDK',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#18181b',
                color: '#fff',
                border: '1px solid #27272a',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
