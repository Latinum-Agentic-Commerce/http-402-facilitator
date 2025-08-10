// utils/base-facilitator.ts

import { ethers } from 'ethers'

const BASE_RPC_URL = 'https://sepolia.base.org'
const CONFIRMATIONS = 3

export async function validateBaseTransaction({
    signedTransactionHex,
    expectedRecipient,
    expectedAmountWei
}): Promise<{ status: 'success' | 'payment_required' | 'failure'; txHash?: string; type?: 'eth' | 'token'; error?: string }> {
    try {
        const provider = new ethers.JsonRpcProvider(BASE_RPC_URL)

        if (!ethers.isAddress(expectedRecipient)) {
            return { 
                status: 'payment_required',
                error: `💳 Payment required: ${expectedAmountWei} wei to ${expectedRecipient}. Please provide a signed transaction. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet` 
            }
        }

        const txResponse = await provider.broadcastTransaction(signedTransactionHex)
        const txHash = txResponse.hash

        const receipt = await txResponse.wait(CONFIRMATIONS)

        if (!receipt || receipt.status !== 1) {
            return { 
                status: 'failure',
                error: `Transaction failed or was reverted` 
            }
        }

        const tx = await provider.getTransaction(txHash)
        if (!tx) {
            return { 
                status: 'failure',
                error: `Could not retrieve transaction details` 
            }
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
                return { status: 'success', txHash, type: 'token' }
            }
        }

        if (!isValidTransfer) {
            return { 
                status: 'payment_required',
                error: `💳 Payment required: ${expectedAmountWei} wei to ${expectedRecipient}. Please provide a signed transaction. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet` 
            }
        }

        return { status: 'success', txHash, type: 'eth' }
    } catch (err: any) {
        // Most catch errors are because no transaction was provided (payment required)
        return { 
            status: 'payment_required',
            error: `💳 Payment required: ${expectedAmountWei} wei to ${expectedRecipient}. Please provide a signed transaction. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet` 
        }
    }
}
