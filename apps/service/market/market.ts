import { api } from 'encore.dev/api'
import { connection, pnp, privy } from './libs'
import { AuthorizationContext, LinkedAccountEmbeddedWallet } from '@privy-io/node'
import { PRIVY_AUTHORIZATION_PRIVATE_KEY } from './secrets'
import { PublicKey, SystemProgram, VersionedTransaction, TransactionMessage, LAMPORTS_PER_SOL } from '@solana/web3.js'

export const sendTx = api(
  { expose: true, method: 'POST', path: '/market/create-market' },
  async ({ userId }: { userId: string }): Promise<{ message: string }> => {
    try {
      const user = await privy.users()._get(userId)
      console.log('user', user)
      const walletsWithSessionSigners = user.linked_accounts.filter(
        (account) => account.type === 'wallet' && 'id' in account && account.delegated
      )
      const authorizationContext: AuthorizationContext = {
        authorization_private_keys: [PRIVY_AUTHORIZATION_PRIVATE_KEY],
      }

      const wallet = user.linked_accounts.find(
        (account) => account.type === 'wallet' && 'id' in account && account.delegated
      )

      if (!wallet || !('id' in wallet) || !('public_key' in wallet) || !('address' in wallet)) {
        throw new Error('No wallet found')
      }

      const walletId = wallet.id
      if (!walletId || !wallet.address) {
        throw new Error('Wallet information is incomplete')
      }

      // Send tx
      // const instruction = SystemProgram.transfer({
      //   fromPubkey: new PublicKey(wallet.address),
      //   toPubkey: new PublicKey('Eun7wgsfwX8djVXmKZDcjwCVPWw9BzkbN6fXGdNoAatp'),
      //   lamports: LAMPORTS_PER_SOL * 0.1,
      // })

      // const { blockhash } = await connection.getLatestBlockhash()

      // const message = new TransactionMessage({
      //   payerKey: new PublicKey(wallet.address),
      //   instructions: [instruction],
      //   recentBlockhash: blockhash,
      // })
      // const transaction = new VersionedTransaction(message.compileToV0Message())

      // const { hash } = await privy
      //   .wallets()
      //   .solana()
      //   .signAndSendTransaction(walletId, {
      //     caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', // Devnet
      //     transaction: Buffer.from(transaction.serialize()).toString('base64'),
      //     sponsor: true,
      //     authorization_context: authorizationContext,
      //   })
      // console.log('hash', hash)

      // Prepare market creation instruction
      const createRes = await pnp.createMarketWithCustomOracle({
        question: 'aus!',
        initialLiquidity: BigInt(10000000), // 10 USDC
        endTime: BigInt(Math.floor(Date.now() / 1000) + 10 * 60), // 1 minute
        collateralMint: new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'), // USDC
        settlerAddress: new PublicKey(wallet.address),
        yesOddsBps: 5000,
      })

      console.log('createRes', createRes.signature)
    } catch (error) {
      console.log(`Token verification failed with error ${error}.`)
    }

    return { message: 'tx sent' }
  }
)
