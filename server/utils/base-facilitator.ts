// utils/base-facilitator.ts

import { ethers } from 'ethers'

const BASE_RPC_URL = 'https://sepolia.base.org'
const CONFIRMATIONS = 3

export async function validateBaseTransaction({
    signedTransactionHex,
    expectedRecipient,
    expectedAmountWei
}): Promise<{ allowed: boolean; txHash?: string; type?: 'eth' | 'token'; error?: string }> {
    try {
        const provider = new ethers.JsonRpcProvider(BASE_RPC_URL)

        if (!ethers.isAddress(expectedRecipient)) {
            return { allowed: false, error: 'Invalid recipient address' }
        }

        const txResponse = await provider.broadcastTransaction(signedTransactionHex)
        const txHash = txResponse.hash

        const receipt = await txResponse.wait(CONFIRMATIONS)

        if (!receipt || receipt.status !== 1) {
            return { allowed: false, error: 'Transaction failed' }
        }

        const tx = await provider.getTransaction(txHash)
        if (!tx) {
            return { allowed: false, error: 'Could not fetch transaction' }
        }

        const expectedAmount = BigInt(expectedAmountWei)
        const actualRecipient = tx.to?.toLowerCase()
        const actualAmount = tx.value

        const isValidTransfer = (
            actualRecipient === expectedRecipient.toLowerCase()
            && actualAmount === expectedAmount
        )

        if (!isValidTransfer && receipt.logs.length > 0) {
            const TRANSFER_EVENT_SIG = ethers.id('Transfer(address,address,uint256)')

            const validTokenTransfer = receipt.logs.some((log) => {
                if (log.topics[0] !== TRANSFER_EVENT_SIG) return false

                try {
                    const to = ethers.getAddress('0x' + log.topics[2].slice(26))
                    const value = BigInt(log.data)

                    return (
                        to.toLowerCase() === expectedRecipient.toLowerCase()
                        && value === expectedAmount
                    )
                } catch {
                    return false
                }
            })

            if (validTokenTransfer) {
                return { allowed: true, txHash, type: 'token' }
            }
        }

        if (!isValidTransfer) {
            return { allowed: false, error: 'Transfer mismatch or invalid format' }
        }

        return { allowed: true, txHash, type: 'eth' }
    } catch (err: any) {
        if (err.code === 'INVALID_ARGUMENT') return { allowed: false, error: 'Invalid transaction format' }
        if (err.code === 'NETWORK_ERROR') return { allowed: false, error: 'Network connection error' }
        if (err.code === 'NONCE_EXPIRED') return { allowed: false, error: 'Transaction nonce already used' }
        return { allowed: false, error: err.message || 'Internal Server Error' }
    }
}
