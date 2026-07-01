import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, RefreshControl, Image, ScrollView,
} from 'react-native';
import { ordersApi, designsApi, getImageUrl, getThumbUrl } from '../api/client';
import { confirmAction, notify } from '../utils/share';
import { parseServerDate } from '../utils/date';
import { useUser } from '../../App';
import { colors, shadow, modalBase } from '../constants/theme';

const STATUS_COLORS = {
  pending:    { bg: '#FFF8E1', text: '#B8860B' },
  confirmed:  { bg: '#E8F5E9', text: '#2E7D32' },
  dispatched: { bg: '#E3F2FD', text: '#1565C0' },
  cancelled:  { bg: '#FCE4EC', text: '#B71C1C' },
};

const STATUS_LABELS = ['pending', 'confirmed', 'dispatched', 'cancelled'];

export default function OrdersScreen({ navigation }) {
  const user = useUser();
  const isAdmin = user?.role === 'admin';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [addModal, setAddModal] = useState(false);
  const [statusModal, setStatusModal] = useState(null); // order object
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', quantity: '1', note: '' });
  const [selectedDesign, setSelectedDesign] = useState(null);
  const [designSearch, setDesignSearch] = useState('');
  const [designResults, setDesignResults] = useState([]);
  const [designPickerOpen, setDesignPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await ordersApi.getAll();
      setOrders(data);
    } catch {
      notify('Error', 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const createOrder = async () => {
    if (!form.customer_name.trim()) return notify('Required', 'Enter customer name');
    setSaving(true);
    try {
      await ordersApi.create({
        design_id: selectedDesign?.id || null,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        quantity: parseInt(form.quantity) || 1,
        note: form.note.trim() || null,
        source: 'orders_tab',
      });
      setAddModal(false);
      setForm({ customer_name: '', customer_phone: '', quantity: '1', note: '' });
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not create order');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (order, status) => {
    try {
      await ordersApi.updateStatus(order.id, status);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status } : o));
      setStatusModal(null);
    } catch {
      notify('Error', 'Could not update status');
    }
  };

  const deleteOrder = (order) => {
    confirmAction('Delete', `Delete order from ${order.customer_name}?`, async () => {
      await ordersApi.delete(order.id); load();
    }, 'Delete');
  };

  const searchDesigns = async (q) => {
    setDesignSearch(q);
    if (!q.trim()) { setDesignResults([]); return; }
    try {
      const { data } = await designsApi.search(q);
      setDesignResults(data);
    } catch {}
  };

  const openAddModal = () => {
    setSelectedDesign(null);
    setDesignSearch('');
    setDesignResults([]);
    setDesignPickerOpen(false);
    setForm({ customer_name: '', customer_phone: '', quantity: '1', note: '' });
    setAddModal(true);
  };

  const formatDate = (dt) => {
    const d = parseServerDate(dt);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const filteredOrders = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);
  const countFor = (s) => s === 'all' ? orders.length : orders.filter(o => o.status === s).length;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 4, gap: 4 }}>
        {['all', 'pending', 'confirmed', 'dispatched', 'cancelled'].map(s => {
          const active = statusFilter === s;
          const sc = s === 'all' ? { bg: colors.primary, text: '#fff' } : STATUS_COLORS[s];
          return (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, active && { backgroundColor: sc.bg }]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[styles.filterChipText, active && { color: s === 'all' ? '#fff' : sc.text, fontWeight: '800' }]}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} ({countFor(s)})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <FlatList
        data={filteredOrders}
        keyExtractor={o => String(o.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        ListHeaderComponent={
          <Text style={styles.listHeader}>
            {orders.length > 0 ? `${orders.length} Order${orders.length !== 1 ? 's' : ''}` : ''}
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to log a customer inquiry or order</Text>
          </View>
        }
        renderItem={({ item: order }) => {
          const sc = STATUS_COLORS[order.status] || STATUS_COLORS.pending;
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => setStatusModal(order)}
              onLongPress={() => isAdmin && deleteOrder(order)}
              activeOpacity={0.75}
            >
              {order.photo_path && (
                <Image source={{ uri: getThumbUrl(order.photo_path) }} style={styles.thumb} />
              )}
              {!order.photo_path && (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Text style={{ fontSize: 22 }}>🛍️</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>{order.customer_name}</Text>
                {order.customer_phone ? <Text style={styles.customerPhone}>{order.customer_phone}</Text> : null}
                {order.design_number ? (
                  <Text style={styles.designRef}>
                    Design {order.design_number}{order.item_name ? ` · ${order.item_name}` : ''}{order.brand_name ? ` · ${order.brand_name}` : ''}
                  </Text>
                ) : null}
                <View style={styles.metaRow}>
                  <Text style={styles.qty}>Qty: {order.quantity}</Text>
                  <Text style={styles.date}>{formatDate(order.created_at)}</Text>
                </View>
                {order.note ? <Text style={styles.note} numberOfLines={2}>{order.note}</Text> : null}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                <Text style={[styles.statusText, { color: sc.text }]}>{order.status}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add Order Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }} keyboardShouldPersistTaps="handled">
            <View style={modalBase.sheet}>
              <Text style={modalBase.title}>New Order / Inquiry</Text>

              {/* Design Picker */}
              <TouchableOpacity
                style={[modalBase.input, { justifyContent: 'center' }]}
                onPress={() => setDesignPickerOpen(v => !v)}
              >
                <Text style={{ color: selectedDesign ? colors.textPrimary : colors.textSecondary, fontSize: 14 }}>
                  {selectedDesign
                    ? `Design ${selectedDesign.design_number} · ${selectedDesign.item_name} · ${selectedDesign.brand_name}`
                    : 'Select design (optional)'}
                </Text>
              </TouchableOpacity>
              {designPickerOpen && (
                <View style={styles.designPickerBox}>
                  <TextInput
                    style={[modalBase.input, { marginBottom: 6 }]}
                    placeholder="Search design no., item, brand…"
                    placeholderTextColor={colors.textSecondary}
                    value={designSearch}
                    onChangeText={searchDesigns}
                    autoFocus
                  />
                  {designResults.map(d => (
                    <TouchableOpacity
                      key={d.id}
                      style={styles.designPickerRow}
                      onPress={() => { setSelectedDesign(d); setDesignPickerOpen(false); setDesignSearch(''); setDesignResults([]); }}
                    >
                      <Text style={styles.designPickerName}>Design {d.design_number}</Text>
                      <Text style={styles.designPickerSub}>{d.item_name} · {d.brand_name}</Text>
                    </TouchableOpacity>
                  ))}
                  {designResults.length === 0 && designSearch.trim().length > 0 && (
                    <Text style={{ color: colors.textSecondary, fontSize: 13, padding: 8 }}>No designs found</Text>
                  )}
                  {selectedDesign && (
                    <TouchableOpacity onPress={() => { setSelectedDesign(null); setDesignPickerOpen(false); }}>
                      <Text style={{ color: colors.danger, fontSize: 13, padding: 8 }}>✕ Clear selection</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <TextInput style={modalBase.input} placeholder="Customer name *" placeholderTextColor={colors.textSecondary} value={form.customer_name} onChangeText={v => setForm(f => ({ ...f, customer_name: v }))} />
              <TextInput style={modalBase.input} placeholder="Phone (optional)" placeholderTextColor={colors.textSecondary} value={form.customer_phone} onChangeText={v => setForm(f => ({ ...f, customer_phone: v }))} keyboardType="phone-pad" />
              <TextInput style={modalBase.input} placeholder="Quantity" placeholderTextColor={colors.textSecondary} value={form.quantity} onChangeText={v => setForm(f => ({ ...f, quantity: v }))} keyboardType="number-pad" />
              <TextInput style={[modalBase.input, { height: 80 }]} placeholder="Notes (optional)" placeholderTextColor={colors.textSecondary} value={form.note} onChangeText={v => setForm(f => ({ ...f, note: v }))} multiline />
              <View style={modalBase.row}>
                <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setAddModal(false)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modalBase.btnPrimary} onPress={createOrder} disabled={saving}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Status Update Modal */}
      <Modal visible={!!statusModal} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>Update Status</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 20 }}>{statusModal?.customer_name}</Text>
            {STATUS_LABELS.map(s => {
              const sc = STATUS_COLORS[s];
              const active = statusModal?.status === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusOption, { backgroundColor: sc.bg }, active && styles.statusOptionActive]}
                  onPress={() => updateStatus(statusModal, s)}
                >
                  <Text style={[styles.statusOptionText, { color: sc.text }]}>
                    {active ? '✓  ' : '    '}{s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[modalBase.btnSecondary, { marginTop: 16, alignSelf: 'flex-end' }]} onPress={() => setStatusModal(null)}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterBar: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterChip: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  filterChipText: { fontSize: 9, fontWeight: '600', color: colors.textSecondary },
  listHeader: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...shadow.small,
  },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbPlaceholder: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  customerName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  customerPhone: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  designRef: { fontSize: 12, color: colors.primary, marginTop: 4, fontWeight: '600' },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  qty: { fontSize: 12, color: colors.textSecondary },
  date: { fontSize: 12, color: colors.textSecondary },
  note: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  statusOption: { padding: 16, borderRadius: 12, marginBottom: 8 },
  statusOptionActive: { borderWidth: 2, borderColor: 'transparent' },
  statusOptionText: { fontSize: 15, fontWeight: '700' },
  designPickerBox: { backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8, padding: 8 },
  designPickerRow: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  designPickerName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  designPickerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
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
