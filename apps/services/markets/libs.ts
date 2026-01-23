import { PrivyClient } from '@privy-io/node'
import { PRIVY_APP_ID, PRIVY_APP_SECRET, SOLANA_RPC_URL, MASTER_PRIVATE_KEY } from './secrets'
import { PNPClient } from 'pnp-sdk'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'

export const privy = new PrivyClient({
  appId: PRIVY_APP_ID,
  appSecret: PRIVY_APP_SECRET,
})

export const connection = new Connection(SOLANA_RPC_URL)
export const COLLATERAL_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr')
export const MASTER_KEYPAIR = Keypair.fromSecretKey(bs58.decode(MASTER_PRIVATE_KEY))

export const pnp = new PNPClient(SOLANA_RPC_URL, MASTER_PRIVATE_KEY)
