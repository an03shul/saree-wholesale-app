import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Modal, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { adminApi, designsApi, getThumbUrl } from '../api/client';
import { confirmAction, notify } from '../utils/share';
import { colors, shadow, modalBase } from '../constants/theme';

const STATUS = {
  requested: { label: 'Requested', color: '#B26A00' },
  accepted: { label: 'Accepted', color: '#1565C0' },
  in_progress: { label: 'In progress', color: '#6A1B9A' },
  dispatched: { label: 'Dispatched', color: '#2E7D32' },
  cancelled: { label: 'Cancelled', color: colors.textSecondary },
};

// Admin: create production requests for manufacturers and track their status.
export default function ProductionScreen() {
  const [rows, setRows] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null); // chosen design {id, design_number, item_name, brand_name, brand_id}
  const [qty, setQty] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => adminApi.getProductionRequests().then(({ data }) => setRows(data)).catch(() => notify('Error', 'Could not load requests')), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(() => designsApi.search(term).then(({ data }) => setResults(data.slice(0, 20))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const openNew = () => { setPicked(null); setQ(''); setResults([]); setQty(''); setDue(''); setNote(''); setModal(true); };

  const create = async () => {
    if (!picked) return notify('Required', 'Pick a design');
    setSaving(true);
    try {
      await adminApi.createProductionRequest({ brand_id: picked.brand_id, design_id: picked.id, quantity: qty ? Number(qty) : null, due_date: due.trim(), note: note.trim() });
      setModal(false); load();
    } catch (e) { notify('Error', e.response?.data?.error || 'Could not create'); }
    finally { setSaving(false); }
  };

  const cancel = (r) => confirmAction('Cancel request', `Cancel this request for ${r.item_name || 'design'}?`, async () => {
    try { await adminApi.updateProductionRequest(r.id, { status: 'cancelled' }); load(); } catch { notify('Error', 'Could not cancel'); }
  }, 'Cancel request');
  const remove = (r) => confirmAction('Delete', 'Delete this request permanently?', async () => {
    try { await adminApi.deleteProductionRequest(r.id); load(); } catch { notify('Error', 'Could not delete'); }
  }, 'Delete');

  if (!rows) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={rows}
        keyExtractor={r => String(r.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={styles.empty}>No production requests yet. Tap ➕ to ask a manufacturer to make something.</Text>}
        renderItem={({ item: r }) => {
          const st = STATUS[r.status] || STATUS.requested;
          return (
            <View style={styles.card}>
              {r.photo_path ? <Image source={{ uri: getThumbUrl(r.photo_path) }} style={styles.thumb} />
                : <View style={[styles.thumb, styles.noThumb]}><Text style={styles.noThumbText}>No photo</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{r.item_name || 'Design'}{r.design_number ? ` · ${r.design_number}` : ''}</Text>
                <Text style={styles.sub}>{r.brand_name || '—'}{r.quantity ? ` · ${r.quantity} pcs` : ''}{r.due_date ? ` · by ${r.due_date}` : ''}</Text>
                {!!r.note && <Text style={styles.sub} numberOfLines={1}>📝 {r.note}</Text>}
                <Text style={[styles.badge, { color: st.color, borderColor: st.color }]}>{st.label}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                {r.status !== 'cancelled' && r.status !== 'dispatched' && (
                  <TouchableOpacity onPress={() => cancel(r)}><Text style={styles.link}>Cancel</Text></TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => remove(r)}><Text style={{ fontSize: 16 }}>🗑️</Text></TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
      <TouchableOpacity style={styles.fab} onPress={openNew}><Text style={styles.fabText}>+</Text></TouchableOpacity>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={modalBase.overlay}>
          <View style={[modalBase.sheet, { maxHeight: '85%' }]}>
            <Text style={modalBase.title}>New production request</Text>
            {picked ? (
              <View style={styles.picked}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{picked.item_name} · {picked.design_number}</Text>
                  <Text style={styles.sub}>{picked.brand_name}</Text>
                </View>
                <TouchableOpacity onPress={() => setPicked(null)}><Text style={styles.link}>Change</Text></TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput style={modalBase.input} placeholder="Search a design (number / name)…" placeholderTextColor={colors.textSecondary} value={q} onChangeText={setQ} autoFocus />
                <FlatList
                  data={results} keyExtractor={d => String(d.id)} keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}
                  ListEmptyComponent={q.trim().length >= 2 ? <Text style={styles.sub}>No matches</Text> : null}
                  renderItem={({ item: d }) => (
                    <TouchableOpacity style={styles.resRow} onPress={() => { setPicked(d); setQ(''); setResults([]); }}>
                      <Text style={styles.title} numberOfLines={1}>{d.item_name} · {d.design_number}</Text>
                      <Text style={styles.sub}>{d.brand_name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[modalBase.input, { flex: 1 }]} placeholder="Qty (pcs)" placeholderTextColor={colors.textSecondary} value={qty} onChangeText={setQty} keyboardType="number-pad" />
              <TextInput style={[modalBase.input, { flex: 1.4 }]} placeholder="Due (YYYY-MM-DD)" placeholderTextColor={colors.textSecondary} value={due} onChangeText={setDue} />
            </View>
            <TextInput style={modalBase.input} placeholder="Note (optional)" placeholderTextColor={colors.textSecondary} value={note} onChangeText={setNote} />
            <View style={modalBase.row}>
              <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setModal(false)}><Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={modalBase.btnPrimary} onPress={create} disabled={saving}><Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Sending…' : 'Send request'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: 60, color: colors.textSecondary, paddingHorizontal: 24, lineHeight: 21 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12, marginBottom: 10, ...shadow.small },
  thumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.background },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  noThumbText: { fontSize: 9, color: colors.textSecondary },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badge: { fontSize: 11, fontWeight: '800', borderWidth: 1.2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', alignSelf: 'flex-start', marginTop: 6 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.background, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, padding: 12, marginBottom: 12 },
  resRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: colors.primary, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', ...shadow.medium },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 36 },
});
