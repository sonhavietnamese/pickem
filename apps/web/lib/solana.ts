import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { env } from '@/env'
import bs58 from 'bs58'

export const connection = new Connection(env.SOLANA_RPC_URL, 'confirmed')
export const TOKEN_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr') // USDV-Dev
export const FUNDING_KEYPAIR = Keypair.fromSecretKey(bs58.decode(env.FUNDING_PRIVATE_KEY)) // Funding keypair for the wallet
