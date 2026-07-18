import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius } from '../theme/theme';
import CategoryBreakdownBar from '../components/CategoryBreakdownBar';
import ReceiptCard from '../components/ReceiptCard';
import ReceiptEditModal from '../components/ReceiptEditModal';
import { getReceipts } from '../services/storageService';
import { getLiveHKDExchangeRates } from '../services/currencyService';

const CURRENCY_SYMBOLS = {
  HKD: 'HKD ',
  USD: 'USD ',
  CNY: 'CNY ',
  JPY: 'JPY ',
  EUR: 'EUR ',
  GBP: 'GBP ',
  SGD: 'SGD ',
};

const CURRENCY_INFO = {
  HKD: { name: 'Hong Kong Dollar', code: 'HKD' },
  USD: { name: 'US Dollar', code: 'USD' },
  CNY: { name: 'Chinese Yuan', code: 'CNY' },
  JPY: { name: 'Japanese Yen', code: 'JPY' },
  EUR: { name: 'Euro', code: 'EUR' },
  GBP: { name: 'British Pound', code: 'GBP' },
  SGD: { name: 'Singapore Dollar', code: 'SGD' },
};

const AVAILABLE_CURRENCIES = ['HKD', 'USD', 'CNY', 'JPY', 'EUR', 'GBP', 'SGD'];

export default function DashboardScreen({ navigation }) {
  const [receipts, setReceipts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);

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
            {/* Currency Selector Dropdown Button */}
            <TouchableOpacity
              style={styles.currencyDropdownButton}
              onPress={() => setCurrencyModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.currencyDropdownButtonText}>{displayCurrency}</Text>
              <Text style={styles.currencyDropdownArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroAmountRow}>
            <Text style={styles.heroAmount}>
              {CURRENCY_SYMBOLS[displayCurrency] || `${displayCurrency} `}
              {convertedTotal.toFixed(2)}
            </Text>
            {displayCurrency !== 'HKD' && (
              <Text style={styles.heroSubAmount}>
                (≈ HKD {totalSpendHKD.toFixed(2)})
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

      {/* Currency Selection Dropdown Modal */}
      <Modal
        visible={currencyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCurrencyModalVisible(false)}
        >
          <View style={styles.currencyModalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.currencyModalHeader}>
              <View>
                <Text style={styles.currencyModalTitle}>Display Currency</Text>
                <Text style={styles.currencyModalSubtitle}>
                  Choose how spending is displayed across your dashboard
                </Text>
              </View>
              <TouchableOpacity
                style={styles.currencyModalCloseBtn}
                onPress={() => setCurrencyModalVisible(false)}
              >
                <Text style={styles.currencyModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.currencyModalList}
              showsVerticalScrollIndicator={false}
            >
              {AVAILABLE_CURRENCIES.map((curr) => {
                const isSelected = displayCurrency === curr;
                const info = CURRENCY_INFO[curr] || { name: curr, code: curr };
                const rate = fxRates[curr] || 1.0;
                return (
                  <TouchableOpacity
                    key={curr}
                    style={[
                      styles.currencyOptionItem,
                      isSelected && styles.currencyOptionItemSelected,
                    ]}
                    onPress={() => {
                      handleCurrencyChange(curr);
                      setCurrencyModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.currencyOptionLeft}>
                      <View
                        style={[
                          styles.currencySymbolBadge,
                          isSelected && styles.currencySymbolBadgeSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.currencySymbolText,
                            isSelected && styles.currencySymbolTextSelected,
                          ]}
                        >
                          {curr}
                        </Text>
                      </View>
                      <View>
                        <Text
                          style={[
                            styles.currencyOptionCode,
                            isSelected && styles.currencyOptionCodeSelected,
                          ]}
                        >
                          {info.name}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.currencyOptionRight}>
                      {curr !== 'HKD' ? (
                        <Text style={styles.currencyOptionRate}>
                          1 {curr} ≈ HKD {rate.toFixed(4)}
                        </Text>
                      ) : (
                        <Text style={styles.currencyOptionRate}>Base Currency</Text>
                      )}
                      {isSelected && (
                        <View style={styles.checkmarkBadge}>
                          <Text style={styles.checkmarkText}>✓</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
    gap: spacing.md,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  currencyDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    gap: 6,
  },
  currencyDropdownButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0D1117',
  },
  currencyDropdownArrow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D1117',
    marginTop: 1,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  currencyModalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  currencyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceHigh,
  },
  currencyModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  currencyModalSubtitle: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  currencyModalCloseBtn: {
    padding: 4,
  },
  currencyModalCloseText: {
    fontSize: 18,
    color: colors.onSurfaceVariant,
  },
  currencyModalList: {
    maxHeight: 400,
  },
  currencyOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: borderRadius.lg,
    marginBottom: 8,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  currencyOptionItemSelected: {
    backgroundColor: 'rgba(78, 222, 163, 0.12)',
    borderColor: colors.primary,
  },
  currencyOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  currencySymbolBadge: {
    width: 44,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceHighest,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currencySymbolBadgeSelected: {
    backgroundColor: colors.primary,
  },
  currencySymbolText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
  },
  currencySymbolTextSelected: {
    color: '#0D1117',
  },
  currencyOptionCode: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
  },
  currencyOptionCodeSelected: {
    color: colors.primary,
  },
  currencyOptionName: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },
  currencyOptionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyOptionRate: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  checkmarkBadge: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0D1117',
  },
});
