/**
 * Vault Screen with Glassmorphism and 3D Effects
 * Secure encrypted storage for sensitive data
 * Full CRUD: Create, Read, Edit, Delete vault items
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import { Glassmorphism, TiltCard, FloatingGlass } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { vaultAPI } from '../../services/api';

interface VaultItem {
  id: number;
  item_type: string;
  encrypted_title?: string;
  encrypted_content?: string;
  created_at: string;
  updated_at?: string;
}

type ItemType = 'password' | 'note' | 'document' | 'credential';

const ITEM_TYPES: { id: ItemType; label: string; icon: string }[] = [
  { id: 'password', label: 'Password', icon: 'key' },
  { id: 'note', label: 'Note', icon: 'document-text' },
  { id: 'document', label: 'Document', icon: 'document' },
  { id: 'credential', label: 'Credential', icon: 'card' },
];

const VaultScreen: React.FC = () => {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');
  const [modalType, setModalType] = useState<ItemType>('note');
  const [saving, setSaving] = useState(false);

  // Detail view
  const [showDetail, setShowDetail] = useState(false);
  const [detailItem, setDetailItem] = useState<VaultItem | null>(null);

  const filters = [
    { id: 'all', label: 'All', icon: 'apps' },
    { id: 'password', label: 'Passwords', icon: 'key' },
    { id: 'note', label: 'Notes', icon: 'document-text' },
    { id: 'document', label: 'Files', icon: 'document' },
  ];

  const loadItems = async () => {
    try {
      const response = await vaultAPI.getItems();
      setItems(response.data);
    } catch (error) {
      console.error('Failed to load vault items:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'password':
        return 'key';
      case 'note':
        return 'document-text';
      case 'document':
        return 'document';
      case 'credential':
        return 'card';
      default:
        return 'lock-closed';
    }
  };

  const getItemColor = (type: string) => {
    switch (type) {
      case 'password':
        return colors.status.warning;
      case 'note':
        return colors.status.info;
      case 'document':
        return colors.status.success;
      case 'credential':
        return colors.secondary.main;
      default:
        return colors.primary.main;
    }
  };

  const renderFilter = ({ item }: { item: typeof filters[0] }) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        selectedFilter === item.id && styles.filterButtonActive,
      ]}
      onPress={() => setSelectedFilter(item.id)}
    >
      <Glassmorphism
        style={[
          styles.filterGlass,
          selectedFilter === item.id && styles.filterGlassActive,
        ]}
        blur="sm"
        interactive
      >
        <Icon
          name={item.icon}
          size={18}
          color={selectedFilter === item.id ? colors.text.inverse : colors.text.primary}
        />
        <Text
          style={[
            styles.filterText,
            selectedFilter === item.id && styles.filterTextActive,
          ]}
        >
          {item.label}
        </Text>
      </Glassmorphism>
    </TouchableOpacity>
  );

  const renderItem = ({ item, index }: { item: VaultItem; index: number }) => (
    <FloatingGlass delay={index * 100}>
      <TiltCard style={styles.vaultCard}>
        <TouchableOpacity style={styles.vaultContent} onPress={() => openDetail(item)} onLongPress={() => handleDelete(item)}>
          {/* Icon with 3D Tilt */}
          <TiltAvatar maxTilt={15} scale={1.1}>
            <View
              style={[
                styles.vaultIcon,
                { backgroundColor: `${getItemColor(item.item_type)}20` },
              ]}
            >
              <Icon
                name={getItemIcon(item.item_type)}
                size={28}
                color={getItemColor(item.item_type)}
              />
            </View>
          </TiltAvatar>

          {/* Item Info */}
          <View style={styles.vaultInfo}>
            <Text style={styles.vaultTitle}>
              {item.encrypted_title || 'Untitled'}
            </Text>
            <Text style={styles.vaultType}>
              {item.item_type.charAt(0).toUpperCase() + item.item_type.slice(1)}
            </Text>
          </View>

          {/* Lock Icon */}
          <Icon name="lock-closed" size={20} color={colors.status.success} />
        </TouchableOpacity>
      </TiltCard>
    </FloatingGlass>
  );

  const filteredItems = selectedFilter === 'all'
    ? items
    : items.filter(item => item.item_type === selectedFilter);

  // ─── CRUD Handlers ───────────────────────
  const openCreateModal = () => {
    setEditingItem(null);
    setModalTitle('');
    setModalContent('');
    setModalType('note');
    setShowModal(true);
  };

  const openEditModal = (item: VaultItem) => {
    setEditingItem(item);
    setModalTitle(item.encrypted_title || '');
    setModalContent(item.encrypted_content || '');
    setModalType((item.item_type as ItemType) || 'note');
    setShowModal(true);
    setShowDetail(false);
  };

  const handleSave = async () => {
    if (!modalTitle.trim()) {
      showMessage({ message: 'Title is required', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      if (editingItem) {
        await vaultAPI.updateItem(editingItem.id, {
          item_type: modalType,
          encrypted_title: modalTitle.trim(),
          encrypted_content: modalContent.trim(),
        });
        showMessage({ message: 'Item Updated', type: 'success' });
      } else {
        await vaultAPI.createItem({
          item_type: modalType,
          encrypted_title: modalTitle.trim(),
          encrypted_content: modalContent.trim(),
        });
        showMessage({ message: 'Item Created', type: 'success' });
      }
      setShowModal(false);
      await loadItems();
    } catch (error) {
      showMessage({ message: 'Failed to save item', type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: VaultItem) => {
    Alert.alert(
      'Delete Item',
      `Delete "${item.encrypted_title || 'this item'}"?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await vaultAPI.deleteItem(item.id);
              setItems((prev) => prev.filter((i) => i.id !== item.id));
              setShowDetail(false);
              showMessage({ message: 'Item Deleted', type: 'success' });
            } catch (error) {
              showMessage({ message: 'Failed to delete', type: 'danger' });
            }
          },
        },
      ]
    );
  };

  const openDetail = (item: VaultItem) => {
    setDetailItem(item);
    setShowDetail(true);
  };

  return (
    <View style={styles.container}>
      {/* Header with Glassmorphism */}
      <Glassmorphism style={styles.header} blur="lg">
        <View>
          <Text style={styles.headerTitle}>Secure Vault</Text>
          <Text style={styles.headerSubtitle}>End-to-end encrypted storage</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openCreateModal}>
          <Icon name="add" size={28} color={colors.text.primary} />
        </TouchableOpacity>
      </Glassmorphism>

      {/* Filters */}
      <FlatList
        data={filters}
        renderItem={renderFilter}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
      />

      {/* Vault Items */}
      <FlatList
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!loading && (
          <View style={styles.emptyContainer}>
            <TiltAvatar maxTilt={20} scale={1.1}>
              <View style={styles.emptyIcon}>
                <Icon name="lock-closed-outline" size={48} color={colors.primary.main} />
              </View>
            </TiltAvatar>
            <Text style={styles.emptyTitle}>Vault is empty</Text>
            <Text style={styles.emptySubtitle}>
              Store passwords, notes, and documents securely
            </Text>
          </View>
        )}
      />

      {/* ─── Create/Edit Modal ──────────────── */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowModal(false)}>
          <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'New Vault Item'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Icon name="close" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {/* Item Type Selector */}
            <Text style={styles.modalLabel}>Type</Text>
            <View style={styles.typeRow}>
              {ITEM_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typeChip, modalType === t.id && styles.typeChipActive]}
                  onPress={() => setModalType(t.id)}
                >
                  <Icon name={t.icon} size={16} color={modalType === t.id ? '#fff' : colors.text.secondary} />
                  <Text style={[styles.typeChipText, modalType === t.id && { color: '#fff' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Title</Text>
            <TextInput
              style={styles.modalInput}
              value={modalTitle}
              onChangeText={setModalTitle}
              placeholder="Item title"
              placeholderTextColor={colors.text.muted}
              maxLength={200}
            />

            <Text style={styles.modalLabel}>Content</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMulti]}
              value={modalContent}
              onChangeText={setModalContent}
              placeholder="Encrypted content..."
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.modalSaveButton, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalSaveText}>{editingItem ? 'Update' : 'Create'}</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Detail Modal ───────────────────── */}
      <Modal visible={showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDetail(false)}>
          <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
            {detailItem && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.vaultIcon, { width: 36, height: 36, backgroundColor: `${getItemColor(detailItem.item_type)}20` }]}>
                      <Icon name={getItemIcon(detailItem.item_type)} size={18} color={getItemColor(detailItem.item_type)} />
                    </View>
                    <Text style={styles.modalTitle}>{detailItem.encrypted_title || 'Untitled'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowDetail(false)}>
                    <Icon name="close" size={24} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailMeta}>
                  <Text style={styles.detailType}>
                    {detailItem.item_type.charAt(0).toUpperCase() + detailItem.item_type.slice(1)}
                  </Text>
                  <Text style={styles.detailDate}>
                    Created: {new Date(detailItem.created_at).toLocaleDateString()}
                  </Text>
                </View>

                {detailItem.encrypted_content && (
                  <View style={styles.detailContentBox}>
                    <Text style={styles.detailContent}>{detailItem.encrypted_content}</Text>
                  </View>
                )}

                <View style={styles.detailActions}>
                  <TouchableOpacity style={styles.detailEditButton} onPress={() => openEditModal(detailItem)}>
                    <Icon name="create-outline" size={18} color="#fff" />
                    <Text style={styles.detailEditText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.detailDeleteButton} onPress={() => handleDelete(detailItem)}>
                    <Icon name="trash-outline" size={18} color={colors.status.error} />
                    <Text style={styles.detailDeleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
  },
  addButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.status.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.status.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    marginRight: 8,
  },
  filterButtonActive: {
    transform: [{ scale: 1.05 }],
  },
  filterGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  filterGlassActive: {
    backgroundColor: colors.primary.main,
  },
  filterText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  filterTextActive: {
    color: colors.text.inverse,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  vaultCard: {
    marginBottom: 8,
  },
  vaultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
  },
  vaultIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vaultInfo: {
    flex: 1,
    marginLeft: 16,
  },
  vaultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  vaultType: {
    fontSize: 13,
    color: colors.text.muted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: 6,
    marginTop: 12,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  typeChipActive: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  typeChipText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  modalInput: {
    height: 48,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.secondary,
  },
  modalInputMulti: {
    height: 100,
    paddingTop: 12,
  },
  modalSaveButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Detail modal
  detailMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailType: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: '500',
  },
  detailDate: {
    fontSize: 12,
    color: colors.text.muted,
  },
  detailContentBox: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  detailContent: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 12,
  },
  detailEditButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary.main,
  },
  detailEditText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  detailDeleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  detailDeleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.status.error,
  },
});

export default VaultScreen;
