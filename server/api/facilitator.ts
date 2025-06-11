// server/api/facilitator.ts

import { readBody, eventHandler } from 'h3'
import { validateSolanaPayment } from '../utils/solana-facilitator'
import { validateBaseTransaction } from '../utils/base-facilitator'

export const config = {
    runtime: 'nodejs',
}

export default eventHandler(async (event) => {
    try {
        console.log('FACILITATOR: 📥 Unified entrypoint...')

        const body = await readBody(event)
        const chain = body?.chain?.toLowerCase()

        if (!chain) {
            return { allowed: false, error: 'Missing chain field (expected "solana" or "base")' }
        }

        switch (chain) {
            case 'solana':
                return await validateSolanaPayment(body)

            case 'base':
                return await validateBaseTransaction(body)

            default:
                return { allowed: false, error: `Unsupported chain: ${chain}` }
        }
    } catch (err: any) {
        console.error('FACILITATOR: ❌ Unexpected error:', err)
        return {
            allowed: false,
            error: err?.message || 'Internal Server Error',
        }
    }
})
