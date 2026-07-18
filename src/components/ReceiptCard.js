import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, borderRadius } from '../theme/theme';

export default function ReceiptCard({ receipt, onPress }) {
  const categoryColor = colors.categories[receipt.category] || colors.primary;
  const isSynced = receipt.syncStatus === 'synced' || receipt.syncedToSheets;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.card}
      onPress={() => onPress && onPress(receipt)}
    >
      <View style={styles.headerRow}>
        <View style={styles.merchantContainer}>
          <View style={[styles.categoryAccent, { backgroundColor: categoryColor }]} />
          <View>
            <Text style={styles.merchantText} numberOfLines={1}>
              {receipt.merchant || 'Unknown Merchant'}
            </Text>
            <Text style={styles.dateText}>{receipt.date}</Text>
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amountText}>
            HKD {Number(receipt.totalAmount || 0).toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.footerRow}>
        <View style={[styles.badge, { backgroundColor: colors.surfaceHigh }]}>
          <Text style={[styles.badgeText, { color: categoryColor }]}>
            {receipt.category || 'Other'}
          </Text>
        </View>

        <View style={styles.syncStatusContainer}>
          <View
            style={[
              styles.syncDot,
              { backgroundColor: isSynced ? colors.primary : colors.warning },
            ]}
          />
          <Text
            style={[
              styles.syncText,
              { color: isSynced ? colors.primary : colors.warning },
            ]}
          >
            {isSynced ? 'Sheets Synced' : 'Pending Sync'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  merchantContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryAccent: {
    width: 4,
    height: 36,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  merchantText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onSurface,
  },
  dateText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceHigh,
    paddingTop: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  syncStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
    marginRight: 6,
  },
  syncText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
