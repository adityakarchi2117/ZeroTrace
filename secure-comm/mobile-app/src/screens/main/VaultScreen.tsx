/**
 * Vault Screen with Glassmorphism and 3D Effects
 * Secure encrypted storage for sensitive data
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import { colors } from '../../theme/colors';
import { Glassmorphism, TiltCard, FloatingGlass } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { vaultAPI } from '../../services/api';

interface VaultItem {
  id: number;
  item_type: string;
  encrypted_title?: string;
  created_at: string;
}

const VaultScreen: React.FC = () => {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');

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
        <TouchableOpacity style={styles.vaultContent}>
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

  return (
    <View style={styles.container}>
      {/* Header with Glassmorphism */}
      <Glassmorphism style={styles.header} blur="lg">
        <View>
          <Text style={styles.headerTitle}>Secure Vault</Text>
          <Text style={styles.headerSubtitle}>End-to-end encrypted storage</Text>
        </View>
        <TouchableOpacity style={styles.addButton}>
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
});

export default VaultScreen;
