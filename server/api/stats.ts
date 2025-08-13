// server/api/stats.ts
import { defineEventHandler, getQuery, setResponseStatus } from 'h3'
import { supabase } from '../constants'

type WalletLog = {
  id: number
  wallet_pubkey: string
  wallet_version: string | null
  os_platform: string | null
  os_release: string | null
  os_version: string | null
  machine_arch: string | null
  public_ip: string | null
  city: string | null
  region: string | null
  country: string | null
  extra: any | null
  ts: string // ISO
  usdc_balance: string | number | null
}

function toISODate(d: Date) {
  const yy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export default defineEventHandler(async (event) => {
  try {
    const { days: qDays, limit: qLimit } = getQuery(event)

    const days = Math.max(1, Math.min(365, Number(qDays ?? 30)))
    const limit = Math.max(100, Math.min(50000, Number(qLimit ?? 5000)))

    // Time window
    const now = new Date()
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    // Fetch rows (bounded + ordered). No raw SQL / RPC.
    const { data, error } = await supabase
      .from('wallet_logs')
      .select(`
        id,
        wallet_pubkey,
        wallet_version,
        os_platform,
        os_release,
        os_version,
        machine_arch,
        public_ip,
        city,
        region,
        country,
        extra,
        ts,
        usdc_balance
      `)
      .gte('ts', since.toISOString())
      .lte('ts', now.toISOString())
      // Order to make dedupe predictable (newest first per pubkey)
      .order('wallet_pubkey', { ascending: true })
      .order('ts', { ascending: false })
      .limit(limit)

    if (error) {
      setResponseStatus(event, 500)
      return { success: false, error: error.message }
    }

    const rows: WalletLog[] = data ?? []
    const scannedRows = rows.length

    // ---- Deduplicate by wallet_pubkey: keep the MOST RECENT (max ts) per wallet ----
    const latestByWallet = new Map<string, WalletLog>()
    for (const r of rows) {
      if (!r.wallet_pubkey) continue
      const prev = latestByWallet.get(r.wallet_pubkey)
      if (!prev) {
        latestByWallet.set(r.wallet_pubkey, r)
      } else {
        // Compare timestamps (ISO)
        if (new Date(r.ts).getTime() > new Date(prev.ts).getTime()) {
          latestByWallet.set(r.wallet_pubkey, r)
        }
      }
    }

    const wallets = Array.from(latestByWallet.values())
    const walletsCount = wallets.length

    // ---------- Aggregations (over latest-per-wallet only) ----------
    let nonNullBalances = 0
    let sumUSDC = 0

    const byCountry = new Map<string, number>()
    const byPlatform = new Map<string, number>()
    const byVersion = new Map<string, number>()
    const timeSeries = new Map<
      string,
      { count: number; sumBalance: number; nonNullBalances: number }
    >()

    for (const r of wallets) {
      // country
      if (r.country) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1)

      // platform
      const plat = r.os_platform || 'unknown'
      byPlatform.set(plat, (byPlatform.get(plat) ?? 0) + 1)

      // version
      const ver = r.wallet_version || 'unknown'
      byVersion.set(ver, (byVersion.get(ver) ?? 0) + 1)

      // balances
      const bal =
        typeof r.usdc_balance === 'string'
          ? Number(r.usdc_balance)
          : r.usdc_balance ?? null
      if (bal !== null && !Number.isNaN(bal)) {
        sumUSDC += bal
        nonNullBalances++
      }

      // per-day bucket of the *most recent* log's day
      if (r.ts) {
        const day = toISODate(new Date(r.ts))
        const bucket =
          timeSeries.get(day) ||
          { count: 0, sumBalance: 0, nonNullBalances: 0 }
        bucket.count += 1
        if (bal !== null && !Number.isNaN(bal)) {
          bucket.sumBalance += bal
          bucket.nonNullBalances += 1
        }
        timeSeries.set(day, bucket)
      }
    }

    const sortDesc = (a: [string, number], b: [string, number]) => b[1] - a[1]

    const avgUSDC = nonNullBalances ? sumUSDC / nonNullBalances : 0

    const topCountries = Array.from(byCountry.entries())
      .sort(sortDesc)
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }))

    const platforms = Array.from(byPlatform.entries())
      .sort(sortDesc)
      .map(([os_platform, count]) => ({ os_platform, count }))

    const versions = Array.from(byVersion.entries())
      .sort(sortDesc)
      .map(([wallet_version, count]) => ({ wallet_version, count }))

    // Continuous day series for last N days (based on latest-per-wallet buckets)
    const series: { day: string; count: number; avg_usdc_balance: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const key = toISODate(d)
      const b = timeSeries.get(key)
      series.push({
        day: key,
        count: b?.count ?? 0,
        avg_usdc_balance:
          b && b.nonNullBalances ? b.sumBalance / b.nonNullBalances : 0,
      })
    }

    // Optional recent preview: still handy to show a few raw rows if needed
    const recent = rows.slice(0, 50).map(r => ({
      id: r.id,
      ts: r.ts,
      wallet_pubkey: r.wallet_pubkey,
      country: r.country,
      os_platform: r.os_platform,
      wallet_version: r.wallet_version,
      usdc_balance:
        typeof r.usdc_balance === 'string'
          ? Number(r.usdc_balance)
          : r.usdc_balance,
    }))

    return {
      success: true,
      window_days: days,
      scanned_rows: scannedRows,      // raw rows fetched
      wallets_count: walletsCount,    // unique wallets after dedupe
      stats: {
        distinct_wallets: walletsCount,
        avg_usdc_balance: avgUSDC,
        sum_usdc_balance: sumUSDC,
        top_countries: topCountries,
        platforms,
        versions,
        timeseries_daily: series,
      },
      recent,
    }
  } catch (e: any) {
    setResponseStatus(event, 500)
    return { success: false, error: e?.message || 'Unknown server error' }
  }
})