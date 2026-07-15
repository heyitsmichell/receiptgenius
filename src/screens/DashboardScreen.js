import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius } from '../theme/theme';
import CategoryBreakdownBar from '../components/CategoryBreakdownBar';
import ReceiptCard from '../components/ReceiptCard';
import ReceiptEditModal from '../components/ReceiptEditModal';
import { getReceipts } from '../services/storageService';
import { getLiveHKDExchangeRates } from '../services/currencyService';

const CURRENCY_SYMBOLS = {
  HKD: 'HK$',
  USD: 'US$',
  CNY: '¥',
  JPY: '¥',
  EUR: '€',
  GBP: '£',
  SGD: 'S$',
};

const AVAILABLE_CURRENCIES = ['HKD', 'USD', 'CNY', 'JPY', 'EUR', 'GBP', 'SGD'];

export default function DashboardScreen({ navigation }) {
  const [receipts, setReceipts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const [displayCurrency, setDisplayCurrency] = useState('HKD');
  const [fxRates, setFxRates] = useState({
    HKD: 1.0,
    USD: 7.82,
    CNY: 1.08,
    JPY: 0.051,
    EUR: 8.45,
    GBP: 10.05,
    SGD: 5.80,
  });

  const loadData = async () => {
    const data = await getReceipts();
    setReceipts(data);

    try {
      const rates = await getLiveHKDExchangeRates();
      if (rates) setFxRates(rates);

      const savedCurr = await AsyncStorage.getItem('dashboard_display_currency');
      if (savedCurr && AVAILABLE_CURRENCIES.includes(savedCurr)) {
        setDisplayCurrency(savedCurr);
      }
    } catch (e) {
      console.warn('Could not load currency settings:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCurrencyChange = async (curr) => {
    setDisplayCurrency(curr);
    try {
      await AsyncStorage.setItem('dashboard_display_currency', curr);
    } catch (e) {}
  };

  // Compute Total Spend in HKD
  const totalSpendHKD = receipts.reduce(
    (sum, r) => sum + Number(r.totalAmount || 0),
    0
  );

  // Convert to displayCurrency (rates are HKD per 1 unit of foreign currency)
  const rate = fxRates[displayCurrency] || 1.0;
  const convertedTotal =
    displayCurrency === 'HKD' ? totalSpendHKD : totalSpendHKD / rate;

  // Compute Category Breakdown
  const categoryBreakdown = receipts.reduce((acc, r) => {
    const cat = r.category || 'Other';
    acc[cat] = (acc[cat] || 0) + Number(r.totalAmount || 0);
    return acc;
  }, {});

  const syncedCount = receipts.filter(
    (r) => r.syncStatus === 'synced' || r.syncedToSheets
  ).length;
  const pendingCount = receipts.length - syncedCount;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>ReceiptGenius</Text>
            <Text style={styles.subtitle}>AI-Powered Receipt & Ledger Sync</Text>
          </View>
          <TouchableOpacity
            style={styles.scanHeaderButton}
            onPress={() => navigation.navigate('Scan')}
          >
            <Text style={styles.scanHeaderButtonText}>+ Scan</Text>
          </TouchableOpacity>
        </View>

        {/* Hero KPI Summary Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeaderRow}>
            <Text style={styles.heroLabel}>TOTAL TRACKED SPENDING</Text>
            {/* Currency Selector Horizontal Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.currencyPillsContainer}
            >
              {AVAILABLE_CURRENCIES.map((curr) => {
                const isSelected = displayCurrency === curr;
                return (
                  <TouchableOpacity
                    key={curr}
                    style={[
                      styles.currencyPill,
                      isSelected && styles.currencyPillSelected,
                    ]}
                    onPress={() => handleCurrencyChange(curr)}
                  >
                    <Text
                      style={[
                        styles.currencyPillText,
                        isSelected && styles.currencyPillTextSelected,
                      ]}
                    >
                      {curr}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.heroAmountRow}>
            <Text style={styles.heroAmount}>
              {CURRENCY_SYMBOLS[displayCurrency] || `${displayCurrency} `}
              {convertedTotal.toFixed(2)}
            </Text>
            {displayCurrency !== 'HKD' && (
              <Text style={styles.heroSubAmount}>
                (≈ HK${totalSpendHKD.toFixed(2)})
              </Text>
            )}
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{receipts.length}</Text>
              <Text style={styles.heroStatLabel}>Receipts Scanned</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={[styles.heroStatValue, { color: colors.primary }]}>
                {syncedCount}
              </Text>
              <Text style={styles.heroStatLabel}>Synced to Sheets</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text
                style={[
                  styles.heroStatValue,
                  { color: pendingCount > 0 ? '#ffb4ab' : colors.onSurfaceVariant },
                ]}
              >
                {pendingCount}
              </Text>
              <Text style={styles.heroStatLabel}>Pending Sync</Text>
            </View>
          </View>
        </View>

        {/* Category Breakdown Component */}
        <CategoryBreakdownBar
          categoryBreakdown={categoryBreakdown}
          totalSpend={totalSpendHKD}
        />

        {/* Recent Receipts Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Receipts</Text>
          <TouchableOpacity onPress={() => navigation.navigate('History')}>
            <Text style={styles.viewAllText}>View All ({receipts.length}) →</Text>
          </TouchableOpacity>
        </View>

        {receipts.slice(0, 5).map((receipt) => (
          <ReceiptCard
            key={receipt.id}
            receipt={receipt}
            onPress={() => setSelectedReceipt(receipt)}
          />
        ))}
      </ScrollView>

      <ReceiptEditModal
        visible={!!selectedReceipt}
        receipt={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        onUpdated={loadData}
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
  contentContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.onSurface,
  },
  subtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  scanHeaderButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  scanHeaderButtonText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.5,
  },
  currencyPillsContainer: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  currencyPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  currencyPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  currencyPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  currencyPillTextSelected: {
    color: '#0D1117',
    fontWeight: '700',
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginVertical: spacing.xs,
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.onSurface,
  },
  heroSubAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceHigh,
  },
  heroStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  heroStatValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onSurface,
  },
  heroStatLabel: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.surfaceHigh,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  viewAllText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
});
