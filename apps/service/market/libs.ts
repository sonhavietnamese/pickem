import { PrivyClient } from '@privy-io/node'
import { PRIVY_APP_ID, PRIVY_APP_SECRET, SOLANA_RPC_URL } from './secrets'
import { PNPClient } from 'pnp-sdk'
import { Connection } from '@solana/web3.js'

export const privy = new PrivyClient({
  appId: PRIVY_APP_ID,
  appSecret: PRIVY_APP_SECRET,
})

export const connection = new Connection(SOLANA_RPC_URL)

export const pnp = new PNPClient(SOLANA_RPC_URL)
