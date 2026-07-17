/**
 * ReceiptGenius Configuration
 * Values are loaded from environment variables (.env file via Expo).
 * Copy .env.example to .env and fill in your credentials locally.
 */

export const CONFIG = {
  // 1. Google AI Studio API Key (loaded from EXPO_PUBLIC_GEMINI_API_KEY in .env)
  GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',

  // 2. Select the AI Studio Model to use for OCR scanning:
  //   - 'gemma-4-31b-it' (Google AI Studio official Gemma Instruction-Tuned Multimodal Model)
  //   - 'gemini-flash-latest'
  GEMINI_MODEL: process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemma-4-31b-it',

  // 3. Google Apps Script Web App URL (optional, loaded from EXPO_PUBLIC_WEBHOOK_URL in .env)
  GOOGLE_SHEETS_WEBHOOK_URL: process.env.EXPO_PUBLIC_WEBHOOK_URL || '',

  // 4. Google OAuth 2.0 Client ID for direct Sheets REST API syncing (loaded from EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID in .env):
  GOOGLE_OAUTH_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '',

  // 5. Vercel Web App URL for hybrid mobile shell (optional, loaded from EXPO_PUBLIC_VERCEL_APP_URL in .env):
  VERCEL_APP_URL: process.env.EXPO_PUBLIC_VERCEL_APP_URL || '',
};
