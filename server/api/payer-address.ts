// server/api/payer-address.ts

import {getSolanaFeePayerKeypair} from '../constants'

export default defineEventHandler((event) => {
    // Disable caching
    setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    setHeader(event, 'Pragma', 'no-cache')
    setHeader(event, 'Expires', '0')
    setHeader(event, 'Surrogate-Control', 'no-store')

    const chain = (getQuery(event).chain as string)?.toLowerCase()

    if (!chain) {
        return sendError(event, createError({ statusCode: 400, statusMessage: 'Missing chain parameter' }))
    }

    const feePayerMap: Record<string, string> = {
        solana: getSolanaFeePayerKeypair().publicKey.toBase58(),
        base: '' /*getBaseWallet().address*/
    }

    const feePayer = feePayerMap[chain]

    if (!feePayer) {
        return sendError(event, createError({ statusCode: 400, statusMessage: `Unsupported chain: ${chain}` }))
    }

    return { chain, feePayer }
})
