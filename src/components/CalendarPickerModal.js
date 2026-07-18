import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { parseAnyDate } from '../utils/dateFilters';

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarPickerModal({
  visible,
  onClose,
  onSelect,
  initialDate,
  title = 'Select Date',
}) {
  const { colors } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (visible) {
      const parsed = parseAnyDate(initialDate);
      if (parsed && !isNaN(parsed.getTime())) {
        setCurrentDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
      } else {
        const now = new Date();
        setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
      }
    }
  }, [visible, initialDate]);

  if (!visible) return null;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 (Su) to 6 (Sa)
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysGrid = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    daysGrid.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysGrid.push(new Date(year, month, d));
  }

  const handleSelectDay = (dayDate) => {
    const dd = String(dayDate.getDate()).padStart(2, '0');
    const mm = String(dayDate.getMonth() + 1).padStart(2, '0');
    const yy = String(dayDate.getFullYear()).slice(-2);
    const formatted = `${dd}/${mm}/${yy}`;
    if (onSelect) onSelect(formatted);
    if (onClose) onClose();
  };

  const selectedDateObj = parseAnyDate(initialDate);
  const todayObj = new Date();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.surfaceHighest }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.titleText, { color: colors.onSurface }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {/* Month Navigation */}
          <View style={styles.navRow}>
            <TouchableOpacity onPress={prevMonth} style={[styles.navBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHighest }]}>
              <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity onPress={goToToday} style={styles.monthYearBtn}>
              <Text style={[styles.monthYearText, { color: colors.onSurface }]}>
                {MONTH_NAMES[month]} {year}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={nextMonth} style={[styles.navBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.surfaceHighest }]}>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          </View>

          {/* Days of Week Header */}
          <View style={styles.daysOfWeekRow}>
            {DAYS_OF_WEEK.map((dow, idx) => (
              <Text key={idx} style={[styles.dowText, { color: colors.onSurfaceVariant }]}>
                {dow}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.grid}>
            {daysGrid.map((dayDate, idx) => {
              if (!dayDate) {
                return <View key={idx} style={styles.dayCell} />;
              }

              const isSelected =
                selectedDateObj &&
                selectedDateObj.getDate() === dayDate.getDate() &&
                selectedDateObj.getMonth() === dayDate.getMonth() &&
                selectedDateObj.getFullYear() === dayDate.getFullYear();

              const isToday =
                todayObj.getDate() === dayDate.getDate() &&
                todayObj.getMonth() === dayDate.getMonth() &&
                todayObj.getFullYear() === dayDate.getFullYear();

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: colors.primary },
                    isToday && !isSelected && { borderColor: colors.primary, borderWidth: 1 },
                  ]}
                  onPress={() => handleSelectDay(dayDate)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: colors.onSurface },
                      isToday && { color: colors.primary, fontWeight: '700' },
                      isSelected && styles.selectedText,
                    ]}
                  >
                    {dayDate.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer Today Shortcut */}
          <View style={[styles.footer, { borderTopColor: colors.surfaceHighest }]}>
            <TouchableOpacity onPress={goToToday} style={[styles.todayBtn, { backgroundColor: colors.surfaceHigh }]}>
              <Text style={[styles.todayBtnText, { color: colors.onSurface }]}>Go to Today</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={[styles.cancelBtn, { backgroundColor: colors.surfaceHigh }]}>
              <Text style={[styles.cancelBtnText, { color: colors.onSurfaceVariant }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  titleText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onSurface,
  },
  closeBtn: {
    padding: 4,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  navBtn: {
    backgroundColor: colors.surfaceHigh,
    padding: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceHighest,
  },
  monthYearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  monthYearText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  daysOfWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dowText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    marginVertical: 2,
  },
  todayCell: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectedCell: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
  },
  todayText: {
    color: colors.primary,
    fontWeight: '700',
  },
  selectedText: {
    color: '#003824',
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceHighest,
    paddingTop: spacing.md,
  },
  todayBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceHigh,
  },
  todayBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
});
