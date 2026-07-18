/**
 * ReceiptGenius Design System & Theme Tokens
 * Supports dark mode (#0b1326 dark navy background) and light mode (#f8fafc light background).
 */

export const darkColors = {
  // Brand & Accent
  primary: '#4edea3',
  primaryContainer: '#10b981',
  onPrimary: '#003824',
  inversePrimary: '#006c49',

  // Secondary
  secondary: '#adc6ff',
  onSecondary: '#002e6a',
  secondaryContainer: '#0566d9',

  // Dark Mode Surface & Backgrounds
  background: '#0b1326',
  surface: '#171f33',
  surfaceHigh: '#222a3d',
  surfaceHighest: '#2d3449',
  surfaceBright: '#31394d',

  // Typography & On-Surface
  onSurface: '#dae2fd',
  onSurfaceVariant: '#bbcabf',
  outline: '#86948a',
  outlineVariant: '#3c4a42',

  // Status & Alerts
  error: '#ffb4ab',
  errorContainer: '#93000a',
  onError: '#690005',
  success: '#4edea3',
  warning: '#fbbf24',

  // Categories Color Mapping
  categories: {
    'Food & Dining': '#4edea3',
    'Groceries': '#38bdf8',
    'Transportation': '#f43f5e',
    'Shopping': '#a855f7',
    'Utilities & Bills': '#f97316',
    'Entertainment': '#ec4899',
    'Healthcare': '#14b8a6',
    'Other': '#94a3b8',
  },
};

export const lightColors = {
  // Brand & Accent
  primary: '#10b981',
  primaryContainer: '#4edea3',
  onPrimary: '#ffffff',
  inversePrimary: '#003824',

  // Secondary
  secondary: '#2563eb',
  onSecondary: '#ffffff',
  secondaryContainer: '#dbeafe',

  // Light Mode Surface & Backgrounds
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceHigh: '#f1f5f9',
  surfaceHighest: '#e2e8f0',
  surfaceBright: '#cbd5e1',

  // Typography & On-Surface
  onSurface: '#0f172a',
  onSurfaceVariant: '#475569',
  outline: '#94a3b8',
  outlineVariant: '#cbd5e1',

  // Status & Alerts
  error: '#ef4444',
  errorContainer: '#fee2e2',
  onError: '#ffffff',
  success: '#10b981',
  warning: '#f59e0b',

  // Categories Color Mapping
  categories: {
    'Food & Dining': '#10b981',
    'Groceries': '#0284c7',
    'Transportation': '#e11d48',
    'Shopping': '#9333ea',
    'Utilities & Bills': '#ea580c',
    'Entertainment': '#db2777',
    'Healthcare': '#0d9488',
    'Other': '#64748b',
  },
};

// Mutable colors object defaulting to dark colors (updated when theme switches)
export const colors = { ...darkColors };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const borderRadius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  headlineLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  headlineMedium: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  titleMedium: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.onSurface,
  },
  bodyLarge: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.onSurface,
  },
  bodyMedium: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.onSurfaceVariant,
  },
  labelSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
};
