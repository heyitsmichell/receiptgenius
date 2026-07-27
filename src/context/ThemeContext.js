import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, darkColors, lightColors } from '../theme/theme';

const ThemeContext = createContext({
  isDark: true,
  mode: 'dark',
  toggleTheme: () => {},
  colors: darkColors,
});

const STORAGE_KEY = '@receiptgenius_theme_mode';

export const ThemeProvider = ({ children }) => {
  const [mode, setMode] = useState('dark');

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
          setMode(saved);
          Object.assign(colors, saved === 'dark' ? darkColors : lightColors);
        }
      } catch (e) {
        // Fallback to dark
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = useCallback(async () => {
    const nextMode = mode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
    Object.assign(colors, nextMode === 'dark' ? darkColors : lightColors);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, nextMode);
    } catch (e) {}
  }, [mode]);

  const currentColors = mode === 'dark' ? darkColors : lightColors;

  const contextValue = useMemo(() => ({
    isDark: mode === 'dark',
    mode,
    toggleTheme,
    colors: currentColors,
  }), [mode, toggleTheme, currentColors]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

