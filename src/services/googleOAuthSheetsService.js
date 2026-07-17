import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { CONFIG } from '../config/config';

WebBrowser.maybeCompleteAuthSession();

const SHEETS_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/**
 * Dynamically loads Google Identity Services (GIS) script in the browser.
 */
export function loadGoogleIdentityScript() {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      reject(new Error('Google OAuth popup is only available in web browser mode.'));
      return;
    }
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services SDK.'));
    document.head.appendChild(script);
  });
}

/**
 * Prompts user to sign in with Google OAuth (Web popup OR Mobile system browser) and returns access token.
 */
export async function requestGoogleAccessToken() {
  if (Platform.OS !== 'web') {
    // Native Mobile (Android / iOS) using expo-auth-session & system browser
    try {
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'receiptgenius',
      });
      console.log('Mobile OAuth Redirect URI:', redirectUri);

      const authRequest = new AuthSession.AuthRequest({
        clientId: CONFIG.GOOGLE_OAUTH_CLIENT_ID,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
        ],
        redirectUri,
        responseType: AuthSession.ResponseType.Token,
      });

      const result = await authRequest.promptAsync(GOOGLE_DISCOVERY);
      if (
        result.type === 'success' &&
        (result.authentication?.accessToken || result.params?.access_token)
      ) {
        return result.authentication?.accessToken || result.params.access_token;
      } else {
        throw new Error('Google Sign-In was cancelled or failed on mobile.');
      }
    } catch (err) {
      console.error('Mobile Google OAuth Error:', err);
      throw new Error(err?.message || 'Failed to authenticate on mobile.');
    }
  }

  // Web Browser mode using Google Identity Services (GIS)
  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_OAUTH_CLIENT_ID,
        scope: SHEETS_SCOPE,
        callback: (response) => {
          if (response && response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error('OAuth token request was cancelled or failed.'));
          }
        },
        error_callback: (err) => {
          reject(new Error(err && err.message ? err.message : 'Google OAuth error'));
        },
      });

      client.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}


/**
 * Fetches Google Account profile information using access token.
 */
export async function fetchGoogleUserProfile(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error('Failed to retrieve user profile from Google OAuth API.');
  }
  return await res.json();
}

/**
 * Creates a brand new Google Spreadsheet on the user's Google Drive.
 */
export async function createGoogleSpreadsheet(accessToken, title = 'ReceiptGenius Live Ledger') {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title,
      },
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    const message = errorData.error?.message || 'Failed to create Google Spreadsheet.';
    throw new Error(message);
  }

  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;
  const spreadsheetUrl = sheetData.spreadsheetUrl;

  // Add bold header row
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: 'A1',
          majorDimension: 'ROWS',
          values: [
            [
              'Logged At',
              'Receipt ID',
              'Date',
              'Merchant',
              'Category',
              'Total (HKD)',
              'Tax (HKD)',
              'Currency / Notes',
              'Confidence Score',
              'Line Items Summary',
            ],
          ],
        }),
      }
    );
  } catch (err) {
    console.warn('Could not initialize header row:', err);
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    title,
  };
}

/**
 * Appends a receipt row directly to the user's Google Spreadsheet via REST API v4.
 */
export async function appendReceiptToGoogleSheet(accessToken, spreadsheetId, receipt) {
  const lineItemsText = Array.isArray(receipt.lineItems)
    ? receipt.lineItems.map((item) => `${item.description} (${item.totalPrice || item.price})`).join('; ')
    : '';

  const notesText = receipt.conversionNote || `Currency: ${receipt.currency || 'HKD'}`;

  const rowValues = [
    new Date().toISOString(),
    receipt.id || '',
    receipt.date || '',
    receipt.merchant || 'Unknown Merchant',
    receipt.category || 'General',
    receipt.totalAmount || 0,
    receipt.taxAmount || receipt.tax || 0,
    notesText,
    receipt.confidenceScore || 0,
    lineItemsText,
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: 'A1',
        majorDimension: 'ROWS',
        values: [rowValues],
      }),
    }
  );

  if (!res.ok) {
    const errObj = await res.json().catch(() => ({}));
    throw new Error(errObj.error?.message || 'Failed to append row to Google Sheets API.');
  }

  return await res.json();
}

/**
 * Updates an existing receipt row in Google Sheets matching receipt.id or merchant+total.
 * If not found, appends it as a new row.
 */
