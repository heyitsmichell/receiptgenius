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
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { getLiveHKDExchangeRates } from '../services/currencyService';

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

const INITIAL_CURRENCY_OPTIONS = [
  { code: 'HKD', symbol: 'HKD', rate: 1.0, label: 'HKD' },
  { code: 'USD', symbol: 'USD', rate: 7.82, label: 'USD' },
  { code: 'CNY', symbol: 'CNY', rate: 1.08, label: 'CNY' },
  { code: 'JPY', symbol: 'JPY', rate: 0.051, label: 'JPY' },
  { code: 'EUR', symbol: 'EUR', rate: 8.45, label: 'EUR' },
  { code: 'GBP', symbol: 'GBP', rate: 10.05, label: 'GBP' },
  { code: 'SGD', symbol: 'SGD', rate: 5.80, label: 'SGD' },
];

export default function ReceiptReviewModal({
  visible,
  receiptData,
  errorMessage,
  onConfirm,
  onCancel,
}) {
  const { colors } = useTheme();
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('Food & Dining');
  const [selectedCurr, setSelectedCurr] = useState('HKD');
  const [currencyOptions, setCurrencyOptions] = useState(INITIAL_CURRENCY_OPTIONS);
  const [isLiveRates, setIsLiveRates] = useState(false);
  const [totalAmount, setTotalAmount] = useState('');
  const [tax, setTax] = useState('');

  useEffect(() => {
    if (visible) {
      (async () => {
        const liveRates = await getLiveHKDExchangeRates();
        if (liveRates) {
          const updatedOptions = INITIAL_CURRENCY_OPTIONS.map((opt) => ({
            ...opt,
            rate: liveRates[opt.code] || opt.rate,
          }));
          setCurrencyOptions(updatedOptions);
          setIsLiveRates(true);
        }
      })();
    }
  }, [visible]);

  useEffect(() => {
    if (receiptData) {
      setMerchant(receiptData.merchant || '');
      setDate(receiptData.date || new Date().toISOString().split('T')[0]);
      setCategory(receiptData.category || 'Food & Dining');
      setSelectedCurr(receiptData.originalCurrency || 'HKD');
      setTotalAmount(receiptData.totalAmount ? String(receiptData.totalAmount) : '');
      setTax(receiptData.tax ? String(receiptData.tax) : '0');
    }
  }, [receiptData]);

  const handleSave = () => {
    const rawTotal = parseFloat(totalAmount) || 0;
    const rawTax = parseFloat(tax) || 0;
    const currObj =
      currencyOptions.find((c) => c.code === selectedCurr) || currencyOptions[0];

    const isHKD = selectedCurr === 'HKD';
    const convertedTotal = isHKD ? rawTotal : Number((rawTotal * currObj.rate).toFixed(2));
    const convertedTax = isHKD ? rawTax : Number((rawTax * currObj.rate).toFixed(2));
    const convertedSubtotal = Number((convertedTotal - convertedTax).toFixed(2));

    const conversionNote = isHKD
      ? 'Original currency HKD'
      : `Converted from ${selectedCurr} ${rawTotal.toFixed(2)} at ${currObj.rate} HKD/${selectedCurr} -> HKD ${convertedTotal.toFixed(2)}`;

    const updatedReceipt = {
      ...(receiptData || {}),
      id: receiptData?.id || 'REC-' + Date.now(),
      merchant: merchant.trim() || 'Manual Entry',
      date: date.trim() || new Date().toISOString().split('T')[0],
      category,
      currency: 'HKD',
      originalCurrency: selectedCurr,
      conversionNote,
      totalAmount: convertedTotal,
      tax: convertedTax,
      subtotal: convertedSubtotal,
      confidenceScore: errorMessage ? 0.99 : receiptData?.confidenceScore || 0.95,
      syncStatus: 'pending',
    };
    onConfirm(updatedReceipt);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBackdrop}
      >
        <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}>
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            <Text style={[styles.title, { color: colors.onSurface }]}>
              {errorMessage ? 'Manual Input Mode' : 'Verify AI Receipt Data'}
            </Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>MERCHANT / STORE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.surfaceHighest }]}
              placeholder="e.g. Whole Foods"
              placeholderTextColor={colors.onSurfaceVariant}
              value={merchant}
              onChangeText={setMerchant}
            />

            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.surfaceHighest }]}
              placeholder="2026-07-14"
              placeholderTextColor={colors.onSurfaceVariant}
              value={date}
              onChangeText={setDate}
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
                        selected && { color: colors.onSurface },
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>CURRENCY ON RECEIPT</Text>
              <Text style={{ fontSize: 10, color: isLiveRates ? '#4edea3' : colors.onSurfaceVariant, fontWeight: '600', marginBottom: 6 }}>
                {isLiveRates ? '📡 Live Forex Rates' : '📊 Standard Rates'}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {currencyOptions.map((curr) => {
                  const active = curr.code === selectedCurr;
                  return (
                    <TouchableOpacity
                      key={curr.code}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHighest },
                        active && {
                          backgroundColor: colors.primaryContainer,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => setSelectedCurr(curr.code)}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          { color: colors.onSurfaceVariant },
                          active && { color: colors.onSurface, fontWeight: '700' },
                        ]}
                      >
                        {curr.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {selectedCurr !== 'HKD' ? (
              <View
                style={{
                  backgroundColor: 'rgba(78, 222, 163, 0.12)',
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(78, 222, 163, 0.3)',
                }}
              >
                <Text style={{ color: '#4edea3', fontSize: 12, fontWeight: '600' }}>
                  Auto-converts {selectedCurr} to HKD upon saving (Rate: ~
                  {
                    currencyOptions.find((c) => c.code === selectedCurr)?.rate
                  }{' '}
                  HKD/{selectedCurr})
                </Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>
                  TOTAL AMOUNT ({selectedCurr})
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.surfaceHighest }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.onSurfaceVariant}
                  keyboardType="decimal-pad"
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                />
              </View>
              <View style={styles.col}>
                <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>TAX ({selectedCurr})</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.surfaceHighest }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.onSurfaceVariant}
                  keyboardType="decimal-pad"
                  value={tax}
                  onChangeText={setTax}
                />
              </View>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceHigh }]} onPress={onCancel}>
                <Text style={[styles.cancelButtonText, { color: colors.onSurfaceVariant }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleSave}>
                <Text style={styles.confirmButtonText}>Save & Sync to Sheets</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 19, 38, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '90%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  scrollContainer: {
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: spacing.md,
  },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '500',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    marginBottom: 6,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    color: colors.onSurface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  categoryChip: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  categoryChipText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  col: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.surfaceHigh,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.onSurfaceVariant,
    fontWeight: '600',
    fontSize: 15,
  },
  confirmButton: {
    flex: 2,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});
