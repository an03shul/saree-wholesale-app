import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, RefreshControl, Switch
} from 'react-native';
import { itemsApi, ordersApi } from '../api/client';
import { useUser } from '../../App';
import { colors, shadow, modalBase } from '../constants/theme';

export default function ItemsScreen({ route, navigation }) {
  const { brand } = route.params;
  const user = useUser();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [delItem, setDelItem] = useState(null);

  useEffect(() => {
    navigation.setOptions({
      title: brand.name,
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.popToTop()} style={{ marginRight: 16 }}>
          <Text style={{ color: '#fff', fontSize: 20 }}>🏠</Text>
        </TouchableOpacity>
      ),
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await itemsApi.getAll(brand.id);
      setItems(data);
    } catch {
      Alert.alert('Error', 'Could not load items.');
    } finally {
      setLoading(false);
    }
  }, [brand.id]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const createItem = async () => {
    if (!name.trim()) return Alert.alert('Required', 'Please enter an item name');
    setSaving(true);
    try {
      await itemsApi.create({ name: name.trim(), description: description.trim(), brand_id: brand.id });
      setModalVisible(false);
      setName(''); setDescription('');
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not create item');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = (item) => setDelItem(item); // open web-safe confirm modal

  const doDeleteItem = async () => {
    const item = delItem;
    setDelItem(null);
    try { await itemsApi.delete(item.id); load(); }
    catch (e) { Alert.alert('Error', e.response?.data?.error || 'Could not delete'); }
  };

  const toggleStock = async (item) => {
    try {
      const { data } = await itemsApi.toggleStock(item.id);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, in_stock: data.in_stock } : i));
    } catch {
      Alert.alert('Error', 'Could not update stock status');
    }
  };

  const filteredItems = searchQuery.trim()
    ? items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search items…"
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={filteredItems}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        ListHeaderComponent={
          <Text style={styles.listHeader}>
            {items.length > 0 ? `${items.length} Item${items.length !== 1 ? 's' : ''}` : ''}
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{searchQuery.trim() ? '🔍' : '📦'}</Text>
            <Text style={styles.emptyTitle}>{searchQuery.trim() ? 'No results' : 'No items yet'}</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery.trim() ? `Nothing matches "${searchQuery}"` : 'Tap + to add your first item\ne.g. "Myra", "Ghoomar"'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.card, !item.in_stock && styles.cardOutOfStock]}
            onPress={() => navigation.navigate('Designs', { item, brand })}
            onLongPress={() => isAdmin && deleteItem(item)}
            activeOpacity={0.7}
          >
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>{String(index + 1).padStart(2, '0')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.description
                ? <Text style={styles.desc}>{item.description}</Text>
                : <Text style={styles.descPlaceholder}>Tap to view designs</Text>
              }
            </View>
            {isAdmin ? (
              <View style={styles.stockToggle}>
                <Text style={[styles.stockLabel, { color: item.in_stock ? '#2E7D32' : colors.danger }]}>
                  {item.in_stock ? 'In Stock' : 'Out'}
                </Text>
                <Switch
                  value={!!item.in_stock}
                  onValueChange={() => toggleStock(item)}
                  trackColor={{ false: '#FFCDD2', true: '#C8E6C9' }}
                  thumbColor={item.in_stock ? '#2E7D32' : colors.danger}
                  ios_backgroundColor="#FFCDD2"
                />
              </View>
            ) : !item.in_stock ? (
              <View style={[styles.stockBadge, styles.stockOut]}>
                <Text style={styles.stockText}>Out of Stock</Text>
              </View>
            ) : null}
            <View style={styles.arrowCircle}>
              <Text style={styles.arrow}>›</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Delete confirm (web-safe modal) */}
      <Modal visible={!!delItem} transparent animationType="fade">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>Delete Item</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 20, lineHeight: 22 }}>
              Delete "{delItem?.name}" and ALL its designs? This can't be undone.
            </Text>
            <View style={modalBase.row}>
              <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setDelItem(null)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modalBase.btnPrimary, { backgroundColor: colors.danger }]} onPress={doDeleteItem}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>New Item — {brand.name}</Text>
            <TextInput style={modalBase.input} placeholder="Item name (e.g. Myra)" placeholderTextColor={colors.textSecondary} value={name} onChangeText={setName} />
            <TextInput style={modalBase.input} placeholder="Description (optional)" placeholderTextColor={colors.textSecondary} value={description} onChangeText={setDescription} />
            <View style={modalBase.row}>
              <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setModalVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modalBase.btnPrimary} onPress={createItem} disabled={saving}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, margin: 16, marginBottom: 4,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
    ...shadow.small,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 4 },
  listHeader: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...shadow.small,
  },
  numberBadge: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  numberText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  itemName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  desc: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  descPlaceholder: { fontSize: 12, color: colors.border, marginTop: 3, fontStyle: 'italic' },
  arrowCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  arrow: { fontSize: 20, color: colors.gold, fontWeight: '700' },
  cardOutOfStock: { opacity: 0.55 },
  stockToggle: { alignItems: 'center', gap: 3, marginRight: 2 },
  stockLabel: { fontSize: 10, fontWeight: '700' },
  stockBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginRight: 6 },
  stockOut: { backgroundColor: '#FEE9E9' },
  stockText: { fontSize: 11, fontWeight: '700', color: colors.danger },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  fab: {
    position: 'absolute', bottom: 32, right: 24,
    backgroundColor: colors.primary, width: 58, height: 58,
    borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    opacity: 0.82,
    ...shadow.medium, shadowColor: colors.primary,
  },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 36 },
});
