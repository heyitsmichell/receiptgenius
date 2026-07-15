/**
 * ReceiptGenius Design System & Theme Tokens
 * Derived directly from the Stitch UI specifications (#0b1326 dark navy background, #4edea3 emerald accent).
 */

export const colors = {
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
  },
  monoData: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  glow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
};
