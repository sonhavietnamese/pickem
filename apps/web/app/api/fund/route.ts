import { connection, FUNDING_KEYPAIR, TOKEN_MINT } from '@/lib/solana'
import { getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID, transfer } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import { NextRequest, NextResponse } from 'next/server'

const MAX_TRANSFER_AMOUNT = BigInt(100_000_000)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { address } = body

    if (!address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    let recipientPubkey: PublicKey
    try {
      recipientPubkey = new PublicKey(address)
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      FUNDING_KEYPAIR,
      TOKEN_MINT,
      FUNDING_KEYPAIR.publicKey
    )

    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      FUNDING_KEYPAIR,
      TOKEN_MINT,
      recipientPubkey
    )

    const signature = await transfer(
      connection,
      FUNDING_KEYPAIR,
      senderTokenAccount.address,
      recipientTokenAccount.address,
      FUNDING_KEYPAIR,
      MAX_TRANSFER_AMOUNT,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    )

    await connection.confirmTransaction(signature, 'confirmed')

    return NextResponse.json({
      success: true,
      signature,
      amount: Number(MAX_TRANSFER_AMOUNT) / 1_000_000,
      recipient: address,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    })
  } catch (error) {
    console.error('Error funding wallet:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
