# 🔏 HTTP-402 Facilitator

[https://latinum.ai](https://latinum.ai)   
[Latinum Tutorial](https://latinum.ai/articles/latinum-wallet)

This project provides two stateless validators ("facilitators") for processing cryptographically verifiable payments used by Multi-Agent Commerce Protocol (MCP) tools:

1. **Solana Facilitator** – validates signed Solana transactions
2. **Base Facilitator** – validates signed Ethereum L2 (Base) transactions

Both facilitators are exposed via a unified endpoint: `/api/facilitator`.

If you have questions or need help, contact us at [dennj@latinum.ai](mailto:dennj@latinum.ai).


## 📦 Prerequisites

- Node.js `^18.x` or higher ([nvm recommended](https://github.com/nvm-sh/nvm))
- `npm` or `pnpm`

## 🚀 Install & Run

### 1. Install dependencies

```bash
npx npm-check-updates -u
npm install
# or
pnpm install
```

### 2. Start the server

```bash
npx nitro dev
```

Server runs at: `http://localhost:3000/`

## 🔀 Unified Facilitator Endpoint

### 🔁 `POST /api/facilitator`

The payload must include a `chain` field set to either `solana` or `base`, and corresponding transaction metadata.

---

## 🌉 Base Facilitator (Ethereum L2: Base)

### 🧾 Request Payload

```json
{
  "chain": "base",
  "signedTransactionHex": "<hex string>",
  "expectedRecipient": "0xRecipientAddress",
  "expectedAmountWei": "50000000000000000"
}
```

### ✅ Response

```json
{
  "allowed": true,
  "txHash": "0x...",
  "type": "eth" | "token"
}
```

### 🧪 Example (cURL)

```bash
curl -X POST http://localhost:3000/api/facilitator \
  -H "Content-Type: application/json" \
  -d '{
    "chain": "base",
    "signedTransactionHex": "0xABC123...",
    "expectedRecipient": "0x123abc...",
    "expectedAmountWei": "50000000000000000"
  }'
```

## ⚙️ Solana Facilitator

### 🧾 Request Payload

```json
{
  "chain": "solana",
  "signedTransactionB64": "<base64 string>",
  "expectedRecipient": "RecipientSolanaAddress",
  "expectedAmountLamports": 50000
}
```

### ✅ Response

```json
{
  "allowed": true,
  "txid": "3Xyz..."
}
```

### 🧪 Example (cURL)

```bash
curl -X POST http://localhost:3000/api/facilitator \
  -H "Content-Type: application/json" \
  -d '{
    "chain": "solana",
    "signedTransactionB64": "ABC123...",
    "expectedRecipient": "3BMEwjrn9gBfSetARPrAK1nPTXMRsvQzZLN1n4CYjpcU",
    "expectedAmountLamports": 50000
  }'
```

---

Let us know if you'd like to contribute, suggest improvements, or report issues.

**Join our community:** [WhatsApp Group](https://chat.whatsapp.com/Ever8ohOJRE3D6r5bLPViQ)