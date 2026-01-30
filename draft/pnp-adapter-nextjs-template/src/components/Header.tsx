'use client'

import { usePrivy } from '@privy-io/react-auth'

export function Header() {
  const { login, logout, authenticated, ready } = usePrivy()

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold">
            P
          </div>
          <h1 className="text-xl font-bold">PNP SDK Demo</h1>
        </div>

        {ready && (
          <button
            onClick={authenticated ? logout : login}
            className="btn-primary"
          >
            {authenticated ? 'Disconnect' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </header>
  )
}
