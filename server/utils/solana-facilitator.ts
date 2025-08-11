// utils/solana-facilitator.ts

import {
    Connection,
    PublicKey,
    VersionedTransaction,
    Transaction,
    TransactionInstruction,
    SystemInstruction,
    sendAndConfirmRawTransaction,
    SystemProgram,
} from '@solana/web3.js'
import {
    getAssociatedTokenAddress,
    TOKEN_PROGRAM_ID,
    decodeTransferInstruction,
    decodeTransferCheckedInstruction,
    getMint,
} from '@solana/spl-token'
import base64js from 'base64-js'
import { getSolanaFeePayerKeypair } from '../constants'

// ─────────────────────────────────────────────────────────────────────────────
// RPC endpoints
// ─────────────────────────────────────────────────────────────────────────────
const SOLANA_RPC_URLS = {
    mainnet: 'https://api.mainnet-beta.solana.com',
    devnet: 'https://api.devnet.solana.com',
    testnet: 'https://api.testnet.solana.com',
} as const

function getConnection(network: string = 'devnet'): Connection {
    const rpcUrl = SOLANA_RPC_URLS[network as keyof typeof SOLANA_RPC_URLS] || SOLANA_RPC_URLS.devnet
    return new Connection(rpcUrl, 'confirmed')
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpful labels for common mints
// ─────────────────────────────────────────────────────────────────────────────
const KNOWN_TOKENS: Record<string, string> = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
    SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt: 'SRM',
    EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp: 'FIDA',
    So11111111111111111111111111111111111111112: 'wSOL',
}

async function getTokenLabel(mint: string, connection: Connection): Promise<string> {
    if (KNOWN_TOKENS[mint]) return KNOWN_TOKENS[mint]
    try {
        const info = await connection.getParsedAccountInfo(new PublicKey(mint))
        if (info.value?.data && 'parsed' in info.value.data) {
            const parsed = info.value.data.parsed
            if (parsed?.info?.symbol) return parsed.info.symbol
        }
    } catch (_) {
        // ignore and fall back
    }
    return mint.slice(0, 8) + '...'
}

// ─────────────────────────────────────────────────────────────────────────────
// Types & ctx
// ─────────────────────────────────────────────────────────────────────────────
type FinalStatus = 'success' | 'payment_required' | 'failure'
type TxFormat = 'versioned' | 'legacy'

interface ValidateInput {
    signedTransactionB64: string | null
    expectedRecipient: string
    expectedAmountAtomic: bigint | number | string
    mint?: string
    network?: 'mainnet' | 'devnet' | 'testnet'
}

