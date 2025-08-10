<template>
    <div class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <!-- Header -->
        <div class="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700/50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center">
                            <img src="/logo.svg" alt="HTTP-402 Facilitator Logo" class="w-10 h-10">
                        </div>
                        <div>
                            <h1 class="text-2xl font-bold text-white">Latinum Facilitator Explorer</h1>
                            <p class="text-gray-400 text-sm">HTTP 402 Transaction monitoring dashboard</p>
                        </div>
                    </div>
                    <button @click="refresh()"
                        class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-200 flex items-center space-x-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Refresh</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- Content -->
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <!-- Loading State -->
            <div v-if="pending" class="flex items-center justify-center py-20">
                <div class="flex items-center space-x-3 text-gray-400">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
                    <span class="text-lg">Loading transaction logs...</span>
                </div>
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="bg-red-900/50 border border-red-800 text-red-300 px-6 py-4 rounded-lg mb-6">
                <div class="flex items-center space-x-2">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path
                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                    <span class="font-medium">Error loading logs:</span>
                    <span>{{ error }}</span>
                </div>
            </div>

            <!-- Empty State -->
            <div v-else-if="data?.logs?.length === 0" class="text-center py-20">
                <div class="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <p class="text-gray-400 text-lg">No transaction logs found</p>
                <p class="text-gray-500 text-sm mt-2">Transaction logs will appear here as they are processed</p>
            </div>

            <!-- Logs Table -->
            <div v-else class="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-700/50">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-lg font-semibold text-white">Recent Transactions</h2>
                        <span class="text-sm text-gray-400">{{ filteredLogs.length }} of {{ data?.logs?.length }} entries</span>
                    </div>
                    
                    <!-- Search Bar -->
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                            </svg>
                        </div>
                        <input
                            v-model="searchTerm"
                            type="text"
                            placeholder="Search by wallet address, recipient, or transaction ID..."
                            class="w-full pl-10 pr-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <button
                            v-if="searchTerm"
                            @click="searchTerm = ''"
                            class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-200"
                        >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-900/50">
                            <tr>
                                <th
                                    class="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Status</th>
                                <th
                                    class="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Network</th>
                                <th
                                    class="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Amount</th>
                                <th
                                    class="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Addresses</th>
                                <th
                                    class="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Time</th>
                                <th
                                    class="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Details</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-700/50">
                            <template v-for="log in filteredLogs" :key="log.id">
                                <!-- Main Log Row -->
                                <tr class="hover:bg-gray-700/30 transition-colors duration-200">
                                    <!-- Status -->
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span :class="[
                                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                                            getTransactionStatus(log) === 'success'
                                                ? 'bg-green-900/50 text-green-300 border border-green-800'
                                                : getTransactionStatus(log) === 'payment_required' 
                                                ? 'bg-blue-900/50 text-blue-300 border border-blue-800'
                                                : 'bg-red-900/50 text-red-300 border border-red-800'
                                        ]">
                                            <div :class="[
                                                'w-1.5 h-1.5 rounded-full mr-1.5',
                                                getTransactionStatus(log) === 'success' 
                                                    ? 'bg-green-400' 
                                                    : getTransactionStatus(log) === 'payment_required'
                                                    ? 'bg-blue-400' 
                                                    : 'bg-red-400'
                                            ]"></div>
                                            {{ getTransactionStatus(log) === 'payment_required' 
                                                ? 'PAYMENT REQUIRED' 
                                                : getTransactionStatus(log).toUpperCase() }}
                                        </span>
                                    </td>

                                    <!-- Network -->
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="text-sm font-medium text-purple-300 capitalize">
                                            {{ log.network || 'Unknown' }}
                                        </span>
                                    </td>

                                    <!-- Amount -->
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div v-if="log.amount_atomic" class="text-sm text-gray-300">
                                            <div class="font-mono">
                                                {{ formatAmount(log.amount_atomic, log.token_label) }}
                                                <span 
                                                    class="cursor-help" 
                                                    :title="log.mint_address ? `Mint: ${log.mint_address}` : 'No mint address available'">
                                                    {{ log.token_label || 'USDC' }}
                                                </span>
                                            </div>
                                        </div>
                                        <span v-else class="text-gray-500 text-sm">—</span>
                                    </td>

                                    <!-- Addresses Column -->
                                    <td class="px-6 py-4">
                                        <div class="space-y-2 text-sm">
                                            <!-- User -->
                                            <div v-if="log.user_pubkey" class="flex items-center space-x-2 group">
                                                <span class="text-gray-400 text-xs w-8">User:</span>
                                                <div class="flex items-center space-x-1 min-w-0">
                                                    <code
                                                        class="font-mono text-gray-300 bg-gray-800/50 px-2 py-1 rounded text-xs break-all select-all hover:bg-gray-700/50 transition-colors cursor-pointer"
                                                        @click="copyToClipboard(log.user_pubkey, 'User address')"
                                                        :title="log.user_pubkey">
                                                        {{ log.user_pubkey }}
                                                    </code>
                                                    <button @click="copyToClipboard(log.user_pubkey, 'User address')"
                                                        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-200 transition-all">
                                                        <svg class="w-3 h-3" fill="none" stroke="currentColor"
                                                            viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                                stroke-width="2"
                                                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            <!-- Transaction ID -->
                                            <div v-if="log.txid" class="flex items-center space-x-2 group">
                                                <span class="text-gray-400 text-xs w-8">TX:</span>
                                                <div class="flex items-center space-x-1 min-w-0">
                                                    <code
                                                        class="font-mono text-blue-300 bg-gray-800/50 px-2 py-1 rounded text-xs break-all select-all hover:bg-gray-700/50 transition-colors cursor-pointer"
                                                        @click="copyToClipboard(log.txid, 'Transaction ID')"
                                                        :title="log.txid">
                                                        {{ log.txid }}
                                                    </code>
                                                    <button @click="copyToClipboard(log.txid, 'Transaction ID')"
                                                        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-200 transition-all">
                                                        <svg class="w-3 h-3" fill="none" stroke="currentColor"
                                                            viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                                stroke-width="2"
                                                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            <!-- Recipient -->
                                            <div v-if="log.recipient" class="flex items-center space-x-2 group">
                                                <span class="text-gray-400 text-xs w-8">To:</span>
                                                <div class="flex items-center space-x-1 min-w-0">
                                                    <code
                                                        class="font-mono text-purple-300 bg-gray-800/50 px-2 py-1 rounded text-xs break-all select-all hover:bg-gray-700/50 transition-colors cursor-pointer"
                                                        @click="copyToClipboard(log.recipient, 'Recipient address')"
                                                        :title="log.recipient">
                                                        {{ log.recipient }}
                                                    </code>
                                                    <button @click="copyToClipboard(log.recipient, 'Recipient address')"
                                                        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-200 transition-all">
                                                        <svg class="w-3 h-3" fill="none" stroke="currentColor"
                                                            viewBox="0 0 24 24">
                                                            <path stroke-linecap="round" stroke-linejoin="round"
                                                                stroke-width="2"
                                                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            <!-- Show placeholder if no addresses -->
                                            <div v-if="!log.user_pubkey && !log.txid && !log.recipient"
                                                class="text-gray-500 text-sm">—</div>
                                        </div>
                                    </td>

                                    <!-- Time -->
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        <div>{{ formatDate(log.created_at) }}</div>
                                        <div class="text-xs text-gray-500">{{ formatTime(log.created_at) }}</div>
                                    </td>

                                    <!-- Details -->
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <button @click="toggleDetails(log.id)"
                                            class="text-purple-400 hover:text-purple-300 text-sm transition-colors duration-200">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                    :d="expandedLogs.has(log.id) ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>

                                <!-- Expanded Details Row (immediately after each main row) -->
                                <tr v-show="expandedLogs.has(log.id)" class="bg-gray-900/50">
                                    <td colspan="6" class="px-6 py-4 border-t border-gray-700/30">
                                        <div class="space-y-4">
                                            <!-- Error -->
                                            <div v-if="log.validation_error" class="flex items-start space-x-4">
                                                <span class="text-sm font-medium text-gray-400 w-24">Error:</span>
                                                <div
                                                    class="flex-1 text-sm text-red-300 bg-red-900/20 px-3 py-2 rounded border border-red-800/50">
                                                    {{ log.validation_error }}
                                                </div>
                                            </div>

                                            <!-- Debug Logs -->
                                            <div v-if="log.debug_logs && log.debug_logs.length > 0"
                                                class="flex items-start space-x-4">
                                                <span class="text-sm font-medium text-gray-400 w-24">Debug:</span>
                                                <div class="flex-1">
                                                    <pre
                                                        class="text-xs text-gray-300 bg-gray-800/50 p-3 rounded overflow-x-auto border border-gray-700/50">{{ JSON.stringify(log.debug_logs, null, 2) }}</pre>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
