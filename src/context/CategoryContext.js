import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getCategories, saveCategories } from '../services/storageService';

const CategoryContext = createContext();

export const DEFAULT_CATEGORIES = [
  { id: 'cat-1', label: 'Food & Dining', color: '#4edea3' },
  { id: 'cat-2', label: 'Groceries', color: '#38bdf8' },
  { id: 'cat-3', label: 'Transportation', color: '#f43f5e' },
  { id: 'cat-4', label: 'Shopping', color: '#a855f7' },
  { id: 'cat-5', label: 'Utilities & Bills', color: '#f97316' },
  { id: 'cat-6', label: 'Entertainment', color: '#ec4899' },
  { id: 'cat-7', label: 'Healthcare', color: '#14b8a6' },
  { id: 'cat-8', label: 'Other', color: '#94a3b8' },
];

export function CategoryProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function loadCategories() {
      const stored = await getCategories();
      if (stored && stored.length > 0) {
        setCategories(stored);
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
      setIsLoaded(true);
    }
    loadCategories();
  }, []);

  const persistCategories = async (newCategories) => {
    setCategories(newCategories);
    await saveCategories(newCategories);
  };

  const addCategory = useCallback(async (label, color) => {
    const newCategory = { id: `cat-${Date.now()}`, label, color };
    const newCategories = [...categories, newCategory];
    await persistCategories(newCategories);
  }, [categories]);

  const updateCategory = useCallback(async (id, newLabel, newColor) => {
    const newCategories = categories.map(cat => 
      cat.id === id ? { ...cat, label: newLabel, color: newColor } : cat
    );
    await persistCategories(newCategories);
  }, [categories]);

  const deleteCategory = useCallback(async (id) => {
    const newCategories = categories.filter(cat => cat.id !== id);
    // If they delete everything, don't let it be empty, leave "Other"
    if (newCategories.length === 0) {
      const fallback = [{ id: `cat-${Date.now()}`, label: 'Other', color: '#94a3b8' }];
      await persistCategories(fallback);
    } else {
      await persistCategories(newCategories);
    }
  }, [categories]);

  const getCategoryColor = useCallback((label) => {
    const cat = categories.find(c => c.label === label);
    return cat ? cat.color : '#10b981'; // default primary color
  }, [categories]);

  const value = useMemo(() => ({
    categories,
    isLoaded,
    addCategory,
    updateCategory,
    deleteCategory,
    getCategoryColor
  }), [categories, isLoaded, addCategory, updateCategory, deleteCategory, getCategoryColor]);

  return (
    <CategoryContext.Provider value={value}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoryContext);
}
