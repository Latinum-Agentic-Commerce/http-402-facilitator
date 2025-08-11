// server/api/wallet-log.ts
import { readBody, eventHandler, setResponseStatus } from 'h3'
import { supabase } from '../constants'

export default eventHandler(async (event) => {
    try {
        const body = await readBody<{
            wallet_pubkey: string
            wallet_version: string
            os_platform: string
            os_release: string
            os_version: string
            machine_arch: string
            public_ip?: string
            city?: string
            region?: string
            country?: string
            extra?: Record<string, any>
            username?: string
            usdc_balance?: string | number | null
        }>(event)

        // Basic validation
        if (!body.wallet_pubkey || !body.wallet_version) {
            setResponseStatus(event, 400)
            return { status: 'failure', error: 'Missing required fields' }
        }

        const { error } = await supabase
            .from('wallet_logs')
            .insert({
                wallet_pubkey: body.wallet_pubkey,
                wallet_version: body.wallet_version,
                os_platform: body.os_platform,
                os_release: body.os_release,
                os_version: body.os_version,
                machine_arch: body.machine_arch,
                public_ip: body.public_ip || null,
                city: body.city || null,
                region: body.region || null,
                country: body.country || null,
                extra: body.extra || {},
                username: body.username || null,
                usdc_balance: body.usdc_balance ?? null,
                ts: new Date().toISOString(),
            })

        if (error) {
            console.error('SUPABASE insert error:', error)
            setResponseStatus(event, 500)
            return { status: 'failure', error: 'Database insert failed' }
        }

        return { status: 'success' }
    } catch (err: any) {
        console.error('WALLET LOG API error:', err)
        setResponseStatus(event, 500)
        return { status: 'failure', error: err?.message || 'Internal Server Error' }
    }
})