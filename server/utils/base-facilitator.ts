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
            return { allowed: false, error: `💳 Payment required: ${expectedAmountWei} wei to ${expectedRecipient}. Please provide a signed transaction. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet` }
        }

        const txResponse = await provider.broadcastTransaction(signedTransactionHex)
        const txHash = txResponse.hash

        const receipt = await txResponse.wait(CONFIRMATIONS)

        if (!receipt || receipt.status !== 1) {
            return { allowed: false, error: `💳 Payment required: ${expectedAmountWei} wei to ${expectedRecipient}. Please provide a signed transaction. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet` }
        }

        const tx = await provider.getTransaction(txHash)
        if (!tx) {
            return { allowed: false, error: `💳 Payment required: ${expectedAmountWei} wei to ${expectedRecipient}. Please provide a signed transaction. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet` }
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
            return { allowed: false, error: `💳 Payment required: ${expectedAmountWei} wei to ${expectedRecipient}. Please provide a signed transaction. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet` }
        }

        return { allowed: true, txHash, type: 'eth' }
    } catch (err: any) {
        return { allowed: false, error: `💳 Payment required: ${expectedAmountWei} wei to ${expectedRecipient}. Please provide a signed transaction. If you don't have a wallet, try Latinum MCP Wallet at https://pypi.org/project/latinum-wallet-mcp. Instructions in: https://latinum.ai/articles/latinum-wallet` }
    }
}
