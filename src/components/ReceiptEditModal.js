import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import {
  saveReceipt,
  deleteReceipt,
  getGoogleUserSession,
  getExportHistory,
  saveExportHistory,
} from '../services/storageService';
import {
  updateReceiptInGoogleSheet,
  deleteReceiptFromGoogleSheet,
} from '../services/googleOAuthSheetsService';

const CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Transportation',
  'Shopping',
  'Utilities & Bills',
  'Entertainment',
  'Healthcare',
  'Other',
];

export default function ReceiptEditModal({
  visible,
  receipt,
  onClose,
  onUpdated,
}) {
  const { colors } = useTheme();
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('Food & Dining');
  const [totalAmount, setTotalAmount] = useState('');
  const [tax, setTax] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState('');

  useEffect(() => {
    if (receipt) {
      setMerchant(receipt.merchant || '');
      setDate(receipt.date || new Date().toISOString().split('T')[0]);
      setCategory(receipt.category || 'Food & Dining');
      setTotalAmount(receipt.totalAmount ? String(receipt.totalAmount) : '');
      setTax(receipt.tax ? String(receipt.tax) : '0');
      setNotes(receipt.conversionNote || `Currency: ${receipt.currency || 'HKD'}`);
    }
  }, [receipt]);

  const handleSave = async () => {
    if (!receipt) return;
    setLoading(true);
    setLoadingAction('Saving & Updating Google Sheet...');

    const updatedReceipt = {
      ...receipt,
      merchant: merchant.trim() || 'Manual Entry',
      date: date.trim() || new Date().toISOString().split('T')[0],
      category,
      totalAmount: parseFloat(totalAmount) || 0,
      tax: parseFloat(tax) || 0,
      subtotal: (parseFloat(totalAmount) || 0) - (parseFloat(tax) || 0),
      conversionNote: notes.trim(),
    };

    let sheetUpdated = false;
    const googleSession = await getGoogleUserSession();

    if (
      googleSession &&
      googleSession.signedIn &&
      googleSession.accessToken &&
      googleSession.spreadsheetId
    ) {
      try {
        await updateReceiptInGoogleSheet(
          googleSession.accessToken,
          googleSession.spreadsheetId,
          updatedReceipt
        );
        sheetUpdated = true;

        // Add to Export History
        const history = await getExportHistory();
        const nowStr = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        const newEntry = {
          id: String(Date.now()),
          type: 'Updated Receipt',
          details: `Updated "${updatedReceipt.merchant}" row in Google Sheet`,
          time: `Today\n${nowStr}`,
          status: 'success',
        };
        await saveExportHistory([newEntry, ...history]);
      } catch (err) {
        console.warn('Google Sheet update error:', err);
      }
    }

    updatedReceipt.syncedToSheets = sheetUpdated;
    updatedReceipt.syncStatus = sheetUpdated ? 'synced' : receipt.syncStatus;

    await saveReceipt(updatedReceipt);
    setLoading(false);

    // Refresh app immediately
    if (onUpdated) onUpdated();
    if (onClose) onClose();

    Alert.alert(
      sheetUpdated ? 'Updated Google Sheet!' : 'Receipt Updated Locally',
      sheetUpdated
        ? `"${updatedReceipt.merchant}" was updated locally and synced to your Google Sheet.`
        : 'Receipt changes saved locally.'
    );
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  const executeDelete = async () => {
    if (!receipt) return;
    setLoading(true);
    setLoadingAction('Deleting from Google Sheet...');

    let sheetDeleted = false;
    const googleSession = await getGoogleUserSession();

    if (
      googleSession &&
      googleSession.signedIn &&
      googleSession.accessToken &&
      googleSession.spreadsheetId
    ) {
      try {
        await deleteReceiptFromGoogleSheet(
          googleSession.accessToken,
          googleSession.spreadsheetId,
          receipt
        );
        sheetDeleted = true;

        // Add to Export History
        const history = await getExportHistory();
        const nowStr = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        const newEntry = {
          id: String(Date.now()),
          type: 'Deleted Receipt',
          details: `Deleted "${receipt.merchant}" from Google Sheet`,
          time: `Today\n${nowStr}`,
          status: 'success',
        };
        await saveExportHistory([newEntry, ...history]);
      } catch (err) {
        console.warn('Google Sheet delete error:', err);
      }
    }

    await deleteReceipt(receipt.id);
    setLoading(false);
    setConfirmDelete(false);

    // Refresh app right away before triggering alert
    if (onUpdated) onUpdated();
    if (onClose) onClose();

    Alert.alert(
      sheetDeleted ? 'Deleted from Google Sheet! 🗑️' : 'Deleted Locally',
      sheetDeleted
        ? `"${receipt.merchant}" has been deleted locally and removed from your Google Sheet.`
        : 'Receipt deleted locally.'
    );
  };

  if (!visible || !receipt) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.onSurface }]}>Edit / Delete Receipt</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.closeBtn, { color: colors.onSurfaceVariant }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.onSurfaceVariant }]}>{loadingAction}</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>MERCHANT</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.surfaceHighest }]}
                value={merchant}
                onChangeText={setMerchant}
                placeholder="Merchant Name"
                placeholderTextColor={colors.onSurfaceVariant}
              />

              <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>DATE (YYYY-MM-DD)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.surfaceHighest }]}
                value={date}
                onChangeText={setDate}
                placeholder="2026-07-14"
                placeholderTextColor={colors.onSurfaceVariant}
              />

              <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>CATEGORY</Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((cat) => {
                  const selected = cat === category;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHighest },
                        selected && {
                          backgroundColor: colors.primaryContainer,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          { color: colors.onSurfaceVariant },
                          selected && { color: colors.onSurface, fontWeight: '700' },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>TOTAL AMOUNT</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.surfaceHighest }]}
                    value={totalAmount}
                    onChangeText={setTotalAmount}
                    placeholder="0.00"
                    placeholderTextColor={colors.onSurfaceVariant}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>TAX AMOUNT</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.surfaceHighest }]}
                    value={tax}
                    onChangeText={setTax}
                    placeholder="0.00"
                    placeholderTextColor={colors.onSurfaceVariant}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>NOTES / CURRENCY</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.surfaceHighest }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes"
                placeholderTextColor={colors.onSurfaceVariant}
              />

              <View style={styles.actionSection}>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>Save & Update Sheet</Text>
                </TouchableOpacity>

                {confirmDelete ? (
                  <View style={styles.confirmBox}>
                    <Text style={styles.confirmText}>
                      ⚠️ Delete "{receipt.merchant}" permanently from local storage & Google Sheet?
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <TouchableOpacity
                        style={[styles.confirmBtnCancel, { flex: 1, backgroundColor: colors.surfaceHigh }]}
                        onPress={() => setConfirmDelete(false)}
                      >
                        <Text style={[styles.confirmBtnCancelText, { color: colors.onSurface }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.confirmBtnDelete, { flex: 1, backgroundColor: colors.error }]}
                        onPress={executeDelete}
                      >
                        <Text style={styles.confirmBtnDeleteText}>Yes, Delete Forever</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.deleteBtn, { borderColor: colors.error }]}
                    onPress={() => setConfirmDelete(true)}
                  >
                    <Text style={[styles.deleteBtnText, { color: colors.error }]}>🗑️ Delete Receipt</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
  },
  closeBtn: {
    fontSize: 22,
    color: colors.onSurfaceVariant,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: colors.onSurfaceVariant,
    marginTop: 12,
    fontSize: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: borderRadius.md,
    padding: 12,
    color: colors.onSurface,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  categoryChipText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
  },
  actionSection: {
    marginTop: 24,
    gap: 12,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#0D1117',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBox: {
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderWidth: 1,
    borderColor: colors.error,
    padding: 14,
    borderRadius: borderRadius.md,
  },
  confirmText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtnCancel: {
    backgroundColor: colors.surfaceHigh,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  confirmBtnCancelText: {
    color: colors.onSurface,
    fontWeight: '600',
  },
  confirmBtnDelete: {
    backgroundColor: colors.error,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  confirmBtnDeleteText: {
    color: '#0D1117',
    fontWeight: '700',
  },
});
