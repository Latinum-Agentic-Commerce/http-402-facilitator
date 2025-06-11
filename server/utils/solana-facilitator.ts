// utils/solana-facilitator.ts

import { Connection } from '@solana/web3.js'
import base64js from 'base64-js'

const SOLANA_RPC_URL = 'https://api.devnet.solana.com'
const connection = new Connection(SOLANA_RPC_URL, 'confirmed')

export async function validateSolanaPayment({
    signedTransactionB64,
    expectedRecipient,
    expectedAmountLamports,
}: {
    signedTransactionB64: string
    expectedRecipient: string
    expectedAmountLamports: number | string
}): Promise<{ allowed: boolean; txid?: string; error?: string }> {
    try {
        console.log('[Solana] 📥 Validating payment request')

        if (!signedTransactionB64 || !expectedRecipient || !expectedAmountLamports) {
            return { allowed: false, error: 'Missing required fields' }
        }

        const txBytes = base64js.toByteArray(signedTransactionB64)

        console.log('[Solana] 🚀 Sending transaction to Solana devnet...')
        const txid = await connection.sendRawTransaction(txBytes, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        })

        console.log('[Solana] ⏳ Waiting for confirmation...')
        const latest = await connection.getLatestBlockhash('finalized')
        await connection.confirmTransaction(
            {
                signature: txid,
                blockhash: latest.blockhash,
                lastValidBlockHeight: latest.lastValidBlockHeight,
            },
            'confirmed'
        )

        console.log('[Solana] 🔎 Parsing transaction...')
        const parsed = await connection.getParsedTransaction(txid, {
            maxSupportedTransactionVersion: 0,
        })

        if (!parsed || !parsed.transaction?.message?.instructions?.length) {
            return { allowed: false, error: 'Could not parse transaction' }
        }

        const expectedLamports = BigInt(expectedAmountLamports)

        const validTransfer = parsed.transaction.message.instructions.some((ix: any) => {
            if (ix.program !== 'system' || ix.parsed?.type !== 'transfer') return false

            const recipientPubkey = ix.parsed.info.destination
            const lamports = BigInt(ix.parsed.info.lamports)

            return recipientPubkey === expectedRecipient && lamports === expectedLamports
        })

        if (!validTransfer) {
            return { allowed: false, error: 'Transfer mismatch or invalid format' }
        }

        console.log('[Solana] ✅ Transaction valid:', txid)
        return { allowed: true, txid }
    } catch (err: any) {
        console.error('[Solana] ❌ Validation error:', err)
        return { allowed: false, error: err.message || 'Internal error' }
    }
}