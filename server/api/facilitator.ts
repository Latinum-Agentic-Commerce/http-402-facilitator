// server/api/facilitator.ts

import { readBody, eventHandler, setResponseStatus } from 'h3'
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

        let result
        switch (chain) {
            case 'solana':
                result = await validateSolanaPayment(body)
                break

            case 'base':
                result = await validateBaseTransaction(body)
                break

            default:
                return { allowed: false, error: `Unsupported chain: ${chain} ` }
        }

        if (!result.allowed) {
            setResponseStatus(event, 402)
        }

        return result
    } catch (err: any) {
        console.error('FACILITATOR: ❌ Unexpected error:', err)
        return {
            allowed: false,
            error: err?.message || 'Internal Server Error',
        }
    }
})
