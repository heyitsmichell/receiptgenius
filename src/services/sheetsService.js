/**
 * ReceiptGenius - Google Sheets Integration Service
 * Posts structured receipt payload to Google Apps Script Webhook.
 */

import { CONFIG } from '../config/config';

/**
 * Sends receipt JSON data to Google Apps Script Webhook
 * @param {object} receiptData - Structured receipt object
 * @param {string} webhookUrl - Google Apps Script Web App URL
 * @returns {Promise<{success: boolean, message?: string, rowNumber?: number, error?: string}>}
 */
export async function pushToGoogleSheets(receiptData, webhookUrl) {
  const activeUrl = webhookUrl || CONFIG.GOOGLE_SHEETS_WEBHOOK_URL;

  if (!activeUrl || !activeUrl.startsWith('https://script.google.com')) {
    return {
      success: false,
      error: 'Invalid or missing Google Apps Script Webhook URL. Please set it in src/config/config.js.',
    };
  }

  try {
    const response = await fetch(activeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(receiptData),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with status ${response.status}`);
    }

    const result = await response.json();

    if (result.status === 'success') {
      return {
        success: true,
        message: result.message || 'Receipt synced to Google Sheets',
        rowNumber: result.rowNumber,
      };
    } else {
      throw new Error(result.message || 'Unknown webhook error');
    }
  } catch (error) {
    console.warn('Google Sheets sync error:', error);
    return {
      success: false,
      error: error.message || 'Failed to sync with Google Sheets',
    };
  }
}
