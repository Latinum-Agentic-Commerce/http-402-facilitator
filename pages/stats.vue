<template>
    <div class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <!-- Header -->
        <div class="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700/50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <NuxtLink to="https://latinum.ai">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center">
                                <img src="/logo.svg" alt="HTTP-402 Facilitator Logo" class="w-10 h-10">
                            </div>
                        </NuxtLink>
                        <div>
                            <h1 class="text-2xl font-bold text-white">Latinum Wallet Stats</h1>
                            <p class="text-gray-400 text-sm">Latinum MCP wallets active in the last 30 days</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-4">
                        <!-- Navigation Menu -->
                        <nav class="hidden sm:flex items-center space-x-1">
                            <NuxtLink to="/"
                                class="px-3 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors duration-200">
                                Transactions
                            </NuxtLink>
                            <NuxtLink to="/stats"
                                class="px-3 py-2 text-sm font-medium text-white bg-purple-600/20 border border-purple-500/30 rounded-lg">
                                Stats
                            </NuxtLink>
                        </nav>
                    </div>
                </div>
            </div>
        </div>

        <!-- Content -->
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <!-- Loading State -->
            <div v-if="pending" class="flex items-center justify-center py-20">
                <div class="flex items-center space-x-3 text-gray-400">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
                    <span class="text-lg">Loading statistics...</span>
                </div>
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="bg-red-900/50 border border-red-800 text-red-300 px-6 py-4 rounded-lg mb-6">
                <div class="flex items-center space-x-2">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path
                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                    <span class="font-medium">Error loading stats:</span>
                    <span>{{ String(error) }}</span>
                </div>
            </div>

            <template v-else>
                <!-- KPIs -->
                <section class="grid gap-4 md:grid-cols-4">
                    <div class="p-4">
                        <div class="text-xl text-gray-200">Last 30 days</div>
                    </div>

                    <div class="rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 p-4">
                        <div class="text-sm text-gray-400">Distinct wallets</div>
                        <div class="mt-1 text-2xl font-bold text-white">{{ fmt(data?.stats?.distinct_wallets) }}</div>
                    </div>

                    <div class="rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 p-4">
                        <div class="text-sm text-gray-400">Avg USDC balance</div>
                        <div class="mt-1 text-2xl font-bold text-white">{{ fmtDec(data?.stats?.avg_usdc_balance, 2) }}
                        </div>
                    </div>

                    <div class="rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 p-4">
                        <div class="text-sm text-gray-400">Total USDC in the Netwok</div>
                        <div class="mt-1 text-2xl font-bold text-white">{{ fmt(data?.stats?.sum_usdc_balance) }}</div>
                    </div>
                </section>

                <!-- Charts -->
                <section class="mt-8 grid gap-6 lg:grid-cols-3">
                    <!-- Daily activity -->
                    <div class="lg:col-span-2 rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 p-4">
                        <div class="mb-3 flex items-end justify-between">
                            <h2 class="text-lg font-semibold text-white">Daily activity</h2>
                            <p class="text-xs text-gray-300">Active wallets & average USDC balance (per day)</p>
                        </div>
                        <canvas ref="tsCanvas" height="120" />
                    </div>

                    <!-- Countries -->
                    <div class="rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 p-4">
                        <div class="mb-3">
                            <h2 class="text-lg font-semibold text-white">Top countries</h2>
                            <p class="text-xs text-gray-400">Most wallets by country</p>
                        </div>
                        <canvas ref="countryCanvas" height="120" />
                        <ul class="mt-4 space-y-1 text-sm text-gray-300">
                            <li v-for="c in (data?.stats?.top_countries || [])" :key="c.country || 'unknown'"
                                class="flex justify-between">
                                <span class="truncate">{{ c.country || 'unknown' }}</span>
                                <span>{{ fmt(c.count) }}</span>
                            </li>
                        </ul>
                    </div>

                    <!-- Platforms -->
                    <div class="rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 p-4">
                        <div class="mb-3">
                            <h2 class="text-lg font-semibold text-white">Platforms</h2>
                            <p class="text-xs text-gray-400">Share by OS</p>
                        </div>
                        <canvas ref="platformCanvas" height="120" />
                        <ul class="mt-4 space-y-1 text-sm text-gray-300">
                            <li v-for="p in (data?.stats?.platforms || [])" :key="p.os_platform"
                                class="flex justify-between">
                                <span class="truncate">{{ p.os_platform || 'unknown' }}</span>
                                <span>{{ fmt(p.count) }}</span>
                            </li>
                        </ul>
                    </div>

                    <!-- Versions -->
                    <div class="rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 p-4">
                        <div class="mb-3">
                            <h2 class="text-lg font-semibold text-white">Wallet versions</h2>
                            <p class="text-xs text-gray-400">Event count per version</p>
                        </div>
                        <div class="max-h-72 overflow-auto">
                            <table class="w-full text-sm">
                                <tbody class="divide-y divide-gray-700/50">
                                    <tr v-for="v in (data?.stats?.versions || [])" :key="v.wallet_version || 'unknown'"
                                        class="hover:bg-gray-700/30 transition-colors duration-200">
                                        <td class="px-2 py-2 text-gray-300">{{ v.wallet_version || 'unknown' }}</td>
                                        <td class="px-2 py-2 text-right text-gray-400">{{ fmt(v.count) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <!-- Footnote -->
                <p class="mt-8 text-center text-xs text-gray-500">
                    Latinum Agentic Commerce
                </p>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useFetch } from '#app'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

type StatsResponse = {
    success: boolean
    window_days: number
    scanned_rows: number
    stats: {
        distinct_wallets: number
        avg_usdc_balance: number
        sum_usdc_balance: number
        top_countries: { country: string; count: number }[]
        platforms: { os_platform: string; count: number }[]
        versions: { wallet_version: string; count: number }[]
        timeseries_daily: { day: string; count: number; avg_usdc_balance: number }[]
    }
}

const { data, pending, error } = await useFetch<StatsResponse>('/api/stats', {
    query: { days: 30, limit: 5000 }
})

const tsCanvas = ref<HTMLCanvasElement | null>(null)
const platformCanvas = ref<HTMLCanvasElement | null>(null)
const countryCanvas = ref<HTMLCanvasElement | null>(null)

let tsChart: Chart | null = null
let platformChart: Chart | null = null
let countryChart: Chart | null = null

// ---- Safe number formatting
const num = (v: unknown): number =>
    typeof v === 'number' && isFinite(v) ? v : 0

const fmt = (v: unknown, opts?: Intl.NumberFormatOptions): string =>
    num(v).toLocaleString('en-US', opts)

const fmtDec = (v: unknown, maxFractionDigits = 2): string =>
    fmt(v, { maximumFractionDigits: maxFractionDigits })

// ---- Charts
const destroyCharts = () => {
    tsChart?.destroy(); tsChart = null
    platformChart?.destroy(); platformChart = null
    countryChart?.destroy(); countryChart = null
}

const renderCharts = () => {
    if (!data.value?.success) return
    const s = data.value.stats

    // Time series (bar + line)
    if (tsCanvas.value) {
        tsChart?.destroy()
        tsChart = new Chart(tsCanvas.value.getContext('2d')!, {
            type: 'bar',
            data: {
                labels: (s.timeseries_daily || []).map(d => d.day),
                datasets: [
                    {
                        type: 'bar',
                        label: 'Daily active wallets',
                        data: (s.timeseries_daily || []).map(d => num(d.count))
                    },
                    {
                        type: 'line',
                        label: 'Avg USDC balance',
                        yAxisID: 'y1',
                        data: (s.timeseries_daily || []).map(d => num(d.avg_usdc_balance))
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: '#d1d5db' // gray-300
                        }
                    },
                    title: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: '#d1d5db' }, // gray-300
                        grid: { color: '#374151' }   // gray-700
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#d1d5db', stepSize: 1 }, // gray-300
                        grid: { color: '#374151' }   // gray-700
                    },
                    y1: {
                        beginAtZero: true,
                        position: 'right',
                        ticks: { color: '#d1d5db', stepSize: 0.01, }, // gray-300
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        })
    }

    // Platforms (pie)
    if (platformCanvas.value) {
        platformChart?.destroy()
        platformChart = new Chart(platformCanvas.value.getContext('2d')!, {
            type: 'pie',
            data: {
                labels: (s.platforms || []).map(p => p.os_platform || 'unknown'),
                datasets: [{ data: (s.platforms || []).map(p => num(p.count)) }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#d1d5db' // gray-300
                        }
                    }
                }
            }
        })
    }

    // Countries (doughnut)
    if (countryCanvas.value) {
        countryChart?.destroy()
        countryChart = new Chart(countryCanvas.value.getContext('2d')!, {
            type: 'doughnut',
            data: {
                labels: (s.top_countries || []).map(c => c.country || 'unknown'),
                datasets: [{ data: (s.top_countries || []).map(c => num(c.count)) }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#d1d5db' // gray-300
                        }
                    }
                }
            }
        })
    }
}

onMounted(renderCharts)
watch(data, () => { destroyCharts(); renderCharts() })
</script>