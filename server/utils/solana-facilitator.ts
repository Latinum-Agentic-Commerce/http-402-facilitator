// utils/solana-facilitator.ts

import { Connection, PublicKey, VersionedTransaction, Transaction, Keypair } from '@solana/web3.js'
import { getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import base64js from 'base64-js'
import { getSolanaFeePayerKeypair } from '../constants';

const SOLANA_RPC_URLS = {
    mainnet: 'https://api.mainnet-beta.solana.com',
    devnet: 'https://api.devnet.solana.com',
    testnet: 'https://api.testnet.solana.com'
}

// Known token mint addresses and their labels
const KNOWN_TOKENS = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
    'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt': 'SRM',
    'EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp': 'FIDA',
    'So11111111111111111111111111111111111111112': 'wSOL',
}

function getConnection(network: string = 'devnet'): Connection {
    const rpcUrl = SOLANA_RPC_URLS[network as keyof typeof SOLANA_RPC_URLS] || SOLANA_RPC_URLS.devnet
    return new Connection(rpcUrl, 'confirmed')
}

async function getTokenLabel(mint: string, connection: Connection): Promise<string> {
    // Check known tokens first
    if (KNOWN_TOKENS[mint]) {
        return KNOWN_TOKENS[mint]
    }

    try {
        // Try to fetch token metadata from the mint account
        const mintPublicKey = new PublicKey(mint)
        const mintInfo = await connection.getParsedAccountInfo(mintPublicKey)

        if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
            const parsed = mintInfo.value.data.parsed
            if (parsed.info?.symbol) {
                return parsed.info.symbol
            }
        }

        // Fallback: try to get metadata from SPL Token Metadata program (if available)
        // This would require additional metadata program calls, but for now return mint address
        return mint.slice(0, 8) + '...' // Shortened mint address
    } catch (error) {
        console.warn(`[Solana] Could not fetch token metadata for ${mint}:`, error)
        return mint.slice(0, 8) + '...' // Shortened mint address as fallback
    }
}

