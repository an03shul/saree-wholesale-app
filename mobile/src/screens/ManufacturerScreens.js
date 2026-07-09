import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { manufacturerApi, getThumbUrl } from '../api/client';
import { pickFile } from '../utils/pickFile';
import { notify } from '../utils/share';
import { colors, shadow } from '../constants/theme';

// Upload a dispatched-item photo, tagged by design number → attaches to that design.
export function DispatchScreen() {
  const [num, setNum] = useState('');
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!num.trim()) return notify('Required', 'Enter the design number');
    if (!picked) return notify('Required', 'Pick a photo');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('design_number', num.trim());
      fd.append('photo', picked.file);
      await manufacturerApi.dispatchPhoto(fd);
      notify('Uploaded', `Photo attached to design ${num.trim()}`);
      setNum(''); setPicked(null);
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Upload failed');
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.padded}>
      <Text style={styles.help}>Photograph a dispatched item and tag it with its design number — it attaches to that design in the catalog, so the shop doesn't have to re-shoot it.</Text>
      <TextInput style={styles.input} placeholder="Design number" placeholderTextColor={colors.textSecondary} value={num} onChangeText={setNum} autoCapitalize="characters" />
      <TouchableOpacity style={styles.pickBtn} onPress={async () => { const p = await pickFile(); if (p) setPicked(p); }}>
        <Text style={styles.pickBtnText}>{picked ? `📎 ${picked.name}` : '📷  Pick / take photo'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.submit, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        <Text style={styles.submitText}>{saving ? 'Uploading…' : 'Upload dispatch photo'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// Read-only stock for the manufacturer's brand.
export function StockScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { const { data } = await manufacturerApi.stock(); setRows(data); }
    catch { notify('Error', 'Could not load stock'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;
  return (
    <FlatList
      style={styles.list}
      data={rows}
      keyExtractor={d => String(d.id)}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
      ListEmptyComponent={<Text style={styles.empty}>No designs for your brand yet</Text>}
      renderItem={({ item: d }) => (
        <View style={styles.card}>
          {d.photo_path ? <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.thumb} />
            : <View style={[styles.thumb, styles.noThumb]}><Text style={styles.noThumbText}>No photo</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>Design {d.design_number}</Text>
            <Text style={styles.sub} numberOfLines={1}>{d.item_name} · ₹{d.rate}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.qty}>{d.qty != null ? `${d.qty}` : '—'}</Text>
            <Text style={[styles.stockTag, { color: d.in_stock ? '#2E7D32' : colors.danger }]}>{d.in_stock ? 'In stock' : 'Out'}</Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  padded: { flex: 1, backgroundColor: colors.background, padding: 20 },
  list: { flex: 1, backgroundColor: colors.background },
  help: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: 18, backgroundColor: colors.card, padding: 12, borderRadius: 10, ...shadow.small },
  input: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.textPrimary, marginBottom: 12 },
  pickBtn: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', padding: 16, alignItems: 'center', marginBottom: 16 },
  pickBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  submit: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12, marginBottom: 10, ...shadow.small },
  thumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.background },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  noThumbText: { fontSize: 9, color: colors.textSecondary },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  qty: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  stockTag: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 60, color: colors.textSecondary },
});
