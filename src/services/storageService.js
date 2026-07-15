/**
 * ReceiptGenius - AsyncStorage Local Persistence & Offline Queue Service
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const RECEIPTS_KEY = '@receiptgenius_receipts';
const SETTINGS_KEY = '@receiptgenius_settings';

const INITIAL_SAMPLE_RECEIPTS = [
  {
    id: 'REC-1001',
    merchant: 'Whole Foods Market',
    date: '2026-07-13',
    category: 'Groceries',
    subtotal: 78.40,
    tax: 6.85,
    totalAmount: 85.25,
    currency: 'USD',
    paymentMethod: 'Visa **4092',
    confidenceScore: 0.98,
    syncStatus: 'synced',
    lineItems: [
      { description: 'Organic Spinach', price: 4.99 },
      { description: 'Almond Milk 6-Pack', price: 14.50 },
      { description: 'Wild Salmon Fillet', price: 24.99 }
    ]
  },
  {
    id: 'REC-1002',
    merchant: 'Blue Bottle Coffee',
    date: '2026-07-12',
    category: 'Food & Dining',
    subtotal: 13.50,
    tax: 1.25,
    totalAmount: 14.75,
    currency: 'USD',
    paymentMethod: 'Apple Pay',
    confidenceScore: 0.99,
    syncStatus: 'synced',
    lineItems: [
      { description: 'Single Origin Oat Latte', price: 6.75 },
      { description: 'Almond Croissant', price: 6.75 }
    ]
  },
  {
    id: 'REC-1003',
    merchant: 'Uber Technologies',
    date: '2026-07-11',
    category: 'Transportation',
    subtotal: 28.00,
    tax: 2.50,
    totalAmount: 30.50,
    currency: 'USD',
    paymentMethod: 'Amex **1009',
    confidenceScore: 0.95,
    syncStatus: 'synced',
    lineItems: [
      { description: 'Ride to Airport Terminal 2', price: 28.00 }
    ]
  },
  {
    id: 'REC-1004',
    merchant: 'Apple Store Downtown',
    date: '2026-07-10',
    category: 'Shopping',
    subtotal: 129.00,
    tax: 11.29,
    totalAmount: 140.29,
    currency: 'USD',
    paymentMethod: 'Visa **4092',
    confidenceScore: 0.97,
    syncStatus: 'synced',
    lineItems: [
      { description: 'USB-C Braided Cable 2M', price: 29.00 },
      { description: 'AirPods Leather Case', price: 100.00 }
    ]
  }
];

export async function getReceipts() {
  try {
    const data = await AsyncStorage.getItem(RECEIPTS_KEY);
    if (!data) {
      await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(INITIAL_SAMPLE_RECEIPTS));
      return INITIAL_SAMPLE_RECEIPTS;
    }
    return JSON.parse(data);
  } catch (error) {
    console.warn('Error fetching receipts:', error);
    return INITIAL_SAMPLE_RECEIPTS;
  }
}

export async function saveReceipt(newReceipt) {
  try {
    const existing = await getReceipts();
    const updated = [newReceipt, ...existing.filter(r => r.id !== newReceipt.id)];
    await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.warn('Error saving receipt:', error);
    return [];
  }
}

export async function saveReceipts(receipts) {
  try {
    await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts));
    return receipts;
  } catch (error) {
    console.warn('Error saving receipts array:', error);
    return [];
  }
}

export async function deleteReceipt(id) {
  try {
    const existing = await getReceipts();
    const updated = existing.filter((r) => r.id !== id);
    await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.warn('Error deleting receipt:', error);
    return [];
  }
}

export async function updateReceiptSyncStatus(id, status) {
  try {
    const existing = await getReceipts();
    const updated = existing.map(r => r.id === id ? { ...r, syncStatus: status } : r);
    await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.warn('Error updating status:', error);
    return [];
  }
}

export async function getSettings() {
  try {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!data) {
      return {
        geminiApiKey: '',
        webhookUrl: '',
      };
    }
    return JSON.parse(data);
  } catch (error) {
    return { geminiApiKey: '', webhookUrl: '' };
  }
}

export async function saveSettings(settings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    return false;
  }
}

const EXPORT_HISTORY_KEY = '@receiptgenius_export_history';

const INITIAL_EXPORT_HISTORY = [
  {
    id: '1',
    type: 'Auto-Sync',
    details: '12 receipts exported to ReceiptGenius Expenses 2026',
    time: 'Today\n10:42 AM',
    status: 'success',
  },
  {
    id: '2',
    type: 'Manual Export',
    details: '5 receipts exported to ReceiptGenius Expenses 2026',
    time: 'Yesterday\n04:15 PM',
    status: 'success',
  },
];

export async function getExportHistory() {
  try {
    const data = await AsyncStorage.getItem(EXPORT_HISTORY_KEY);
    if (!data) {
      await AsyncStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(INITIAL_EXPORT_HISTORY));
      return INITIAL_EXPORT_HISTORY;
    }
    return JSON.parse(data);
  } catch (error) {
    return INITIAL_EXPORT_HISTORY;
  }
}

export async function saveExportHistory(history) {
  try {
    await AsyncStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    return false;
  }
}

const GOOGLE_SESSION_KEY = '@receiptgenius_google_session';

export async function getGoogleUserSession() {
  try {
    const data = await AsyncStorage.getItem(GOOGLE_SESSION_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

export async function saveGoogleUserSession(session) {
  try {
    if (!session || !session.signedIn) {
      await AsyncStorage.removeItem(GOOGLE_SESSION_KEY);
    } else {
      await AsyncStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify(session));
    }
    return true;
  } catch (error) {
    return false;
  }
}