export async function updateReceiptInGoogleSheet(accessToken, spreadsheetId, receipt) {
  // 1. Fetch current rows from Sheet1 (or first sheet)
  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:J2000`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!getRes.ok) {
    throw new Error('Failed to fetch existing rows from Google Sheet for updating.');
  }

  const data = await getRes.json();
  const rows = data.values || [];

  // Find 1-based row index matching receipt.id OR merchant+total
  let foundRowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]) continue;
    const rowId = rows[i][1];
    const rowMerchant = rows[i][3];
    const rowTotal = Number(rows[i][5]);

    if (rowId && rowId === receipt.id) {
      foundRowIndex = i + 1;
      break;
    } else if (
      rowMerchant === receipt.merchant &&
      !isNaN(rowTotal) &&
      Math.abs(rowTotal - Number(receipt.totalAmount || 0)) < 0.05
    ) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex === -1) {
    // If not found, append as new row
    return await appendReceiptToGoogleSheet(accessToken, spreadsheetId, receipt);
  }

  const lineItemsText = Array.isArray(receipt.lineItems)
    ? receipt.lineItems.map((item) => `${item.description} (${item.totalPrice || item.price})`).join('; ')
    : '';

  const notesText = receipt.conversionNote || `Currency: ${receipt.currency || 'HKD'}`;
  const originalLogTime = rows[foundRowIndex - 1][0] || new Date().toISOString();

  const rowValues = [
    originalLogTime,
    receipt.id || '',
    receipt.date || '',
    receipt.merchant || 'Unknown Merchant',
    receipt.category || 'General',
    receipt.totalAmount || 0,
    receipt.taxAmount || receipt.tax || 0,
    notesText,
    receipt.confidenceScore || 0,
    lineItemsText,
  ];

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A${foundRowIndex}:J${foundRowIndex}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `A${foundRowIndex}:J${foundRowIndex}`,
        majorDimension: 'ROWS',
        values: [rowValues],
      }),
    }
  );

  if (!updateRes.ok) {
    const errObj = await updateRes.json().catch(() => ({}));
    throw new Error(errObj.error?.message || 'Failed to update row in Google Sheets.');
  }

  return await updateRes.json();
}

/**
 * Deletes a receipt row from Google Sheets matching receipt object or receiptId.
 */
export async function deleteReceiptFromGoogleSheet(accessToken, spreadsheetId, receiptOrId) {
  const receiptId = typeof receiptOrId === 'string' ? receiptOrId : receiptOrId?.id;
  const targetMerchant = typeof receiptOrId === 'object' ? receiptOrId.merchant : null;
  const targetTotal = typeof receiptOrId === 'object' ? Number(receiptOrId.totalAmount || 0) : null;

  // 1. Fetch rows to find matching row
  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:J2000`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!getRes.ok) {
    throw new Error('Failed to fetch existing rows for deletion.');
  }

  const data = await getRes.json();
  const rows = data.values || [];

  let foundRowIndex = -1; // 0-based index for deleteDimension
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]) continue;
    const rowId = rows[i][1];
    const rowMerchant = rows[i][3];
    const rowTotal = Number(rows[i][5]);

    if (rowId && rowId === receiptId) {
      foundRowIndex = i;
      break;
    } else if (
      targetMerchant &&
      rowMerchant === targetMerchant &&
      !isNaN(rowTotal) &&
      targetTotal !== null &&
      Math.abs(rowTotal - targetTotal) < 0.05
    ) {
      foundRowIndex = i;
      break;
    }
  }

  if (foundRowIndex === -1) {
    return { success: false, message: 'Row not found in Google Sheet' };
  }

  // 2. Fetch sheet metadata to get exact tab sheetId
  let sheetTabId = 0;
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      sheetTabId = metaData.sheets?.[0]?.properties?.sheetId ?? 0;
    }
  } catch (err) {
    console.warn('Could not fetch tab sheetId, defaulting to 0:', err);
  }

  // 3. Try batchUpdate deleteDimension first
  const delRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetTabId,
                dimension: 'ROWS',
                startIndex: foundRowIndex,
                endIndex: foundRowIndex + 1,
              },
            },
          },
        ],
      }),
    }
  );

  if (delRes.ok) {
    return { success: true, deletedRow: foundRowIndex + 1 };
  }

  // 4. Fallback: if deleteDimension fails, clear the row completely
  const rowNum = foundRowIndex + 1;
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A${rowNum}:J${rowNum}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!clearRes.ok) {
    throw new Error('Failed to delete/clear row from Google Sheet.');
  }

  return { success: true, clearedRow: rowNum };
}

/**
 * Fetches all receipt rows from Google Sheets (A1:J2000) and parses them into receipt objects.
 * Returns an array of parsed receipt objects from the spreadsheet.
 */
export async function pullReceiptsFromGoogleSheet(accessToken, spreadsheetId) {
  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:J2000`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!getRes.ok) {
    const errObj = await getRes.json().catch(() => ({}));
    throw new Error(errObj.error?.message || 'Failed to fetch rows from Google Sheets API.');
  }

  const data = await getRes.json();
  const rows = data.values || [];

  if (rows.length <= 1) {
    return [];
  }

  const pulledReceipts = [];
  // Skip row 0 (Header row)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const loggedAt = row[0] || '';
    const receiptId = row[1] ? String(row[1]).trim() : `pulled-${Date.now()}-${i}`;
    const dateStr = row[2] || (loggedAt ? loggedAt.split('T')[0] : new Date().toISOString().split('T')[0]);
    const merchant = row[3] || 'Unknown Merchant';
    const category = row[4] || 'General';
    const totalAmount = parseFloat(row[5]) || 0;
    const taxAmount = parseFloat(row[6]) || 0;
    const notesText = row[7] || '';
    const confidenceScore = parseFloat(row[8]) || 0.95;
    const lineItemsStr = row[9] || '';

    // Parse line items if present (format: "Item 1 (10.50); Item 2 (5.00)")
    const lineItems = [];
    if (lineItemsStr) {
      const parts = lineItemsStr.split(';');
      parts.forEach((p) => {
        const trimmed = p.trim();
        if (!trimmed) return;
        const match = trimmed.match(/^(.*?)\s*\(([^)]+)\)$/);
        if (match) {
          lineItems.push({
            description: match[1].trim(),
            price: match[2].trim(),
            totalPrice: parseFloat(match[2]) || 0,
          });
        } else {
          lineItems.push({
            description: trimmed,
            price: '',
            totalPrice: 0,
          });
        }
      });
    }

    pulledReceipts.push({
      id: receiptId,
      date: dateStr,
      merchant: merchant,
      category: category,
      totalAmount: totalAmount,
      taxAmount: taxAmount,
      currency: notesText.includes('Currency:')
        ? notesText.split('Currency:')[1].trim().split(' ')[0]
        : 'HKD',
      conversionNote: notesText,
      confidenceScore: confidenceScore,
      lineItems: lineItems,
      syncedToSheets: true,
      syncStatus: 'synced',
    });
  }

  return pulledReceipts;
}

