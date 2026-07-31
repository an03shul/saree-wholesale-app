import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, SectionList, TouchableOpacity, TextInput, StyleSheet,
  Image, ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { manufacturerApi, getThumbUrl, getImageUrl } from '../api/client';
import { pickFile } from '../utils/pickFile';
import { notify } from '../utils/share';
import { parseServerDate } from '../utils/date';
import { colors, shadow } from '../constants/theme';

// Upload a dispatched-item photo. The manufacturer searches their own catalog
// (by design number or collection name) and picks the design, so a photo can't
// land on the wrong design — or fail because they typed a name, not a number.
export function DispatchScreen() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadDesigns = useCallback(() => {
    manufacturerApi.stock()
      .then(({ data }) => setDesigns(data))
      .catch(() => notify('Error', 'Could not load your designs'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadDesigns(); }, [loadDesigns]);

  const term = q.trim().toLowerCase();
  const matches = term
    ? designs.filter(d => String(d.design_number).toLowerCase().includes(term) || (d.item_name || '').toLowerCase().includes(term))
    : designs;

  const submit = async () => {
    if (!selected) return notify('Required', 'Pick the design');
    if (!picked) return notify('Required', 'Pick a photo');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('design_id', String(selected.id));
      fd.append('photo', picked.file);
      await manufacturerApi.dispatchPhoto(fd);
      notify('Uploaded', `Photo attached to ${selected.item_name} · ${selected.design_number}`);
      setSelected(null); setPicked(null); setQ('');
      loadDesigns(); // reflect the new photo in the list
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Upload failed');
    } finally { setSaving(false); }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  // Once a design is chosen, collapse to a compact bar + the photo upload.
  if (selected) {
    return (
      <View style={styles.padded}>
        <Text style={styles.help}>Photograph the dispatched item — it attaches to this design in the catalog, so the shop doesn't have to re-shoot it.</Text>
        <View style={styles.pickedBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{selected.item_name}</Text>
            <Text style={styles.sub}>Design {selected.design_number}</Text>
          </View>
          <TouchableOpacity onPress={() => { setSelected(null); setPicked(null); }}>
            <Text style={styles.changeBtn}>Change</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.pickBtn} onPress={async () => { const p = await pickFile(); if (p) setPicked(p); }}>
          <Text style={styles.pickBtnText}>{picked ? `📎 ${picked.name}` : '📷  Pick / take photo'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.submit, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
          <Text style={styles.submitText}>{saving ? 'Uploading…' : 'Upload dispatch photo'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.padded}>
      <Text style={styles.help}>Find the design you're dispatching, then attach its photo. Search by design number or collection name.</Text>
      <TextInput style={styles.input} placeholder="Search design or collection…" placeholderTextColor={colors.textSecondary} value={q} onChangeText={setQ} autoCapitalize="none" />
      <FlatList
        data={matches}
        keyExtractor={d => String(d.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>{designs.length ? 'No matches' : 'No designs in your catalog yet'}</Text>}
        renderItem={({ item: d }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => setSelected(d)}>
            {d.photo_path ? <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.thumb} />
              : <View style={[styles.thumb, styles.noThumb]}><Text style={styles.noThumbText}>No photo</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{d.item_name}</Text>
              <Text style={styles.sub} numberOfLines={1}>Design {d.design_number} · ₹{d.rate}</Text>
            </View>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{d.photo_path ? 'Replace' : 'Attach'}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// Read-only stock for the manufacturer's brand, grouped by collection (item)
// with each collection's Tally total and a company-wide total.
export function StockScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewing, setViewing] = useState(null); // design shown full-screen
  const load = useCallback(async () => {
    try { const { data } = await manufacturerApi.stock(); setRows(data); }
    catch { notify('Error', 'Could not load stock'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Group designs under their collection; item_qty is the collection's Tally total.
  const sections = useMemo(() => {
    const map = new Map();
    for (const d of rows) {
      if (!map.has(d.item_id)) map.set(d.item_id, { title: d.item_name, item_qty: d.item_qty, data: [] });
      map.get(d.item_id).data.push(d);
    }
    return [...map.values()];
  }, [rows]);
  // Company total = sum of each collection's Tally stock (once per collection).
  const companyTotal = useMemo(() => sections.reduce((s, sec) => s + (sec.item_qty || 0), 0), [sections]);
  const linkedCount = useMemo(() => sections.filter(s => s.item_qty != null).length, [sections]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;
  return (
    <>
      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={d => String(d.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={styles.empty}>No designs for your brand yet</Text>}
        ListHeaderComponent={sections.length ? (
          <View style={styles.summaryBar}>
            <Text style={styles.summaryNum}>{companyTotal}</Text>
            <Text style={styles.summaryLbl}>total stock in Tally</Text>
            <Text style={styles.summarySub}>{linkedCount} of {sections.length} collections linked</Text>
          </View>
        ) : null}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionName} numberOfLines={1}>{section.title}</Text>
            <Text style={[styles.sectionQty, section.item_qty == null && styles.sectionQtyMuted]}>
              {section.item_qty != null ? `${section.item_qty} in stock` : 'Not linked to Tally'}
            </Text>
          </View>
        )}
        renderItem={({ item: d }) => (
          // Tap a design with a photo to see it full-screen.
          <TouchableOpacity style={styles.card} activeOpacity={d.photo_path ? 0.7 : 1} onPress={() => d.photo_path && setViewing(d)}>
            {d.photo_path ? <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.thumb} />
              : <View style={[styles.thumb, styles.noThumb]}><Text style={styles.noThumbText}>No photo</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>Design {d.design_number}</Text>
              <Text style={styles.sub} numberOfLines={1}>₹{d.rate}</Text>
            </View>
            <Text style={[styles.stockTag, { color: d.in_stock ? '#2E7D32' : colors.danger }]}>{d.in_stock ? 'In stock' : 'Out'}</Text>
          </TouchableOpacity>
        )}
      />
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing && <Image source={{ uri: getImageUrl(viewing.photo_path) }} style={{ flex: 1 }} resizeMode="contain" />}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewing(null)}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
          {viewing && <Text style={styles.viewerLabel} numberOfLines={1}>Design {viewing.design_number} · {viewing.item_name}</Text>}
        </View>
      </Modal>
    </>
  );
}

// Private notes to the admin — the manufacturer writes, only admin reads.
export function NotesScreen() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    manufacturerApi.notes()
      .then(({ data }) => setNotes(data))
      .catch(() => notify('Error', 'Could not load notes'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await manufacturerApi.addNote(body.trim());
      setBody('');
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not save note');
    } finally { setSaving(false); }
  };

  const fmt = (ts) => parseServerDate(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.padded}>
      <Text style={styles.help}>Leave a note for the shop owner — only they can see it. Use it for anything about a dispatch, stock, or an issue.</Text>
      <TextInput style={styles.noteInput} placeholder="Write a note…" placeholderTextColor={colors.textSecondary} value={body} onChangeText={setBody} multiline />
      <TouchableOpacity style={[styles.submit, (saving || !body.trim()) && { opacity: 0.6 }]} onPress={submit} disabled={saving || !body.trim()}>
        <Text style={styles.submitText}>{saving ? 'Sending…' : 'Send note'}</Text>
      </TouchableOpacity>
      {loading ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        : (
          <FlatList
            style={{ marginTop: 16 }}
            data={notes}
            keyExtractor={n => String(n.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={<Text style={styles.empty}>No notes yet</Text>}
            renderItem={({ item: n }) => (
              <View style={styles.noteCard}>
                <Text style={styles.noteBody}>{n.body}</Text>
                <Text style={styles.noteTime}>{fmt(n.created_at)}</Text>
              </View>
            )}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  padded: { flex: 1, backgroundColor: colors.background, padding: 20 },
  noteInput: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.textPrimary, minHeight: 90, textAlignVertical: 'top', marginBottom: 12 },
  noteCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, ...shadow.small },
  noteBody: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  noteTime: { fontSize: 11, color: colors.textSecondary, marginTop: 8 },
  list: { flex: 1, backgroundColor: colors.background },
  help: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: 18, backgroundColor: colors.card, padding: 12, borderRadius: 10, ...shadow.small },
  input: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.textPrimary, marginBottom: 12 },
  pickedBar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, padding: 14, marginBottom: 16 },
  changeBtn: { color: colors.primary, fontWeight: '700', fontSize: 14 },
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
  stockTag: { fontSize: 11, fontWeight: '700' },
  summaryBar: { backgroundColor: colors.card, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 14, ...shadow.small },
  summaryNum: { fontSize: 34, fontWeight: '900', color: colors.primary },
  summaryLbl: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  summarySub: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, paddingVertical: 8, gap: 12 },
  sectionName: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  sectionQty: { fontSize: 13, fontWeight: '800', color: '#2E7D32' },
  sectionQtyMuted: { color: colors.textSecondary, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 60, color: colors.textSecondary },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerClose: { position: 'absolute', top: 40, right: 20, padding: 10 },
  viewerLabel: { position: 'absolute', bottom: 30, alignSelf: 'center', color: '#fff', fontSize: 14, maxWidth: '80%', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, overflow: 'hidden' },
});
