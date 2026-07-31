import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, RefreshControl, Switch, Share, ScrollView
} from 'react-native';
import { itemsApi, ordersApi, brandsApi, tallyApi, getCatalogUrl } from '../api/client';
import { notify } from '../utils/share';
import { useUser } from '../../App';
import { colors, shadow, modalBase } from '../constants/theme';

export default function ItemsScreen({ route, navigation }) {
  const { brand } = route.params;
  const user = useUser();
  const isAdmin = user?.role === 'admin';
  const canToggleStock = user?.role === 'admin' || user?.role === 'staff';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [delItem, setDelItem] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBrandId, setEditBrandId] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [allBrands, setAllBrands] = useState([]);
  const [editTally, setEditTally] = useState('');       // item's linked Tally stock item name
  const [tallyPicker, setTallyPicker] = useState(false); // Tally-item picker modal
  const [tallyItems, setTallyItems] = useState([]);      // synced Tally stock items
  const [tallySearch, setTallySearch] = useState('');

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
      notify('Error', 'Could not load items.');
    } finally {
      setLoading(false);
    }
  }, [brand.id]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const createItem = async () => {
    if (!name.trim()) return notify('Required', 'Please enter an item name');
    setSaving(true);
    try {
      await itemsApi.create({ name: name.trim(), description: description.trim(), brand_id: brand.id });
      setModalVisible(false);
      setName(''); setDescription('');
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not create item');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = (item) => setDelItem(item); // open web-safe confirm modal

  const doDeleteItem = async () => {
    const item = delItem;
    setDelItem(null);
    try { await itemsApi.delete(item.id); load(); }
    catch (e) { notify('Error', e.response?.data?.error || 'Could not delete'); }
  };

  const shareItem = async (item) => {
    try {
      await Share.share({ message: `Browse ${item.name} (${brand.name}) & order: ${getCatalogUrl(brand.id, { item: item.name })}` });
    } catch {}
  };

  const openEdit = async (item) => {
    setEditTarget(item);
    setEditName(item.name);
    setEditDescription(item.description || '');
    setEditBrandId(item.brand_id || brand.id);
    setEditTally(item.tally_item_name || '');
    try {
      const { data } = await brandsApi.getAll();
      setAllBrands(data);
    } catch {}
  };

  // Load synced Tally stock items and open the picker.
  const openTallyPicker = async () => {
    setTallySearch('');
    setTallyPicker(true);
    if (tallyItems.length === 0) {
      try { const { data } = await tallyApi.getItems(); setTallyItems(data); }
      catch { notify('Not synced', 'No Tally stock synced yet. Make sure the sync agent is running on the shop PC.'); }
    }
  };

  const saveEdit = async () => {
    if (!editName.trim()) return notify('Required', 'Please enter an item name');
    setEditSaving(true);
    try {
      await itemsApi.update(editTarget.id, { name: editName.trim(), description: editDescription.trim(), brand_id: editBrandId, tally_item_name: editTally.trim() || null });
      setEditTarget(null);
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not save item');
    } finally {
      setEditSaving(false);
    }
  };

  const toggleStock = async (item) => {
    try {
      const { data } = await itemsApi.toggleStock(item.id);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, in_stock: data.in_stock } : i));
    } catch {
      notify('Error', 'Could not update stock status');
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
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              {item.description
                ? <Text style={styles.desc}>{item.description}</Text>
                : <Text style={styles.descPlaceholder}>Tap to view designs</Text>
              }
            </View>
            {canToggleStock ? (
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
            <TouchableOpacity style={styles.iconBtn} onPress={() => shareItem(item)}>
              <Text style={styles.iconBtnText}>🔗</Text>
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
                <Text style={styles.iconBtnText}>✏️</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

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

      {/* Edit Item Modal (admin) — includes brand picker so admins can move an item to a different brand */}
      <Modal visible={!!editTarget} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>Edit Item</Text>
            <TextInput style={modalBase.input} placeholder="Item name" placeholderTextColor={colors.textSecondary} value={editName} onChangeText={setEditName} />
            <TextInput style={modalBase.input} placeholder="Description (optional)" placeholderTextColor={colors.textSecondary} value={editDescription} onChangeText={setEditDescription} />
            <Text style={styles.editLabel}>Brand</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {allBrands.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.editChip, editBrandId === b.id && styles.editChipActive]}
                  onPress={() => setEditBrandId(b.id)}
                >
                  <Text style={[styles.editChipText, editBrandId === b.id && styles.editChipTextActive]}>{b.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.editLabel}>Tally stock item</Text>
            <Text style={styles.tallyHint}>Links this whole collection to Tally stock. Every design under it shows this item's stock.</Text>
            <TouchableOpacity style={styles.tallyField} onPress={openTallyPicker}>
              <Text style={[styles.tallyFieldText, !editTally && { color: colors.textSecondary }]} numberOfLines={1}>
                {editTally || 'Not linked — tap to pick from Tally'}
              </Text>
              {editTally
                ? <TouchableOpacity onPress={() => setEditTally('')}><Text style={styles.tallyClear}>Clear</Text></TouchableOpacity>
                : <Text style={styles.tallyChevron}>›</Text>}
            </TouchableOpacity>
            <View style={modalBase.row}>
              <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setEditTarget(null)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modalBase.btnPrimary} onPress={saveEdit} disabled={editSaving}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{editSaving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tally stock-item picker — pick the exact synced Tally name (no typing) */}
      <Modal visible={tallyPicker} transparent animationType="slide" onRequestClose={() => setTallyPicker(false)}>
        <View style={modalBase.overlay}>
          <View style={[modalBase.sheet, { maxHeight: '80%' }]}>
            <Text style={modalBase.title}>Pick Tally stock item</Text>
            <TextInput style={modalBase.input} placeholder="Search Tally items…" placeholderTextColor={colors.textSecondary} value={tallySearch} onChangeText={setTallySearch} autoCapitalize="none" />
            <FlatList
              data={tallySearch.trim()
                ? tallyItems.filter(t => t.name.toLowerCase().includes(tallySearch.trim().toLowerCase()))
                : tallyItems}
              keyExtractor={t => t.name}
              keyboardShouldPersistTaps="handled"
              style={{ marginBottom: 8 }}
              ListEmptyComponent={<Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>No Tally items synced yet</Text>}
              renderItem={({ item: t }) => (
                <TouchableOpacity style={styles.tallyRow} onPress={() => { setEditTally(t.name); setTallyPicker(false); }}>
                  <Text style={styles.tallyRowName} numberOfLines={1}>{t.name}</Text>
                  <Text style={styles.tallyRowQty}>{t.qty != null ? `${t.qty}` : '—'}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setTallyPicker(false)}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
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
    gap: 8,
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
  cardOutOfStock: { opacity: 0.55 },
  stockToggle: { alignItems: 'center', gap: 2, marginRight: 0 },
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
  iconBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 13 },
  editLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  editChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border },
  editChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tallyHint: { fontSize: 11, color: colors.textSecondary, marginBottom: 8, lineHeight: 16 },
  tallyField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  tallyFieldText: { flex: 1, fontSize: 15, color: colors.textPrimary, marginRight: 8 },
  tallyClear: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  tallyChevron: { color: colors.textSecondary, fontSize: 22, fontWeight: '300' },
  tallyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  tallyRowName: { flex: 1, fontSize: 15, color: colors.textPrimary },
  tallyRowQty: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  editChipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  editChipTextActive: { color: '#fff', fontWeight: '700' },
});