interface ValidateResult {
    status: FinalStatus
    txid?: string
    error?: string
    debug_notes?: string[]
    user_pubkey?: string
    token_label?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation & context helpers (drop-in)
// ─────────────────────────────────────────────────────────────────────────────
function validateInput(input: ValidateInput): string[] {
    const errors: string[] = []
    if (input.signedTransactionB64 == null || !input.signedTransactionB64) {
        errors.push('Missing signedTransactionB64')
    }
    else {
        try {
            base64js.toByteArray(input.signedTransactionB64)
        }
        catch (_) { errors.push('signedTransactionB64 is not valid base64'); }
    }

    if (!input.expectedRecipient) {
        errors.push('Missing expectedRecipient')
    }
    else {
        try {
            new PublicKey(input.expectedRecipient);
        } catch {
            errors.push('expectedRecipient is not a valid Solana address');
        }
    }

    if (input.expectedAmountAtomic === undefined || input.expectedAmountAtomic === null) {
        errors.push('Missing expectedAmountAtomic')
    } else {
        try {
            BigInt(input.expectedAmountAtomic);
        } catch {
            errors.push('expectedAmountAtomic is not a valid integer');
        }
    }
    return errors
}

async function buildPaymentRequiredResponse(
    input: ValidateInput,
    notes: string[]
): Promise<ValidateResult> {
    // We need a connection only to resolve accurate decimals + label for the message
    const connection = getConnection(input.network || 'mainnet')
    const decimals = input.mint ? (await getMint(connection, new PublicKey(input.mint))).decimals : 9
    const tokenLabel = input.mint ? await getTokenLabel(input.mint, connection) : 'native SOL'

    const amount = BigInt(input.expectedAmountAtomic ?? 0n)
    const uiAmount = Number(amount) / 10 ** decimals
    const tokenDisplay = input.mint ? ` ${tokenLabel}` : ' SOL'

    notes.push('❌ Missing parameters')
    return {
        status: 'payment_required',
        error: `💳 Payment required: ${uiAmount}${tokenDisplay} to ${input.expectedRecipient}. Please generate a signed transaction with the wallet. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet`,
        debug_notes: notes,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decode & validate (local) using staticAccountKeys only (no ALT resolution)
// ─────────────────────────────────────────────────────────────────────────────
function rebuildIxFromVersioned(vtx: VersionedTransaction): TransactionInstruction[] {
    const keys = vtx.message.staticAccountKeys // ALT accounts not resolved in this implementation
    return vtx.message.compiledInstructions.map((ci) => {
        const programId = keys[ci.programIdIndex]!
        const accounts = ci.accountKeyIndexes.map((i) => ({
            pubkey: keys[i]!,
            isSigner: false,
            isWritable: true,
        }))
        return new TransactionInstruction({
            programId,
            keys: accounts,
            data: Buffer.from(ci.data),
        })
    })
}

function validateIxSet(
    ixns: TransactionInstruction[],
    mint: string | undefined,
    expectedRecipientAddress: string,
    expectedAmount: bigint
): boolean {
    for (const ix of ixns) {
        if (!mint) {
            // Native SOL transfer
            if (ix.programId.equals(SystemProgram.programId)) {
                try {
                    const t = SystemInstruction.decodeTransfer(ix)
                    const dest = t.toPubkey.toBase58()
                    const lamports = BigInt(t.lamports)
                    if (dest === expectedRecipientAddress && lamports === expectedAmount) {
                        return true
                    }
                } catch {
                    // not a transfer
                }
            }
        } else if (ix.programId.equals(TOKEN_PROGRAM_ID)) {
            // SPL token transfer
            try {
                // Prefer transferChecked (includes mint)
                const t = decodeTransferCheckedInstruction(ix)
                const dest = t.keys.destination.pubkey.toBase58()
                const amt = BigInt(t.data.amount)
                const mintKey = t.keys.mint.pubkey.toBase58()
                if (dest === expectedRecipientAddress && amt === expectedAmount && mintKey === mint) return true
            } catch {
                try {
                    // Fallback to plain transfer (no mint in data)
                    const t2 = decodeTransferInstruction(ix)
                    const dest = t2.keys.destination.pubkey.toBase58()
                    const amt = BigInt(t2.data.amount)
                    if (dest === expectedRecipientAddress && amt === expectedAmount) return true
                } catch {
                    // not a transfer
                }
            }
        }
    }
    return false
}

function decodeAndValidateLocally(
    txBytes: Uint8Array,
    mint: string | undefined,
    expectedRecipientAddress: string,
    expectedAmount: bigint,
    log: (m: string) => void
): { ok: true; format: TxFormat; userPubkey?: string } | { ok: false; error: string } {
    // Try versioned
    try {
        const vtx = VersionedTransaction.deserialize(txBytes)
        log('📋 Transaction is versioned format')

        // user pubkey (best-effort: first static key)
        const userPubkey = vtx.message.staticAccountKeys[0]?.toBase58()
        if (userPubkey) log(`👤 User pubkey: ${userPubkey}`)

        const ixns = rebuildIxFromVersioned(vtx)
        const valid = validateIxSet(ixns, mint, expectedRecipientAddress, expectedAmount)
        if (!valid) return { ok: false, error: 'Transfer mismatch or unsupported instruction format' }
        return { ok: true, format: 'versioned', userPubkey }
    } catch {
        // fall through to legacy
    }

    // Try legacy
    try {
        const ltx = Transaction.from(txBytes)
        log('📋 Transaction is legacy format')
        const userPubkey = (ltx.signatures[0]?.publicKey ?? ltx.feePayer)?.toBase58()
        if (userPubkey) log(`👤 User pubkey: ${userPubkey}`)

        const valid = validateIxSet(ltx.instructions, mint, expectedRecipientAddress, expectedAmount)
        if (!valid) return { ok: false, error: 'Transfer mismatch or unsupported instruction format' }
        return { ok: true, format: 'legacy', userPubkey }
    } catch (err: any) {
        return { ok: false, error: `Invalid transaction format: ${err?.message || String(err)}` }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign (fee payer) & send
// ─────────────────────────────────────────────────────────────────────────────
async function signAndSend(connection: Connection, txBytes: Uint8Array, log: (m: string) => void, format: TxFormat):
    Promise<{ txid: string } | { error: string }> {
    const feePayer = getSolanaFeePayerKeypair()
    log(`Fee payer public key: ${feePayer.publicKey.toBase58()}`)

    try {
        let serialized: Buffer
        if (format === 'versioned') {
            const vtx = VersionedTransaction.deserialize(txBytes)
            vtx.sign([feePayer])
            log('🖊️ Fee payer signature added')
            serialized = Buffer.from(vtx.serialize())
        } else {
            const ltx = Transaction.from(txBytes)
            ltx.sign(feePayer)
            log('🖊️ Fee payer signature added')
            serialized = Buffer.from(ltx.serialize())
        }

        log('🚀 Sending & confirming transaction...')
        const txid = await sendAndConfirmRawTransaction(
            connection,
            serialized,
            { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }
        )

        log(`✅ Transaction confirmed. TXID: ${txid}`)
        return { txid }
    } catch (e: any) {
        log(`❌ SendTransactionError: ${e?.message || String(e)}`)
        return { error: `Transaction send failed: ${e?.message || String(e)}` }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entrypoint
// ─────────────────────────────────────────────────────────────────────────────
export async function validateSolanaPayment(input: ValidateInput): Promise<ValidateResult> {
    // shared logger for this request
    const notes: string[] = []
    const log = (m: string) => notes.push(m)

    // 1) Pure validation
    const errors = validateInput(input)
    if (errors.length) {
        // Early 402 with correct decimals + token label
        return await buildPaymentRequiredResponse(input, notes)
    }

    // 2) Extract Info
    const network = input.network || 'mainnet'
    const connection = getConnection(network)
    const mint = input.mint

    log(`Network: ${network}`)
    log(`signedTransactionB64: ${input.signedTransactionB64}`)

    const txBytes = base64js.toByteArray(input.signedTransactionB64)

    const tokenLabel = mint ? await getTokenLabel(mint, connection) : 'native SOL'
    const decimals = mint ? (await getMint(connection, new PublicKey(mint))).decimals : 9

    log(`Token: ${tokenLabel} (${mint || 'SOL'})`)
    log(`Token decimals: ${decimals}`)
    log(`Transaction bytes length: ${txBytes.length}`)

    const expectedAmount = BigInt(input.expectedAmountAtomic)
    const expectedRecipientAddress = mint
        ? (await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(input.expectedRecipient))).toBase58()
        : input.expectedRecipient

    // 3) Local decode & validation (no network broadcast)
    const pre = decodeAndValidateLocally(txBytes, mint, expectedRecipientAddress, expectedAmount, log)
    if (!pre.ok) {
        log(`❌ Validation failed before signing: ${pre.error}`)
        return {
            status: 'failure',
            error: pre.error,
            debug_notes: notes,
            token_label: tokenLabel,
        }
    }

    // 4) Sign with fee payer, send & confirm
    const sent = await signAndSend(connection, txBytes, log, pre.format)
    if ('error' in sent) {
        return {
            status: 'failure',
            error: sent.error,
            debug_notes: notes,
            token_label: tokenLabel,
            user_pubkey: pre.userPubkey,
        }
    }

    // Success
    return {
        status: 'success',
        txid: sent.txid,
        debug_notes: notes,
        user_pubkey: pre.userPubkey,
        token_label: tokenLabel,
    }
}