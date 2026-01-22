import { getAssociatedTokenAddress } from '@solana/spl-token'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { decode } from 'bs58'
import { PNPClient } from 'pnp-sdk'

const RPC_URL = 'https://api.devnet.solana.com'

const COLLATERAL_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr')

// For write operations (with private key)
const PRIVATE_KEY = process.env.PRIVATE_KEY
const connection = new Connection(RPC_URL)
const client = new PNPClient(RPC_URL, PRIVATE_KEY)

const QUESTION = process.env.MARKET_QUESTION || 'Will this event happen? (Custom Oracle Market)'

const INITIAL_LIQUIDITY = BigInt(
  process.env.INITIAL_LIQUIDITY || '10000000' // 10 USDC (6 decimals)
)

const END_TIME = BigInt(Math.floor(Date.now() / 1000) + 1 * 60)

// Optional: Custom YES odds in basis points (100-9900). Default is 5000 (50/50)
const YES_ODDS_BPS = Number(5000)

// =====================================================

async function createMarket() {
  console.log('\n🚀 PNP SDK - Mainnet Market Creation with Custom Oracle\n')
  console.log('═'.repeat(55))

  const secretKey = PNPClient.parseSecretKey(PRIVATE_KEY || '')
  const client = new PNPClient(RPC_URL, secretKey)

  console.log('✓ Connected to Solana')
  console.log(`  Program ID: ${client.client.programId.toBase58()}`)
  console.log(`  Network: ${client.client.isDevnet ? 'DEVNET' : 'MAINNET'}`)

  if (!client.anchorMarket) {
    throw new Error('AnchorMarket module not available. Check your private key.')
  }

  const walletPubkey = client.signer!.publicKey

  // Custom oracle: use env var or default to your own wallet
  const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS ? new PublicKey(process.env.ORACLE_ADDRESS) : walletPubkey // Default: you are the oracle

  console.log('\n📋 Market Configuration:')
  console.log(`  Wallet: ${walletPubkey.toBase58()}`)
  console.log(`  Question: ${QUESTION}`)
  console.log(`  Collateral Mint: ${COLLATERAL_MINT.toBase58()}`)
  console.log(`  Initial Liquidity: ${INITIAL_LIQUIDITY.toString()} (raw units)`)
  console.log(`  End Time: ${new Date(Number(END_TIME) * 1000).toISOString()}`)
  console.log(`  🔮 Custom Oracle: ${ORACLE_ADDRESS.toBase58()}`)
  if (YES_ODDS_BPS) {
    console.log(`  YES Odds: ${YES_ODDS_BPS / 100}%`)
  }

  // Check collateral balance
  const tokenAta = await getAssociatedTokenAddress(COLLATERAL_MINT, walletPubkey)
  console.log('\n💰 Checking collateral balance...')

  try {
    const balance = await connection.getTokenAccountBalance(tokenAta)
    const balanceAmount = BigInt(balance.value.amount)
    console.log(`  Balance: ${balance.value.uiAmountString} (${balanceAmount} raw)`)

    if (balanceAmount < INITIAL_LIQUIDITY) {
      console.error(`\n❌ Insufficient balance!`)
      console.log(`  Have: ${balance.value.uiAmountString}`)
      console.log(`  Need: ${Number(INITIAL_LIQUIDITY) / 1_000_000}`)
      process.exit(1)
    }
    console.log('  ✓ Sufficient balance')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`\n❌ Token account not found: ${msg}`)
    process.exit(1)
  }

  // Create market with custom oracle
  console.log('\n🚀 Creating market with custom oracle...')

  const createRes = await client.createMarketWithCustomOracle({
    question: QUESTION,
    initialLiquidity: INITIAL_LIQUIDITY,
    endTime: END_TIME,
    collateralMint: COLLATERAL_MINT,
    settlerAddress: ORACLE_ADDRESS,
    yesOddsBps: YES_ODDS_BPS,
  })

  console.log('⏳ Confirming transaction...')
  await connection.confirmTransaction(createRes.signature)

  // Output result
  const result = {
    success: true,
    network: client.client.isDevnet ? 'devnet' : 'mainnet',
    market: createRes.market.toBase58(),
    signature: createRes.signature,
    question: QUESTION,
    customOracle: ORACLE_ADDRESS.toBase58(),
    collateralMint: COLLATERAL_MINT.toBase58(),
    initialLiquidity: INITIAL_LIQUIDITY.toString(),
    endTime: new Date(Number(END_TIME) * 1000).toISOString(),
    explorerUrl: `https://explorer.solana.com/address/${createRes.market.toBase58()}`,
    txUrl: `https://explorer.solana.com/tx/${createRes.signature}`,
  }

  console.log('\n' + '═'.repeat(55))
  console.log('✅ MARKET CREATED SUCCESSFULLY WITH CUSTOM ORACLE!')
  console.log('═'.repeat(55))
  console.log(JSON.stringify(result, null, 2))

  console.log('\n📝 Important Next Steps:')
  console.log(`  1. Call setMarketResolvable(true) within 15 minutes to enable trading`)
  console.log(`  2. Only ${ORACLE_ADDRESS.toBase58()} can resolve this market`)
  console.log(`  3. PNP's AI oracle has NO authority over this market`)
  console.log(`  4. After end time, your oracle must settle the market`)

  console.log('🔧 Setting market resolvable to TRUE...')

  const setResolvableRes = await client.setMarketResolvable(new PublicKey(createRes.market.toBase58()), true)

  console.log('✅ SUCCESS! Trading is now enabled!')
  console.log(`   TX: ${setResolvableRes.signature}`)
  console.log(`   Explorer: https://explorer.solana.com/tx/${setResolvableRes.signature}`)
}

async function fetchMarket() {
  const marketAddresses = await client.fetchMarket(new PublicKey('EciTY8DT89BvaZ7ZR9vie982WsKh4UTqZVqNKCivbcR5'))

  console.log(JSON.stringify(marketAddresses, null, 2))
}

const MARKET_CONFIGS = {
  address: 'EciTY8DT89BvaZ7ZR9vie982WsKh4UTqZVqNKCivbcR5',
}

async function settleMarket() {
  console.log('⚖️ Settling market...')

  const result = await client.settleMarket({
    market: new PublicKey('EciTY8DT89BvaZ7ZR9vie982WsKh4UTqZVqNKCivbcR5'),
    yesWinner: true,
  })

  console.log('✅ Market settled!')
  console.log(`   Winner: YES`)
  console.log(`   TX: ${result.signature}`)
}

async function placePosition() {
  const buyResult = await client.trading?.buyTokensUsdc({
    market: new PublicKey(MARKET_CONFIGS.address),
    buyYesToken: true, // true for YES, false for NO
    amountUsdc: 1, // Amount in USDC
  })

  return buyResult
}

// createMarket().catch(console.error)

// fetchMarket().catch(console.error)
// placePosition().then(console.log).catch(console.error)

// getMarketInfo(MARKET_CONFIGS.address).then(console.log).catch(console.error)

settleMarket().catch(console.error)
