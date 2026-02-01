import { secret } from 'encore.dev/config'

export const PRIVY_APP_ID = secret('PRIVY_APP_ID')()
export const PRIVY_APP_SECRET = secret('PRIVY_APP_SECRET')()
export const PRIVY_AUTHORIZATION_PRIVATE_KEY = secret('PRIVY_AUTHORIZATION_PRIVATE_KEY')()
export const SOLANA_RPC_URL = secret('SOLANA_RPC_URL')()
export const MASTER_PRIVATE_KEY = secret('MASTER_PRIVATE_KEY')()

// Creator API configuration
export const CREATOR_API_URL = 'http://localhost:1337'
export const DEFAULT_USERNAME = 'zeus'
export const INITIAL_LIQUIDITY = 10000000