// Reactive state for expanded log details
const expandedLogs = ref(new Set<string>())

// Search functionality
const searchTerm = ref('')

// Filtered logs based on search term
const filteredLogs = computed(() => {
    const logs = data.value?.logs || []
    if (!searchTerm.value.trim()) return logs
    
    const search = searchTerm.value.toLowerCase().trim()
    return logs.filter(log => 
        // Search in user wallet address
        log.user_pubkey?.toLowerCase().includes(search) ||
        // Search in recipient address
        log.recipient?.toLowerCase().includes(search) ||
        // Search in transaction ID
        log.txid?.toLowerCase().includes(search)
    )
})

// Data fetching
const { data, pending, error, refresh } = await $fetch('/api/logs').then(response => ({
    data: ref(response),
    pending: ref(false),
    error: ref(response.success ? null : response.error),
    refresh: async () => {
        try {
            const newData = await $fetch('/api/logs')
            data.value = newData
            error.value = newData.success ? null : newData.error
        } catch (err: any) {
            error.value = err.message || 'Failed to refresh logs'
        }
    }
})).catch(err => ({
    data: ref(null),
    pending: ref(false),
    error: ref(err.message || 'Failed to load logs'),
    refresh: async () => { }
}))

// Helper functions
const toggleDetails = (logId: string) => {
    if (expandedLogs.value.has(logId)) {
        expandedLogs.value.delete(logId)
    } else {
        expandedLogs.value.add(logId)
    }
}

