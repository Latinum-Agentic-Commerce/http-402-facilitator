import bs58 from 'bs58'
import { Keypair as SolanaKeypair } from '@solana/web3.js'
// import { Wallet as EthersWallet } from 'ethers'

export function getSolanaFeePayerKeypair() {
    const base58Key = process.env.SOLANA_FEE_PAYER_PRIVATE_KEY
    if (!base58Key) throw new Error('Missing SOLANA_FEE_PAYER_PRIVATE_KEY in .env')
    const secretKey = bs58.decode(base58Key)
    return SolanaKeypair.fromSecretKey(secretKey)
}

/*
export function getBaseWallet() {
    const pk = process.env.BASE_FEE_PAYER_PRIVATE_KEY
    if (!pk) throw new Error('Missing BASE_FEE_PAYER_PRIVATE_KEY in .env')
    return new EthersWallet(pk)
}*/
