// server/api/facilitator.ts

import { readBody, eventHandler, setResponseStatus } from 'h3'
import { validateSolanaPayment } from '../utils/solana-facilitator'
import { validateBaseTransaction } from '../utils/base-facilitator'
import { supabase } from '../constants'

export const config = {
    runtime: 'nodejs',
}

export default eventHandler(async (event) => {
    try {
        console.log('FACILITATOR: 📥 Unified entrypoint...')

        const body = await readBody(event)
        const chain = body?.chain?.toLowerCase()

        if (!chain) {
            return { status: 'failure', error: 'Missing chain field (expected "solana" or "base")' }
        }

        let result
        switch (chain) {
            case 'solana':
                result = await validateSolanaPayment(body)

                await supabase.from('solana_tx_attempts').insert({
                    network: body?.network || null,
                    signed_transaction_b64: body?.signedTransactionB64 ?? null,
                    recipient: body?.expectedRecipient ?? null,
                    amount_atomic: body?.expectedAmountAtomic?.toString() ?? null,
                    mint_address: body?.mint ?? null,
                    token_label: result?.token_label ?? null,
                    user_pubkey: result?.user_pubkey ?? null,
                    status: result?.status || 'failure',
                    txid: result?.txid ?? null,
                    validation_error: result?.error ?? null,
                    debug_logs: result?.debug_notes ?? []
                })

                break

            case 'base':
                result = await validateBaseTransaction(body)
                break

            default:
                return { status: 'failure', error: `Unsupported chain: ${chain} ` }
        }

        if (result.status !== 'success') {
            setResponseStatus(event, 402)
        }

        return result
    } catch (err: any) {
        console.error('FACILITATOR: ❌ Unexpected error:', err)
        return {
            status: 'failure',
            error: err?.message || 'Internal Server Error',
        }
    }
})
