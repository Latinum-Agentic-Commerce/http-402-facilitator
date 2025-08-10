import { eventHandler } from 'h3'
import { supabase } from '../constants'

export default eventHandler(async (event) => {
    try {
        const { data, error } = await supabase
            .from('solana_tx_attempts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100)

        if (error) {
            throw error
        }

        return {
            success: true,
            logs: data || []
        }
    } catch (err: any) {
        console.error('Error fetching logs:', err)
        return {
            success: false,
            error: err?.message || 'Failed to fetch logs'
        }
    }
})