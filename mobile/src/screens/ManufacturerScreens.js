import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, SectionList, TouchableOpacity, TextInput, StyleSheet,
  Image, ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { manufacturerApi, getThumbUrl, getImageUrl } from '../api/client';
import { pickFile } from '../utils/pickFile';
import { notify } from '../utils/share';
import { colors, shadow } from '../constants/theme';
import ChatThread from '../components/ChatThread';

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

// Submit a brand-new design for admin review. The manufacturer picks an existing
// collection or names a new one; it stays in a review queue (never in the live
// catalog) until the shop approves it. See admin "Submissions" tab.
export function SubmitDesignScreen() {
  const [collections, setCollections] = useState([]); // {id, name} for this brand
  const [mine, setMine] = useState([]);               // my pending submissions
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [itemId, setItemId] = useState(null);         // chosen existing collection
  const [newMode, setNewMode] = useState(false);      // "＋ New collection" chosen
  const [newName, setNewName] = useState('');
  const [num, setNum] = useState('');
  const [rate, setRate] = useState('');
  const [pcs, setPcs] = useState('');
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: designs }, { data: subs }] = await Promise.all([
        manufacturerApi.stock(), manufacturerApi.mySubmissions(),
      ]);
      const map = new Map();
      for (const d of designs) if (!map.has(d.item_id)) map.set(d.item_id, { id: d.item_id, name: d.item_name });
      setCollections([...map.values()]);
      setMine(subs);
    } catch { notify('Error', 'Could not load'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setItemId(null); setNewMode(false); setNewName(''); setNum(''); setRate(''); setPcs(''); setPicked(null); };

  const submit = async () => {
    if (!newMode && !itemId) return notify('Required', 'Pick a collection or add a new one');
    if (newMode && !newName.trim()) return notify('Required', 'Name the new collection');
    if (!num.trim()) return notify('Required', 'Enter the design number');
    if (!(parseFloat(rate) >= 0)) return notify('Required', 'Enter a valid rate');
    if (!(parseInt(pcs) >= 1)) return notify('Required', 'Enter pieces per set');
    if (!picked) return notify('Required', 'Pick a photo');
    setSaving(true);
    try {
      const fd = new FormData();
      if (newMode) fd.append('new_item_name', newName.trim());
      else fd.append('item_id', String(itemId));
      fd.append('design_number', num.trim());
      fd.append('rate', String(parseFloat(rate)));
      fd.append('pcs_per_set', String(parseInt(pcs)));
      fd.append('photo', picked.file);
      await manufacturerApi.submitDesign(fd);
      notify('Submitted', 'Sent to the shop for review');
      reset(); load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Submission failed');
    } finally { setSaving(false); }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  return (
    <FlatList
      style={styles.list}
      data={mine}
      keyExtractor={s => String(s.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      ListHeaderComponent={
        <View>
          <Text style={styles.help}>Add a new design for the shop to review. Pick one of your collections or start a new one, then attach a photo. It goes live only after the shop approves it.</Text>

          <Text style={styles.fieldLbl}>Collection</Text>
          <View style={styles.chipRow}>
            {collections.map(c => (
              <TouchableOpacity key={c.id} style={[styles.chip, itemId === c.id && !newMode && styles.chipOn]}
                onPress={() => { setItemId(c.id); setNewMode(false); }}>
                <Text style={[styles.chipText, itemId === c.id && !newMode && styles.chipTextOn]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.chip, newMode && styles.chipOn]} onPress={() => { setNewMode(true); setItemId(null); }}>
              <Text style={[styles.chipText, newMode && styles.chipTextOn]}>＋ New collection</Text>
            </TouchableOpacity>
          </View>
          {newMode && (
            <TextInput style={styles.input} placeholder="New collection name" placeholderTextColor={colors.textSecondary} value={newName} onChangeText={setNewName} />
          )}

          <Text style={styles.fieldLbl}>Design number</Text>
          <TextInput style={styles.input} placeholder="e.g. 1042" placeholderTextColor={colors.textSecondary} value={num} onChangeText={setNum} autoCapitalize="characters" />
          <Text style={styles.fieldLbl}>Rate (₹)</Text>
          <TextInput style={styles.input} placeholder="e.g. 550" placeholderTextColor={colors.textSecondary} value={rate} onChangeText={setRate} keyboardType="numeric" />
          <Text style={styles.fieldLbl}>Pieces per set</Text>
          <TextInput style={styles.input} placeholder="e.g. 8" placeholderTextColor={colors.textSecondary} value={pcs} onChangeText={setPcs} keyboardType="numeric" />

          <TouchableOpacity style={styles.pickBtn} onPress={async () => { const p = await pickFile('image/*'); if (p) setPicked(p); }}>
            <Text style={styles.pickBtnText}>{picked ? `📎 ${picked.name}` : '📷  Pick / take photo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.submit, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
            <Text style={styles.submitText}>{saving ? 'Submitting…' : 'Submit for review'}</Text>
          </TouchableOpacity>

          {mine.length > 0 && <Text style={[styles.fieldLbl, { marginTop: 26 }]}>Awaiting review ({mine.length})</Text>}
        </View>
      }
      renderItem={({ item: s }) => (
        <View style={styles.card}>
          <Image source={{ uri: getThumbUrl(s.photo_path) }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{s.new_item_name || s.item_name}</Text>
            <Text style={styles.sub}>Design {s.design_number} · ₹{s.rate}</Text>
          </View>
          <Text style={{ color: '#B26A00', fontWeight: '700', fontSize: 12 }}>Pending</Text>
        </View>
      )}
    />
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

// Production requests from the shop: accept → start → mark dispatched.
const REQ_STATUS = {
  requested: { label: 'New request', color: '#B26A00', next: 'accepted', action: 'Accept' },
  accepted: { label: 'Accepted', color: '#1565C0', next: 'in_progress', action: 'Start making' },
  in_progress: { label: 'In progress', color: '#6A1B9A', next: 'dispatched', action: 'Mark dispatched' },
  dispatched: { label: 'Dispatched ✓', color: '#2E7D32', next: null, action: null },
  cancelled: { label: 'Cancelled', color: colors.textSecondary, next: null, action: null },
};
export function RequestsScreen() {
  const [rows, setRows] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => manufacturerApi.requests().then(({ data }) => setRows(data)).catch(() => notify('Error', 'Could not load requests')), []);
  useEffect(() => { load(); }, [load]);

  const advance = async (r) => {
    const next = REQ_STATUS[r.status]?.next;
    if (!next) return;
    setBusy(r.id);
    try { await manufacturerApi.setRequestStatus(r.id, next); await load(); }
    catch (e) { notify('Error', e.response?.data?.error || 'Could not update'); }
    finally { setBusy(null); }
  };

  if (!rows) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;
  return (
    <FlatList
      style={styles.list}
      data={rows}
      keyExtractor={r => String(r.id)}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
      ListEmptyComponent={<Text style={styles.empty}>No production requests yet. When the shop asks you to make something, it appears here.</Text>}
      renderItem={({ item: r }) => {
        const st = REQ_STATUS[r.status] || REQ_STATUS.requested;
        return (
          <View style={styles.card}>
            {r.photo_path ? <Image source={{ uri: getThumbUrl(r.photo_path) }} style={styles.thumb} />
              : <View style={[styles.thumb, styles.noThumb]}><Text style={styles.noThumbText}>No photo</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{r.item_name || 'Design'}{r.design_number ? ` · ${r.design_number}` : ''}</Text>
              <Text style={styles.sub}>{r.quantity ? `${r.quantity} pcs` : 'qty —'}{r.due_date ? ` · by ${r.due_date}` : ''}</Text>
              {!!r.note && <Text style={[styles.sub, { marginTop: 3 }]} numberOfLines={2}>📝 {r.note}</Text>}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 }}>
                <Text style={[styles.reqBadge, { color: st.color, borderColor: st.color }]}>{st.label}</Text>
                {st.action && (
                  <TouchableOpacity style={[styles.reqBtn, busy === r.id && { opacity: 0.5 }]} disabled={busy === r.id} onPress={() => advance(r)}>
                    <Text style={styles.reqBtnText}>{busy === r.id ? '…' : st.action}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

// Analytics for the manufacturer's brand: stock alerts, demand, photo coverage.
export function InsightsScreen() {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => manufacturerApi.insights()
    .then(({ data }) => setData(data))
    .catch(() => notify('Error', 'Could not load insights')), []);
  useEffect(() => { load(); }, [load]);

  if (!data) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;
  const pending = data.byStatus.find(s => s.status === 'pending')?.n || 0;
  const done = data.byStatus.filter(s => s.status !== 'pending').reduce((n, s) => n + s.n, 0);

  const Section = ({ title, children }) => (
    <View style={{ marginBottom: 18 }}>
      <Text style={insight.secTitle}>{title}</Text>
      {children}
    </View>
  );
  const Row = ({ left, right, danger }) => (
    <View style={insight.row}>
      <Text style={insight.rowLeft} numberOfLines={1}>{left}</Text>
      <Text style={[insight.rowRight, danger && { color: colors.danger }]}>{right}</Text>
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      data={[1]} keyExtractor={() => 'insights'}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
      renderItem={() => (
        <View style={{ padding: 16 }}>
          {/* B6 — demand */}
          <View style={insight.statRow}>
            <View style={insight.statCard}>
              <Text style={insight.statNum}>{data.week.pieces}</Text>
              <Text style={insight.statLbl}>pcs ordered · 7 days</Text>
              <Text style={insight.statSub}>{data.week.orders} orders</Text>
            </View>
            <View style={insight.statCard}>
              <Text style={insight.statNum}>{data.month.pieces}</Text>
              <Text style={insight.statLbl}>pcs ordered · 30 days</Text>
              <Text style={insight.statSub}>{data.month.orders} orders</Text>
            </View>
          </View>
          {/* B8 — order status */}
          <View style={insight.statRow}>
            <View style={insight.statCard}>
              <Text style={[insight.statNum, pending > 0 && { color: '#B26A00' }]}>{pending}</Text>
              <Text style={insight.statLbl}>orders pending</Text>
            </View>
            <View style={insight.statCard}>
              <Text style={[insight.statNum, { color: '#2E7D32' }]}>{done}</Text>
              <Text style={insight.statLbl}>orders completed</Text>
            </View>
          </View>

          {/* B10 — urgent */}
          {data.urgent.length > 0 && (
            <Section title="🚨 Ordered but out of stock — dispatch these first">
              {data.urgent.map((u, i) => <Row key={i} left={`${u.item_name} · ${u.design_number}`} right={`${u.pending_pieces} pcs pending`} danger />)}
            </Section>
          )}

          {/* A3 — out of stock */}
          <Section title={`Out of stock (${data.outOfStock.length})`}>
            {data.outOfStock.length === 0 ? <Text style={insight.okLine}>Nothing at zero 🎉</Text>
              : data.outOfStock.map((c, i) => <Row key={i} left={c.name} right="0" danger />)}
          </Section>

          {/* A4 — low stock */}
          <Section title={`Low stock — 5 pcs or less (${data.lowStock.length})`}>
            {data.lowStock.length === 0 ? <Text style={insight.okLine}>No collections running low</Text>
              : data.lowStock.map((c, i) => <Row key={i} left={c.name} right={`${c.qty} pcs`} />)}
          </Section>

          {/* B7 — top sellers */}
          <Section title="Top designs · last 90 days">
            {data.topDesigns.length === 0 ? <Text style={insight.okLine}>No orders yet in this period</Text>
              : data.topDesigns.map((t, i) => <Row key={i} left={`${i + 1}. ${t.item_name || ''} · ${t.design_number}`} right={`${t.pieces} pcs`} />)}
          </Section>

          {/* C11 — photo coverage */}
          <Section title="Catalog photos">
            <Row left={`${data.photos.total - data.photos.missing} of ${data.photos.total} designs have photos`}
                 right={data.photos.missing > 0 ? `${data.photos.missing} missing` : '✓'}
                 danger={data.photos.missing > 0} />
            {data.photos.missing > 0 && <Text style={insight.hint}>Add them from the Dispatch tab — tap a design marked “Attach”.</Text>}
          </Section>
        </View>
      )}
    />
  );
}

const insight = StyleSheet.create({
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, alignItems: 'center', ...shadow.small },
  statNum: { fontSize: 26, fontWeight: '900', color: colors.primary },
  statLbl: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  statSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  secTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginBottom: 8, marginTop: 6, letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, gap: 10, ...shadow.small },
  rowLeft: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  rowRight: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  okLine: { fontSize: 13, color: colors.textSecondary, paddingVertical: 4 },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 17 },
});

// Two-way private chat with the admin (only they can see it).
export function NotesScreen() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    manufacturerApi.notes()
      .then(({ data }) => setNotes(data))
      .catch(() => notify('Error', 'Could not load messages'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <ChatThread
      messages={notes}
      mineRole="manufacturer"
      loading={loading}
      placeholder="Message the shop owner…"
      emptyText="Send a message to the shop owner about a dispatch, stock or an issue — only they can see it."
      onSend={async (t) => {
        try { await manufacturerApi.addNote(t); load(); }
        catch (e) { notify('Error', e.response?.data?.error || 'Could not send'); throw e; }
      }}
    />
  );
}

const styles = StyleSheet.create({
  padded: { flex: 1, backgroundColor: colors.background, padding: 20 },
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
  reqBadge: { fontSize: 11, fontWeight: '800', borderWidth: 1.2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  reqBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  reqBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  summaryBar: { backgroundColor: colors.card, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 14, ...shadow.small },
  summaryNum: { fontSize: 34, fontWeight: '900', color: colors.primary },
  summaryLbl: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  summarySub: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, paddingVertical: 8, gap: 12 },
  sectionName: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  sectionQty: { fontSize: 13, fontWeight: '800', color: '#2E7D32' },
  sectionQtyMuted: { color: colors.textSecondary, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 60, color: colors.textSecondary },
  fieldLbl: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  chipTextOn: { color: '#fff' },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerClose: { position: 'absolute', top: 40, right: 20, padding: 10 },
  viewerLabel: { position: 'absolute', bottom: 30, alignSelf: 'center', color: '#fff', fontSize: 14, maxWidth: '80%', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, overflow: 'hidden' },
});
