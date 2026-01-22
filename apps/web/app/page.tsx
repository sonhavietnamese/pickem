'use client'

import { useLogin, usePrivy } from '@privy-io/react-auth'

export default function Page() {
  const { ready } = usePrivy()
  const { login } = useLogin({
    onComplete: async ({ user }) => {
      console.log('User logged in successfully', user)
    },
    onError: (error) => {
      console.error('Login failed', error)
    },
  })

  const handleLogin = async () => {
    login()
  }

  if (!ready) {
    return <div>Loading...</div>
  }

  return (
    <main className="flex flex-col items-center justify-center h-screen">
      <button onClick={handleLogin}>Login</button>
    </main>
  )
}
