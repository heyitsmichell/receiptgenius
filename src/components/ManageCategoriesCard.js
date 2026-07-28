import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCategories } from '../context/CategoryContext';
import { useTheme } from '../context/ThemeContext';
import { getReceipts, saveReceipts } from '../services/storageService';
import { colors, spacing, borderRadius } from '../theme/theme';
import ColorPicker from 'react-native-wheel-color-picker';

const PRESET_COLORS = [
  '#4edea3', '#38bdf8', '#f43f5e', '#a855f7', '#f97316', 
  '#ec4899', '#14b8a6', '#94a3b8', '#fbbf24', '#e879f9',
  '#818cf8', '#34d399', '#fb7185', '#a3e635', '#f87171'
];

export default function ManageCategoriesCard() {
  const { categories, addCategory, updateCategory, deleteCategory } = useCategories();
  const { colors: themeColors } = useTheme();
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null); // null means adding a new one
  
  const [labelInput, setLabelInput] = useState('');
  const [colorInput, setColorInput] = useState(PRESET_COLORS[0]);
  const [showCustomColor, setShowCustomColor] = useState(false);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [linkedReceiptsCount, setLinkedReceiptsCount] = useState(0);

  const openAddModal = () => {
    setEditingCategory(null);
    setLabelInput('');
    setColorInput(PRESET_COLORS[0]);
    setShowCustomColor(false);
    setModalVisible(true);
  };

  const openEditModal = (cat) => {
    setEditingCategory(cat);
    setLabelInput(cat.label);
    setColorInput(cat.color);
    setShowCustomColor(!PRESET_COLORS.includes(cat.color));
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!labelInput.trim()) {
      Alert.alert('Validation Error', 'Category name cannot be empty.');
      return;
    }

    if (editingCategory) {
      updateCategory(editingCategory.id, labelInput.trim(), colorInput);
    } else {
      addCategory(labelInput.trim(), colorInput);
    }
    setModalVisible(false);
  };

  const confirmDelete = async (cat) => {
    const receipts = await getReceipts();
    const count = receipts.filter(r => r.category === cat.label).length;
    setLinkedReceiptsCount(count);
    setCategoryToDelete(cat);
    setDeleteModalVisible(true);
  };

  const performDelete = async () => {
    if (!categoryToDelete) return;
    
    if (linkedReceiptsCount > 0) {
      const receipts = await getReceipts();
      const updatedReceipts = receipts.map(r => {
        if (r.category === categoryToDelete.label) {
          return {
            ...r,
            category: 'Other',
            lastModified: new Date().toISOString(),
            syncStatus: r.syncStatus === 'synced' ? 'pending' : r.syncStatus
          };
        }
        return r;
      });
      await saveReceipts(updatedReceipts);
    }
    
    deleteCategory(categoryToDelete.id);
    setDeleteModalVisible(false);
    setCategoryToDelete(null);
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: themeColors.onSurface }]}>Categories</Text>
      </View>

      <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.surfaceHighest }]}>
        <ScrollView style={{ maxHeight: 270 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
          {categories.map((cat, index) => (
            <View 
              key={cat.id} 
              style={[
                styles.categoryRow, 
                index === 0 && { paddingTop: 0 },
                index !== categories.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors.surfaceHighest }
              ]}
            >
              <View style={styles.categoryLeft}>
                <View style={[styles.colorDot, { backgroundColor: cat.color }]} />
                <Text style={[styles.categoryName, { color: themeColors.onSurface }]}>{cat.label}</Text>
              </View>
              <View style={styles.categoryRight}>
                <TouchableOpacity onPress={() => openEditModal(cat)} style={styles.actionBtn}>
                  <Text style={[styles.actionBtnText, { color: themeColors.primary }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDelete(cat)} style={styles.actionBtn}>
                  <Text style={[styles.actionBtnText, { color: themeColors.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity style={[styles.addButton, { backgroundColor: themeColors.primary }]} onPress={openAddModal}>
          <Text style={[styles.addButtonText, { color: '#003824' }]}>+ Add Category</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surfaceHigh, borderColor: themeColors.surfaceHighest }]}>
            <Text style={[styles.modalTitle, { color: themeColors.onSurface }]}>
              {editingCategory ? 'Edit Category' : 'New Category'}
            </Text>

            <TextInput
              style={[styles.input, { color: themeColors.onSurface, borderColor: themeColors.surfaceHighest, backgroundColor: themeColors.surface }]}
              placeholder="Category Name"
              placeholderTextColor={themeColors.onSurfaceVariant}
              value={labelInput}
              onChangeText={setLabelInput}
            />

            <Text style={[styles.colorPickerTitle, { color: themeColors.onSurfaceVariant }]}>Select Color:</Text>
            <View style={styles.colorPickerContainer}>
              {PRESET_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorCircle, { backgroundColor: c }, colorInput === c && !showCustomColor && { borderWidth: 3, borderColor: themeColors.onSurface }]}
                  onPress={() => {
                    setColorInput(c);
                    setShowCustomColor(false);
                  }}
                />
              ))}
              <TouchableOpacity
                style={[styles.colorCircle, styles.customColorCircle, { backgroundColor: themeColors.surfaceHighest }, showCustomColor && { borderWidth: 3, borderColor: themeColors.onSurface }]}
                onPress={() => setShowCustomColor(true)}
              >
                <Ionicons name="color-palette" size={20} color={themeColors.onSurface} />
              </TouchableOpacity>
            </View>

            {showCustomColor && (
              <View style={{ height: 280, marginBottom: spacing.lg }}>
                <ColorPicker
                  color={colorInput}
                  onColorChange={(color) => setColorInput(color.toUpperCase())}
                  thumbSize={30}
                  sliderSize={30}
                  noSnap={true}
                  row={false}
                  swatches={false}
                />
              </View>
            )}

            {showCustomColor && (
              <TextInput
                style={[styles.input, { color: themeColors.onSurface, borderColor: themeColors.surfaceHighest, backgroundColor: themeColors.surface, marginTop: spacing.md }]}
                placeholder="#HEXCODE"
                placeholderTextColor={themeColors.onSurfaceVariant}
                value={colorInput}
                onChangeText={(text) => {
                  setColorInput(text.toUpperCase());
                }}
                maxLength={7}
                autoCapitalize="characters"
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={[styles.modalCancelBtnText, { color: themeColors.onSurfaceVariant }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: themeColors.primary }]} onPress={handleSave}>
                <Text style={[styles.modalSaveBtnText, { color: '#003824' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surfaceHigh, borderColor: themeColors.surfaceHighest }]}>
            <Text style={[styles.modalTitle, { color: themeColors.onSurface }]}>Delete Category</Text>

            {linkedReceiptsCount > 0 ? (
              <Text style={[styles.deleteWarningText, { color: themeColors.onSurfaceVariant }]}>
                There are <Text style={{fontWeight: 'bold', color: themeColors.onSurface}}>{linkedReceiptsCount}</Text> receipts linked to "{categoryToDelete?.label}". Deleting this category will relabel them as "Other". Continue?
              </Text>
            ) : (
              <Text style={[styles.deleteWarningText, { color: themeColors.onSurfaceVariant }]}>
                Are you sure you want to delete the category "{categoryToDelete?.label}"?
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setDeleteModalVisible(false)}>
                <Text style={[styles.modalCancelBtnText, { color: themeColors.onSurfaceVariant }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: themeColors.error }]} onPress={performDelete}>
                <Text style={[styles.modalSaveBtnText, { color: '#FFFFFF' }]}>{linkedReceiptsCount > 0 ? 'Delete & Relabel' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: spacing.sm,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
  },
  categoryRight: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    padding: 4,
  },
  actionBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
  addButton: {
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  addButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  deleteWarningText: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: spacing.lg,
  },
  colorPickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  colorPickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: spacing.xl,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  customColorCircle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  modalCancelBtnText: {
    fontWeight: '600',
    fontSize: 16,
  },
  modalSaveBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
  },
  modalSaveBtnText: {
    fontWeight: '700',
    fontSize: 16,
  },
});
