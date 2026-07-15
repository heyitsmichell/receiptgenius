import { Platform } from 'react-native';
import { CONFIG } from '../config/config';

const SHEETS_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

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
 * Prompts user to sign in with Google OAuth popup window and return access token.
 */
export async function requestGoogleAccessToken() {
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
