import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    PRIVY_APP_SECRET: z.string().min(1),
    FUNDING_PRIVATE_KEY: z.string().min(1),
    SOLANA_RPC_URL: z.url(),
    SIGNER_PRIVATE_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
    NEXT_PUBLIC_PRIVY_CLIENT_ID: z.string().startsWith('client-'),
    NEXT_PUBLIC_SIGNER_ID: z.string().min(1),
  },
  runtimeEnv: {
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    NEXT_PUBLIC_PRIVY_CLIENT_ID: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID,
    NEXT_PUBLIC_SIGNER_ID: process.env.NEXT_PUBLIC_SIGNER_ID,

    FUNDING_PRIVATE_KEY: process.env.FUNDING_PRIVATE_KEY,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    SIGNER_PRIVATE_KEY: process.env.SIGNER_PRIVATE_KEY,
  },
})
