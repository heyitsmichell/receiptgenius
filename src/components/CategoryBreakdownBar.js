import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius } from '../theme/theme';

export default function CategoryBreakdownBar({ categoryBreakdown, totalSpend }) {
  const categories = Object.keys(categoryBreakdown || {});

  if (categories.length === 0 || !totalSpend) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Spending by Category</Text>
        <Text style={styles.emptyText}>No spending recorded yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Spending by Category</Text>

      {/* Multi-color horizontal stacked progress bar */}
      <View style={styles.stackedBarContainer}>
        {categories.map((category, index) => {
          const amount = categoryBreakdown[category];
          const widthPercent = Math.max(2, (amount / totalSpend) * 100);
          const color = colors.categories[category] || colors.primary;

          return (
            <View
              key={category}
              style={[
                styles.barSegment,
                {
                  width: `${widthPercent}%`,
                  backgroundColor: color,
                  borderTopLeftRadius: index === 0 ? borderRadius.full : 0,
                  borderBottomLeftRadius: index === 0 ? borderRadius.full : 0,
                  borderTopRightRadius: index === categories.length - 1 ? borderRadius.full : 0,
                  borderBottomRightRadius: index === categories.length - 1 ? borderRadius.full : 0,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Legend & Details List */}
      <View style={styles.legendContainer}>
        {categories.map(category => {
          const amount = categoryBreakdown[category];
          const percent = ((amount / totalSpend) * 100).toFixed(1);
          const color = colors.categories[category] || colors.primary;

          return (
            <View key={category} style={styles.legendRow}>
              <View style={styles.legendLeft}>
                <View style={[styles.colorDot, { backgroundColor: color }]} />
                <Text style={styles.categoryName}>{category}</Text>
              </View>
              <View style={styles.legendRight}>
                <Text style={styles.amountText}>HKD {amount.toFixed(2)}</Text>
                <Text style={styles.percentText}>{percent}%</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: spacing.md,
  },
  stackedBarContainer: {
    height: 12,
    flexDirection: 'row',
    backgroundColor: colors.surfaceHigh,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  barSegment: {
    height: '100%',
  },
  legendContainer: {
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  categoryName: {
    fontSize: 14,
    color: colors.onSurface,
    fontWeight: '500',
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountText: {
    fontSize: 14,
    color: colors.onSurface,
    fontWeight: '600',
  },
  percentText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    width: 50,
    textAlign: 'right',
  },
  emptyText: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
  },
});
