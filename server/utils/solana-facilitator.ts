// utils/solana-facilitator.ts

import {Connection, MessageV0, PublicKey, VersionedTransaction} from '@solana/web3.js'
import {getAssociatedTokenAddress, getMint} from '@solana/spl-token';
import base64js from 'base64-js'
import {getSolanaFeePayerKeypair} from "~/constants";
import nacl from "tweetnacl";

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

function padBase64(str: string): string {
    return str + '='.repeat((4 - str.length % 4) % 4);
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
}): Promise<{ allowed: boolean; txid?: string; error?: string }> {
    try {
        const networkName = network || "mainnet"
        const connection = getConnection(networkName)
        const feePayerKeypair = getSolanaFeePayerKeypair()
        // Get token label for better logging and error messages
        const tokenLabel = mint ? await getTokenLabel(mint, connection) : 'native SOL'

        // Get decimals of token
        // const decimals = mint ? (await getMint(connection, new PublicKey(mint))).decimals : 9
        const decimals = 6

        console.log(`[Solana] 📥 Validating payment request for ${tokenLabel} (${mint || 'SOL'}) on ${networkName}`)
        console.log("signedTransactionB64 ", signedTransactionB64)

        let versionedTx: VersionedTransaction
        try {
            if (!signedTransactionB64 || !expectedRecipient || !expectedAmountAtomic) {
                throw new Error('missing_params')
            }

            // extract message and user signature from payload
            const [userPubkey, messageB64, signatureB64] = signedTransactionB64.split("::");
            if (!messageB64 || !signatureB64 || !userPubkey) {
                throw new Error("Invalid combined payload");
            }
            const messageBytes = base64js.toByteArray(messageB64);
            const userSignatureBytes = base64js.toByteArray(signatureB64);

            // Validate transaction format before sending
            try {
                // 1. Recreate the MessageV0 object
                const message = MessageV0.deserialize(messageBytes);

                // 2. Construct a VersionedTransaction from message
                versionedTx = new VersionedTransaction(message);

                // 3. Add user signature to transaction
                versionedTx.addSignature(new PublicKey(userPubkey), userSignatureBytes)
                versionedTx.addSignature(feePayerKeypair.publicKey, nacl.sign.detached(
                    messageBytes,
                    feePayerKeypair.secretKey
                ))
                console.log('[Solana] 📋 Transaction is versioned format')
            } catch (versionedErr) {
                throw new Error('Invalid or unsupported transaction format; expected versioned transaction.')
            }
        } catch (err) {
            expectedAmountAtomic = expectedAmountAtomic ?? 0
            console.log(expectedAmountAtomic)

            const amount = BigInt(expectedAmountAtomic);
            console.log(amount)

            const uiAmount = Number(amount) / 10 ** decimals;
            console.log(uiAmount)

            const tokenDisplay = mint ? ` ${tokenLabel}` : ' SOL'
            return { allowed: false, error: `💳 Payment required: ${uiAmount}${tokenDisplay} to ${expectedRecipient}. Please provide a signed transaction. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet` }
        }

        const signedTxBytes = versionedTx.serialize()

        console.log(`[Solana] 🚀 Sending transaction to Solana ${networkName}...`)
        let txid: string
        try {
            // Additional logging for debugging
            console.log('[Solana] 🔍 Transaction bytes length:', signedTxBytes.length)
            console.log('[Solana] 🔍 First 20 bytes:', Array.from(signedTxBytes.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '))

            txid = await connection.sendRawTransaction(signedTxBytes, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 3
            })
        } catch (sendError: any) {
            // Handle SendTransactionError and get full details
            console.error('[Solana] ❌ SendTransactionError details:')
            console.error('  Message:', sendError.message)
            console.error('  Transaction message:', sendError.transactionMessage)
            console.error('  Signature:', sendError.signature)

            if (sendError && typeof sendError.getLogs === 'function') {
                console.error('[Solana] 🔍 Transaction logs:', await sendError.getLogs())
            }
            console.error('[Solana] 💥 Raw transaction bytes length:', signedTxBytes.length)

            // Re-throw with more context
            throw new Error(`Transaction send failed: ${sendError.message}. Transaction message: ${sendError.transactionMessage}`)
        }

        console.log('[Solana] ⏳ Waiting for confirmation...')
        const latest = await connection.getLatestBlockhash('finalized')
        await connection.confirmTransaction(
            {
                signature: txid,
                blockhash: latest.blockhash,
                lastValidBlockHeight: latest.lastValidBlockHeight,
            },
            'confirmed'
        )

        console.log('[Solana] 🔎 Parsing transaction...')
        const parsed = await connection.getParsedTransaction(txid, {
            maxSupportedTransactionVersion: 0,
        })

        if (!parsed || !parsed.transaction?.message?.instructions?.length) {
            return { allowed: false, error: 'Could not parse transaction' }
        }

        const expectedAmount = BigInt(expectedAmountAtomic)

        const expectedRecipientAddress = mint ? (await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(expectedRecipient))).toString() : expectedRecipient
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
            return { allowed: false, error: 'Transfer mismatch or invalid format' }
        }

        console.log('[Solana] ✅ Transaction valid:', txid)
        return { allowed: true, txid }
    } catch (err: any) {
        console.error('[Solana] ❌ Validation error:', err)
        return { allowed: false, error: err.message || 'Internal error' }
    }
}
