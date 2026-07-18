import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { colors, spacing, borderRadius } from '../theme/theme';

export default function LoadingOverlay({ visible, stage = 'Processing receipt...' }) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stageTitle}>Gemini AI OCR Scanner</Text>
          <Text style={styles.stageMessage}>{stage}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 19, 38, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryContainer,
    width: '85%',
  },
  stageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.md,
  },
  stageMessage: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
