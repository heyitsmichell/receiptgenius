/**
 * ReceiptGenius - AsyncStorage Local Persistence & Offline Queue Service
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config/config';

const RECEIPTS_KEY = '@receiptgenius_receipts';
const SETTINGS_KEY = '@receiptgenius_settings';

const INITIAL_SAMPLE_RECEIPTS = [];

const PRESET_RECEIPT_IDS = ['REC-1001', 'REC-1002', 'REC-1003', 'REC-1004'];

export async function getReceipts() {
  try {
    const data = await AsyncStorage.getItem(RECEIPTS_KEY);
    if (!data) {
      return INITIAL_SAMPLE_RECEIPTS;
    }
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      const filtered = parsed.filter((r) => !PRESET_RECEIPT_IDS.includes(r.id));
      if (filtered.length !== parsed.length) {
        await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(filtered));
      }
      return filtered;
    }
    return INITIAL_SAMPLE_RECEIPTS;
  } catch (error) {
    console.warn('Error fetching receipts:', error);
    return INITIAL_SAMPLE_RECEIPTS;
  }
}

export async function clearPresetData() {
  try {
    const existingReceipts = await getReceipts();
    const updatedReceipts = existingReceipts.filter((r) => !PRESET_RECEIPT_IDS.includes(r.id));
    await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify(updatedReceipts));

    const existingHistory = await getExportHistory();
    const updatedHistory = existingHistory.filter((item) => {
      if (item.id === '1' && item.details === '12 receipts exported to ReceiptGenius Expenses 2026') return false;
      if (item.id === '2' && item.details === '5 receipts exported to ReceiptGenius Expenses 2026') return false;
      return true;
    });
    await AsyncStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(updatedHistory));
    return true;
  } catch (error) {
    console.warn('Error clearing preset data:', error);
    return false;
  }
}

export async function clearAllData() {
  try {
    await AsyncStorage.removeItem(RECEIPTS_KEY);
    await AsyncStorage.removeItem(EXPORT_HISTORY_KEY);
    return true;
  } catch (error) {
    console.warn('Error clearing all data:', error);
    return false;
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
        geminiApiKey: CONFIG.GEMINI_API_KEY || '',
        webhookUrl: CONFIG.GOOGLE_SHEETS_WEBHOOK_URL || '',
        autoSync: true,
      };
    }
    const parsed = JSON.parse(data);
    return {
      geminiApiKey: (parsed && parsed.geminiApiKey) || CONFIG.GEMINI_API_KEY || '',
      webhookUrl: (parsed && parsed.webhookUrl) || CONFIG.GOOGLE_SHEETS_WEBHOOK_URL || '',
      autoSync: parsed && parsed.autoSync !== undefined ? parsed.autoSync : true,
    };
  } catch (error) {
    return {
      geminiApiKey: CONFIG.GEMINI_API_KEY || '',
      webhookUrl: CONFIG.GOOGLE_SHEETS_WEBHOOK_URL || '',
      autoSync: true,
    };
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

const INITIAL_EXPORT_HISTORY = [];

export async function getExportHistory() {
  try {
    const data = await AsyncStorage.getItem(EXPORT_HISTORY_KEY);
    if (!data) {
      return INITIAL_EXPORT_HISTORY;
    }
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      const filtered = parsed.filter((item) => {
        if (item.id === '1' && item.details === '12 receipts exported to ReceiptGenius Expenses 2026') return false;
        if (item.id === '2' && item.details === '5 receipts exported to ReceiptGenius Expenses 2026') return false;
        return true;
      });
      if (filtered.length !== parsed.length) {
        await AsyncStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(filtered));
      }
      return filtered;
    }
    return INITIAL_EXPORT_HISTORY;
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