const getTransactionStatus = (log: any) => {
    // Use the specific status from the database if available
    if (log.status === 'success' || log.status === 'payment_required' || log.status === 'failure') {
        return log.status
    }
    
    // Fallback for old records - check if it's a payment required error
    if (log.status === 'success') {
        return 'success'
    }
    if (log.validation_error && log.validation_error.includes('💳 Payment required')) {
        return 'payment_required'
    }
    
    return 'failure'
}

const truncateAddress = (address: string, chars: number = 8) => {
    if (!address) return ''
    if (address.length <= chars * 2) return address
    return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

const formatAmount = (atomicAmount: string | number, tokenLabel?: string, decimals?: number) => {
    const atomicNum = typeof atomicAmount === 'string' ? parseFloat(atomicAmount) : atomicAmount
    if (isNaN(atomicNum)) return '0'

    // Determine decimals based on token type
    let tokenDecimals = decimals
    if (!tokenDecimals) {
        // Default decimals for known tokens
        const knownTokenDecimals: Record<string, number> = {
            'SOL': 9,
            'native SOL': 9,
            'USDC': 6,
            'USDT': 6,
            'RAY': 6,
            'SRM': 6,
            'FIDA': 6,
            'wSOL': 9
        }
        tokenDecimals = knownTokenDecimals[tokenLabel || ''] || 6 // Default to 6 for USDC
    }

    // Convert atomic units to human-readable format
    const humanReadable = atomicNum / Math.pow(10, tokenDecimals)

    // Format with appropriate decimal places
    let formattedAmount: string
    if (humanReadable >= 1) {
        // For amounts >= 1, show up to 6 decimal places, removing trailing zeros
        formattedAmount = humanReadable.toFixed(6).replace(/\.?0+$/, '')
    } else {
        // For amounts < 1, show more precision to avoid showing 0
        formattedAmount = humanReadable.toFixed(8).replace(/\.?0+$/, '')
    }

    // Add thousand separators for the integer part
    const parts = formattedAmount.split('.')
    parts[0] = parseInt(parts[0]).toLocaleString('en-US')

    return parts.join('.')
}

const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
}

const formatTime = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })
}

// Copy to clipboard function
const copyToClipboard = async (text: string, label: string = 'Text') => {
    try {
        await navigator.clipboard.writeText(text)
        // You could add a toast notification here
        console.log(`${label} copied to clipboard: ${text}`)
    } catch (err) {
        console.error('Failed to copy text: ', err)
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        try {
            document.execCommand('copy')
            console.log(`${label} copied to clipboard (fallback): ${text}`)
        } catch (fallbackErr) {
            console.error('Fallback copy failed: ', fallbackErr)
        }
        document.body.removeChild(textArea)
    }
}

// Set page title and favicon
useHead({
    title: 'HTTP-402 Facilitator - Transaction Logs',
    link: [
        {
            rel: 'icon',
            type: 'image/x-icon',
            href: '/favicon.ico'
        }
    ]
})
</script>