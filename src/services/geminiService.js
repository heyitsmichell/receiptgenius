/**
 * ReceiptGenius - Gemini Multimodal Vision OCR Service
 * Sends Base64 image payload to Google Gemini API with a strict JSON response schema
 * and provides robust error handling with fallback messages.
 */

import { CONFIG } from '../config/config';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const GEMINI_OCR_PROMPT = `
You are an expert financial OCR receipt scanner. Analyze the provided receipt image and extract all transaction details with extreme accuracy.
Return ONLY a valid JSON object matching the requested schema. If a field is illegible or missing, use reasonable defaults or null, but never violate the schema types.
Always output the default currency code as "HKD".

Categorize the merchant into exactly one of these categories:
["Food & Dining", "Groceries", "Transportation", "Shopping", "Utilities & Bills", "Entertainment", "Healthcare", "Other"]
`.trim();

export const RECEIPT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: {
      type: 'STRING',
      description: 'Name of the store or merchant',
    },
    date: {
      type: 'STRING',
      description: 'Date of transaction in YYYY-MM-DD format',
    },
    category: {
      type: 'STRING',
      enum: [
        'Food & Dining',
        'Groceries',
        'Transportation',
        'Shopping',
        'Utilities & Bills',
        'Entertainment',
        'Healthcare',
        'Other',
      ],
    },
    subtotal: {
      type: 'NUMBER',
      description: 'Subtotal amount before tax in HKD',
    },
    tax: {
      type: 'NUMBER',
      description: 'Tax amount in HKD',
    },
    totalAmount: {
      type: 'NUMBER',
      description: 'Total charged amount in HKD',
    },
    currency: {
      type: 'STRING',
      description: 'Default target currency code: HKD',
    },
    originalCurrency: {
      type: 'STRING',
      description: 'Detected original currency printed on receipt e.g. USD, JPY, HKD',
    },
    originalTotalAmount: {
      type: 'NUMBER',
      description: 'Total charged amount in original currency before conversion',
    },
    exchangeRate: {
      type: 'NUMBER',
      description: 'Exchange rate used to convert to HKD (1.0 if already HKD)',
    },
    conversionNote: {
      type: 'STRING',
      description: 'Explanation of currency conversion if performed',
    },
    paymentMethod: {
      type: 'STRING',
      description: 'Payment method e.g. Visa **1234, Cash',
    },
    confidenceScore: {
      type: 'NUMBER',
      description: 'OCR confidence score between 0.0 and 1.0',
    },
    lineItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          price: { type: 'NUMBER' },
        },
      },
    },
  },
  required: ['merchant', 'date', 'category', 'totalAmount', 'currency', 'confidenceScore'],
};

/**
 * Scan receipt image base64 using Gemini API
 * @param {string} base64Image - Base64 encoded image string (without data:image prefix or with it)
 * @param {string} apiKey - Google AI Studio API Key
 * @returns {Promise<{success: boolean, data?: object, error?: string, requiresManualInput?: boolean}>}
 */
export async function scanReceiptImage(base64Image, apiKey) {
  const activeKey = apiKey || CONFIG.GEMINI_API_KEY;
  const configuredModel = CONFIG.GEMINI_MODEL || 'gemma-4-31b-it';
  // Map legacy/HuggingFace model ID to Google AI Studio's active instruction-tuned Gemma vision endpoint
  const activeModel =
    configuredModel === 'gemma-3-12b-it' ? 'gemma-4-31b-it' : configuredModel;

  if (!activeKey) {
    return {
      success: false,
      error: 'Google AI Studio API Key is missing. Please enter it in src/config/config.js.',
      requiresManualInput: true,
    };
  }

  // Clean base64 string if it contains data URL header
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

  const payload = {
    contents: [
      {
        parts: [
          { text: GEMINI_OCR_PROMPT },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      topK: 32,
      responseMimeType: 'application/json',
      responseSchema: RECEIPT_RESPONSE_SCHEMA,
    },
  };

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/${activeModel}:generateContent?key=${activeKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
    }

    const jsonResponse = await response.json();
    const candidateText =
      jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('AI API returned an empty response.');
    }

    // Strip markdown code fences if present (e.g. ```json ... ```)
    const cleanJsonText = candidateText
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsedReceipt = JSON.parse(cleanJsonText);

    // Validate essential fields
    const totalAmount = Number(parsedReceipt.totalAmount || 0);
    const confidence = Number(parsedReceipt.confidenceScore ?? 1.0);

    if (confidence < 0.45) {
      return {
        success: true,
        lowConfidence: true,
        data: parsedReceipt,
        error: 'OCR detected low confidence on some fields. Please verify carefully.',
        requiresManualInput: true,
      };
    }

    return {
      success: true,
      data: {
        id: 'REC-' + Date.now(),
        merchant: parsedReceipt.merchant || 'Unknown Merchant',
        date: parsedReceipt.date || new Date().toISOString().split('T')[0],
        category: parsedReceipt.category || 'Other',
        subtotal: Number(parsedReceipt.subtotal || 0),
        tax: Number(parsedReceipt.tax || 0),
        totalAmount: totalAmount,
        currency: parsedReceipt.currency || 'USD',
        paymentMethod: parsedReceipt.paymentMethod || 'Card',
        confidenceScore: confidence,
        lineItems: Array.isArray(parsedReceipt.lineItems)
          ? parsedReceipt.lineItems
          : [],
      },
    };
  } catch (error) {
    console.warn('Gemini OCR scan failed:', error);
    return {
      success: false,
      error: `AI OCR could not clearly read this receipt (${error.message}). Please verify or enter details manually.`,
      requiresManualInput: true,
      data: {
        id: 'REC-' + Date.now(),
        merchant: '',
        date: new Date().toISOString().split('T')[0],
        category: 'Food & Dining',
        subtotal: 0,
        tax: 0,
        totalAmount: 0,
        currency: 'USD',
        paymentMethod: 'Card',
        confidenceScore: 0,
        lineItems: [],
      },
    };
  }
}
