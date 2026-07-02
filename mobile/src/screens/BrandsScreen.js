import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, Share, RefreshControl, Image
} from 'react-native';
import { brandsApi, designsApi, getCatalogUrl, getThumbUrl, statsApi } from '../api/client';
import { notify } from '../utils/share';
import { useUser } from '../../App';
import { colors, shadow, modalBase } from '../constants/theme';

export default function BrandsScreen({ navigation }) {
  const user = useUser();
  const isAdmin = user?.role === 'admin';

  const [brands, setBrands] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePin, setDeletePin] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Design search (available to admin + staff) — check stock & price from the home screen.
  const [designQuery, setDesignQuery] = useState('');
  const [designResults, setDesignResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  const searchDesigns = (q) => {
    setDesignQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setDesignResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await designsApi.search(q.trim());
        setDesignResults(data);
      } catch {
        setDesignResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const load = useCallback(async () => {
    try {
      const [brandsRes, statsRes] = await Promise.all([brandsApi.getAll(), statsApi.get()]);
      setBrands(brandsRes.data);
      setStats(statsRes.data);
    } catch {
      notify('Error', 'Could not load brands. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const createBrand = async () => {
    if (!name.trim()) return notify('Required', 'Please enter a brand name');
    setSaving(true);
    try {
      await brandsApi.create({ name: name.trim(), description: description.trim() });
      setModalVisible(false);
      setName(''); setDescription('');
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not create brand');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteBrand = async () => {
    if (!deletePin) return notify('Required', 'Enter your PIN');
    setDeleting(true);
    try {
      await brandsApi.delete(deleteTarget.id, deletePin);
      setDeleteTarget(null);
      setDeletePin('');
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not delete brand');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (brand) => {
    setEditTarget(brand);
    setEditName(brand.name);
    setEditDescription(brand.description || '');
  };

  const saveEdit = async () => {
    if (!editName.trim()) return notify('Required', 'Please enter a brand name');
    setEditSaving(true);
    try {
      await brandsApi.update(editTarget.id, { name: editName.trim(), description: editDescription.trim() });
      setEditTarget(null);
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not save brand');
    } finally {
      setEditSaving(false);
    }
  };

  const shareOrderingLink = async (brand) => {
    try {
      await Share.share({ message: `Browse ${brand.name} catalog & order: ${getCatalogUrl(brand.id)}` });
    } catch {}
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  const isSearching = designQuery.trim().length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Search design # / item / brand — stock & price"
          placeholderTextColor={colors.textSecondary}
          value={designQuery}
          onChangeText={searchDesigns}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {isSearching ? (
        <FlatList
          data={designResults}
          keyExtractor={d => String(d.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.listHeader}>
              {searching ? 'Searching…' : `${designResults.length} design${designResults.length !== 1 ? 's' : ''} found`}
            </Text>
          }
          ListEmptyComponent={
            !searching ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No designs found</Text>
                <Text style={styles.emptySubtitle}>Nothing matches "{designQuery}"</Text>
              </View>
            ) : null
          }
          renderItem={({ item: d }) => (
            <TouchableOpacity
              style={styles.resultCard}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Items', {
                brand: { id: d.brand_id, name: d.brand_name },
              })}
            >
              {d.photo_path
                ? <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.resultPhoto} />
                : <View style={[styles.resultPhoto, styles.resultNoPhoto]}><Text style={styles.resultNoPhotoText}>No photo</Text></View>
              }
              <View style={{ flex: 1 }}>
                <Text style={styles.resultDesign} numberOfLines={1}>Design {d.design_number}</Text>
                <Text style={styles.resultSub} numberOfLines={1}>{d.brand_name} · {d.item_name}</Text>
                <Text style={styles.resultRate}>₹{d.rate}</Text>
              </View>
              <View style={[styles.stockPill, d.in_stock ? styles.stockPillIn : styles.stockPillOut]}>
                <Text style={[styles.stockPillText, { color: d.in_stock ? '#2E7D32' : colors.danger }]}>
                  {d.in_stock ? 'In Stock' : 'Out of Stock'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
      <FlatList
        data={brands}
        keyExtractor={b => String(b.id)}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        ListHeaderComponent={
          <>
            {stats && (
              <View style={styles.statsBanner}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{stats.brands}</Text>
                  <Text style={styles.statLabel}>Brands</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{stats.designs}</Text>
                  <Text style={styles.statLabel}>Designs</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, stats.pending_orders > 0 && { color: '#E67E22' }]}>
                    {stats.pending_orders}
                  </Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>
              </View>
            )}
            <Text style={styles.listHeader}>
              {brands.length > 0 ? `${brands.length} Brand${brands.length !== 1 ? 's' : ''}` : ''}
            </Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🧵</Text>
            <Text style={styles.emptyTitle}>No brands yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to add your first brand{'\n'}e.g. "Veer Creation"</Text>
          </View>
        }
        renderItem={({ item: brand }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Items', { brand })}
            onLongPress={() => isAdmin && setDeleteTarget(brand)}
            activeOpacity={0.7}
          >
            <View style={styles.cardAccent} />
            <View style={styles.initialCircle}>
              <Text style={styles.initialText}>{String(brand.name || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.brandName}>{brand.name}</Text>
              {brand.description
                ? <Text style={styles.desc}>{brand.description}</Text>
                : <Text style={styles.descPlaceholder}>Tap to view items</Text>
              }
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={() => shareOrderingLink(brand)}>
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(brand)}>
                <Text style={styles.editBtnText}>✏️</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        )}
      />
      )}

      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Create Brand Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>New Brand</Text>
            <TextInput style={modalBase.input} placeholder="Brand name (e.g. Veer Creation)" placeholderTextColor={colors.textSecondary} value={name} onChangeText={setName} />
            <TextInput style={modalBase.input} placeholder="Description (optional)" placeholderTextColor={colors.textSecondary} value={description} onChangeText={setDescription} />
            <View style={modalBase.row}>
              <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setModalVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modalBase.btnPrimary} onPress={createBrand} disabled={saving}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Brand Modal (admin) */}
      <Modal visible={!!editTarget} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>Edit Brand</Text>
            <TextInput style={modalBase.input} placeholder="Brand name" placeholderTextColor={colors.textSecondary} value={editName} onChangeText={setEditName} />
            <TextInput style={modalBase.input} placeholder="Description (optional)" placeholderTextColor={colors.textSecondary} value={editDescription} onChangeText={setEditDescription} />
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

      {/* Delete Brand Modal */}
      <Modal visible={!!deleteTarget} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>Delete Brand</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 20, lineHeight: 22 }}>
              This will permanently delete "{deleteTarget?.name}" and ALL its items and designs. Enter your PIN to confirm.
            </Text>
            <TextInput style={modalBase.input} placeholder="Enter your PIN" placeholderTextColor={colors.textSecondary} value={deletePin} onChangeText={setDeletePin} keyboardType="number-pad" secureTextEntry maxLength={8} />
            <View style={modalBase.row}>
              <TouchableOpacity style={modalBase.btnSecondary} onPress={() => { setDeleteTarget(null); setDeletePin(''); }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modalBase.btnPrimary, { backgroundColor: colors.danger }]} onPress={confirmDeleteBrand} disabled={deleting}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{deleting ? 'Deleting...' : 'Delete'}</Text>
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
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchInput: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary, ...shadow.small,
  },
  resultCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 14, padding: 10, marginBottom: 10,
    ...shadow.small,
  },
  resultPhoto: { width: 54, height: 54, borderRadius: 10, backgroundColor: colors.background },
  resultNoPhoto: { alignItems: 'center', justifyContent: 'center' },
  resultNoPhotoText: { fontSize: 9, color: colors.textSecondary },
  resultDesign: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  resultSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  resultRate: { fontSize: 15, fontWeight: '800', color: colors.primary, marginTop: 3 },
  stockPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  stockPillIn: { backgroundColor: '#E8F5E9' },
  stockPillOut: { backgroundColor: '#FEE9E9' },
  stockPillText: { fontSize: 11, fontWeight: '800' },
  listHeader: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...shadow.small,
  },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.gold },
  initialCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.goldLight,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8, marginRight: 14,
  },
  initialText: { fontSize: 20, fontWeight: '800', color: colors.gold },
  brandName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  desc: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  descPlaceholder: { fontSize: 12, color: colors.border, marginTop: 3, fontStyle: 'italic' },
  arrow: { fontSize: 24, color: colors.gold, marginLeft: 8 },
  shareBtn: { backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  shareBtnText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  editBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  editBtnText: { fontSize: 14 },
  statsBanner: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16,
    padding: 16, marginBottom: 16, alignItems: 'center', justifyContent: 'space-around',
    ...shadow.small,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statNumber: { fontSize: 26, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: colors.border },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  fab: {
    position: 'absolute', bottom: 32, right: 24,
    backgroundColor: colors.primary, width: 58, height: 58,
    borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    opacity: 0.82,
    ...shadow.medium,
    shadowColor: colors.primary,
  },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 36 },
});
