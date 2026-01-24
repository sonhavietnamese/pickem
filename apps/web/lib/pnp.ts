import { PNPClient } from 'pnp-sdk'
import { env } from '@/env'

export const pnp = new PNPClient(env.SOLANA_RPC_URL)
