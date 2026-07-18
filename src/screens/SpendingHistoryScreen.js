import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import ReceiptCard from '../components/ReceiptCard';
import ReceiptEditModal from '../components/ReceiptEditModal';
import CalendarPickerModal from '../components/CalendarPickerModal';
import { getReceipts } from '../services/storageService';
import { DATE_TIMEFRAMES, filterReceiptsByDate } from '../utils/dateFilters';

const FILTER_CATEGORIES = [
  'All',
  'Food & Dining',
  'Groceries',
  'Transportation',
  'Shopping',
  'Utilities & Bills',
  'Entertainment',
  'Healthcare',
  'Other',
];

export default function SpendingHistoryScreen() {
  const { colors } = useTheme();
  const [receipts, setReceipts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTimeframe, setSelectedTimeframe] = useState('All Time');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState('start');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const loadReceipts = async () => {
    const data = await getReceipts();
    setReceipts(data);
  };

  useFocusEffect(
    useCallback(() => {
      loadReceipts();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReceipts();
    setRefreshing(false);
  };

  const filteredReceipts = useMemo(() => {
    const byDate = filterReceiptsByDate(
      receipts,
      selectedTimeframe,
      customStartDate,
      customEndDate
    );
    return byDate.filter((r) => {
      const matchesSearch =
        (r.merchant || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.category || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'All' || r.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [
    receipts,
    searchQuery,
    selectedCategory,
    selectedTimeframe,
    customStartDate,
    customEndDate,
  ]);

  const filteredTotal = useMemo(() => {
    return filteredReceipts.reduce(
      (sum, r) => sum + Number(r.totalAmount || 0),
      0
    );
  }, [filteredReceipts]);

  const handleSelectReceipt = useCallback((receipt) => {
    setSelectedReceipt(receipt);
  }, []);

  const renderReceiptItem = useCallback(({ item }) => (
    <ReceiptCard
      receipt={item}
      onPress={handleSelectReceipt}
    />
  ), [handleSelectReceipt]);

  const keyExtractor = useCallback((item) => String(item.id), []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.onSurface }]}>Spending History</Text>
            <Text style={styles.subtitle}>
              {filteredReceipts.length} transactions recorded (HKD {filteredTotal.toFixed(2)})
            </Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search merchants or categories..."
            placeholderTextColor={colors.onSurfaceVariant}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Date Timeframe Pill Filters */}
        <View style={[styles.filterWrapper, { marginBottom: 6 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilters}
          >
            {DATE_TIMEFRAMES.map((tf) => {
              const selected = tf === selectedTimeframe;
              return (
                <TouchableOpacity
                  key={tf}
                  style={[
                    styles.timeframeChip,
                    selected && styles.timeframeChipSelected,
                  ]}
                  onPress={() => setSelectedTimeframe(tf)}
                >
                  <Text
                    style={[
                      styles.timeframeChipText,
                      selected && styles.timeframeChipTextSelected,
                    ]}
                  >
                    {tf === 'Custom Range' ? 'Custom Range' : tf}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Custom Date Range Input Row */}
        {selectedTimeframe === 'Custom Range' && (
          <View style={styles.customDateRow}>
            <View style={styles.customDateBox}>
              <Text style={styles.customDateLabel}>FROM (DD/MM/YY)</Text>
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => {
                  setCalendarTarget('start');
                  setCalendarVisible(true);
                }}
              >
                <Text style={styles.datePickerBtnText}>
                  {customStartDate || 'Select Start Date'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.customDateToText}>to</Text>
            <View style={styles.customDateBox}>
              <Text style={styles.customDateLabel}>TO (DD/MM/YY)</Text>
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => {
                  setCalendarTarget('end');
                  setCalendarVisible(true);
                }}
              >
                <Text style={styles.datePickerBtnText}>
                  {customEndDate || 'Select End Date'}
                </Text>
              </TouchableOpacity>
            </View>
            {(customStartDate !== '' || customEndDate !== '') && (
              <TouchableOpacity
                style={styles.customDateClearBtn}
                onPress={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
              >
                <Text style={styles.customDateClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Category Pill Filters */}
        <View style={styles.filterWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilters}
          >
            {FILTER_CATEGORIES.map((cat) => {
              const selected = cat === selectedCategory;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.filterChip,
                    selected && styles.filterChipSelected,
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selected && styles.filterChipTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Receipts List */}
        <FlatList
          data={filteredReceipts}
          renderItem={renderReceiptItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContainer}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No matching receipts found.</Text>
            </View>
          }
        />
      </View>

      <ReceiptEditModal
        visible={!!selectedReceipt}
        receipt={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        onUpdated={loadReceipts}
      />

      <CalendarPickerModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        initialDate={calendarTarget === 'start' ? customStartDate : customEndDate}
        title={calendarTarget === 'start' ? 'Select Start Date' : 'Select End Date'}
        onSelect={(dateStr) => {
          if (calendarTarget === 'start') {
            setCustomStartDate(dateStr);
          } else {
            setCustomEndDate(dateStr);
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.onSurface,
  },
  subtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: {
    backgroundColor: colors.surfaceHigh,
    color: colors.onSurface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  filterWrapper: {
    marginBottom: spacing.sm,
  },
  categoryFilters: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  filterChip: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  filterChipSelected: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: colors.onSurface,
    fontWeight: '700',
  },
  timeframeChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  timeframeChipSelected: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.primary,
  },
  timeframeChipText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  timeframeChipTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: 8,
  },
  customDateBox: {
    flex: 1,
  },
  customDateLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    marginBottom: 4,
  },
  datePickerBtn: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    justifyContent: 'center',
  },
  datePickerBtnText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  customDateToText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
    marginTop: 14,
  },
  customDateClearBtn: {
    marginTop: 14,
    backgroundColor: 'rgba(255, 100, 100, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 100, 100, 0.3)',
  },
  customDateClearText: {
    color: '#ff6b6b',
    fontSize: 13,
    fontWeight: '700',
  },
  listContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: colors.onSurfaceVariant,
    fontSize: 15,
  },
});
