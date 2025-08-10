import { defineNuxtConfig } from "nuxt/config";

// nuxt.config.ts
export default defineNuxtConfig({
    compatibilityDate: '2025-08-09', // match your nitro warning
    devtools: { enabled: true },
    modules: [
        '@nuxtjs/tailwindcss'
    ],
    nitro: {
        // Keep existing Nitro API handlers working
    }
})