export async function validateSolanaPayment({
    signedTransactionB64,
    expectedRecipient,
    expectedAmountAtomic,
    mint,
    network,
}: {
    signedTransactionB64: string
    expectedRecipient: string
    expectedAmountAtomic: bigint | number | string
    mint?: string
    network?: 'mainnet' | 'devnet' | 'testnet'
}): Promise<{ status: 'success' | 'payment_required' | 'failure'; txid?: string; error?: string; debug_notes?: string[]; user_pubkey?: string; token_label?: string }> {
    const debug_notes: string[] = []
    const log = (msg: string) => debug_notes.push(msg)

    let userPubkey: string | undefined
    let tokenLabel: string
    try {
        const networkName = network || "mainnet"
        log(`Network: ${networkName}`)
        const connection = getConnection(networkName)

        tokenLabel = mint ? await getTokenLabel(mint, connection) : 'native SOL'
        log(`Token: ${tokenLabel} (${mint || 'SOL'})`)

        const decimals = mint ? (await getMint(connection, new PublicKey(mint))).decimals : 9
        log(`Token decimals: ${decimals}`)

        const feePayerKeypair = getSolanaFeePayerKeypair()

        log(`Fee payer public key: ${feePayerKeypair.publicKey.toBase58()}`)

        if (!signedTransactionB64 || !expectedRecipient || !expectedAmountAtomic) {
            log('❌ Missing parameters')
            const amount = BigInt(expectedAmountAtomic);
            const uiAmount = Number(amount) / 10 ** decimals;
            const tokenDisplay = mint ? ` ${tokenLabel}` : ' SOL'
            return {
                status: 'payment_required',
                debug_notes,
                user_pubkey: userPubkey,
                token_label: tokenLabel,
                error: `💳 Payment required: ${uiAmount}${tokenDisplay} to ${expectedRecipient}`
            }
        }

        // ── Decode and try to deserialize (versioned → fallback to legacy)
        let txBytes = base64js.toByteArray(signedTransactionB64)
        log(`Transaction bytes length: ${txBytes.length}`)

        // Try to deserialize as versioned transaction first
        let versionedTx: VersionedTransaction | null = null
        try {
            versionedTx = VersionedTransaction.deserialize(txBytes)
            log('📋 Transaction is versioned format')
            // Extract the first signer (user's pubkey) before adding fee payer signature
            if (versionedTx.message.staticAccountKeys.length > 0) {
                userPubkey = versionedTx.message.staticAccountKeys[0].toBase58()
                log(`👤 User pubkey: ${userPubkey}`)
            }
            versionedTx.sign([feePayerKeypair])
            txBytes = versionedTx.serialize()
            log('🖊️ Fee payer signature added (gasless mode)')
        } catch (versionedErr) {
            try {
                const legacyTx = Transaction.from(txBytes)
                log('📋 Transaction is legacy format')
                // Extract the first signer (user's pubkey) before adding fee payer signature
                if (legacyTx.instructions.length > 0 && legacyTx.instructions[0].keys.length > 0) {
                    userPubkey = legacyTx.instructions[0].keys[0].pubkey.toBase58()
                    log(`👤 User pubkey: ${userPubkey}`)
                }
                legacyTx.sign(feePayerKeypair)
                txBytes = legacyTx.serialize()
                log('🖊️ Fee payer signature added (gasless mode)')
            } catch (legacyErr: any) {
                log(`❌ Transaction deserialization failed: Versioned error: ${versionedErr?.message}, Legacy error: ${legacyErr?.message}`)
                return {
                    status: 'payment_required',
                    debug_notes,
                    user_pubkey: userPubkey,
                    token_label: `Invalid transaction format. Versioned error: ${versionedErr?.message}. Legacy error: ${legacyErr?.message}`
                }
            }
        }

        log('🚀 Sending transaction...')
        let txid: string
        try {
            txid = await connection.sendRawTransaction(txBytes, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 3
            })
            log(`✅ Sent transaction. TXID: ${txid}`)
        } catch (sendError: any) {
            log(`❌ SendTransactionError: ${sendError.message}`)
            if (typeof sendError.getLogs === 'function') {
                const logs = await sendError.getLogs()
                logs.forEach((log: string) => log(`RPC log: ${log}`))
            }
            return {
                status: 'failure',
                debug_notes,
                user_pubkey: userPubkey,
                token_label: tokenLabel,
                error: `Transaction send failed: ${sendError.message}`
            }
        }

        log('⏳ Waiting for confirmation...')
        const latest = await connection.getLatestBlockhash('finalized')
        await connection.confirmTransaction(
            { signature: txid, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
            'confirmed'
        )
        log('✅ Transaction confirmed')

        const parsed = await connection.getParsedTransaction(txid, {
            maxSupportedTransactionVersion: 0,
        })

        connection.sendAndConfirmRawTransaction()

        if (!parsed || !parsed.transaction?.message?.instructions?.length) {
            log('❌ Could not parse transaction')
            return {
                status: 'failure',
                debug_notes,
                user_pubkey: userPubkey,
                token_label: tokenLabel,
                error: 'Could not parse transaction'
            }
        }

        const expectedAmount = BigInt(expectedAmountAtomic)
        const expectedRecipientAddress = mint
            ? (await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(expectedRecipient))).toString()
            : expectedRecipient

        const validTransfer = parsed.transaction.message.instructions.some((ix: any) => {
            if (!mint) {
                // Native SOL transfer via system program
                if (ix.program !== 'system' || ix.parsed?.type !== 'transfer') return false

                const recipientPubkey = ix.parsed.info.destination
                const lamports = BigInt(ix.parsed.info.lamports)

                return recipientPubkey === expectedRecipientAddress && lamports === expectedAmount
            } else {
                // SPL Token transfer - mint address is required
                if (ix.program !== 'spl-token') return false

                // Handle standard transfer instruction
                if (ix.parsed?.type === 'transfer') {
                    const recipientPubkey = ix.parsed.info.destination
                    const amount = BigInt(ix.parsed.info.amount)

                    // Verify mint address if available in instruction
                    if (ix.parsed.info.mint && ix.parsed.info.mint !== mint) {
                        return false
                    }

                    return recipientPubkey === expectedRecipientAddress && amount === expectedAmount
                }

                // Handle transferChecked instruction (includes mint verification)
                if (ix.parsed?.type === 'transferChecked') {
                    const recipientPubkey = ix.parsed.info.destination
                    const amount = BigInt(ix.parsed.info.tokenAmount.amount)
                    const instructionMint = ix.parsed.info.mint

                    // Verify mint address matches exactly
                    if (instructionMint !== mint) {
                        return false
                    }

                    return recipientPubkey === expectedRecipientAddress && amount === expectedAmount
                }

                return false
            }
        })

        if (!validTransfer) {
            log('❌ Transfer mismatch or invalid format')
            return {
                status: 'failure',
                debug_notes,
                user_pubkey: userPubkey,
                token_label: tokenLabel,
                error: 'Transfer mismatch or invalid format'
            }
        }

        log('✅ Transaction valid')
        return {
            status: 'success',
            txid,
            debug_notes,
            user_pubkey: userPubkey,
            token_label: tokenLabel
        }
    } catch (err: any) {
        log(`❌ Validation error: ${err.message}`)
        return {
            status: 'failure',
            debug_notes,
            user_pubkey: userPubkey,
            token_label: tokenLabel,
            error: err.message || 'Internal error'
        }
    }
}
