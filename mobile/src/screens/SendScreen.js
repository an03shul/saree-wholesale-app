import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image, ScrollView, Linking, TextInput,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { brandsApi, itemsApi, contactsApi, sendApi, fabricsApi, workCategoriesApi, getImageUrl, getThumbUrl, getCatalogUrl, getPdfUrl, whatsappLink } from '../api/client';
import { colors, shadow } from '../constants/theme';

const PRICE_PRESETS = [
  { label: '300–500', min: '300', max: '500' },
  { label: '400–700', min: '400', max: '700' },
  { label: '500–800', min: '500', max: '800' },
  { label: '800–1200', min: '800', max: '1200' },
  { label: '1200+', min: '1200', max: '' },
];

export default function SendScreen() {
  const [mode, setMode] = useState('item'); // 'item' | 'filter'
  const [brands, setBrands] = useState([]);
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [workCats, setWorkCats] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Filter mode state
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [filterWorkCats, setFilterWorkCats] = useState([]);
  const [filterFabrics, setFilterFabrics] = useState([]);
  const [filterResults, setFilterResults] = useState(null);
  const [excludedIds, setExcludedIds] = useState(new Set());

  // Catalogue WhatsApp modal
  const [msgModal, setMsgModal] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState('');

  useEffect(() => {
    Promise.all([brandsApi.getAll(), contactsApi.getAll(), workCategoriesApi.getAll(), fabricsApi.getAll()])
      .then(([b, c, w, f]) => {
        setBrands(b.data);
        setContacts(c.data);
        setWorkCats(w.data.map(x => x.name));
        setFabrics(f.data.map(x => x.name));
      });
  }, []);

  const toggleInSet = (setter, value) => {
    setter(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  };

  const runFilter = async () => {
    if (!selectedBrand) return Alert.alert('Select brand', 'Pick a brand first');
    setLoading(true);
    setFilterResults(null);
    setExcludedIds(new Set());
    try {
      const params = { in_stock_only: 'true' };
      if (minRate) params.min_rate = minRate;
      if (maxRate) params.max_rate = maxRate;
      if (filterWorkCats.length) params.work_categories = filterWorkCats.join(',');
      if (filterFabrics.length) params.fabric_types = filterFabrics.join(',');
      const { data } = await sendApi.filterBrand(selectedBrand.id, params);
      setFilterResults(data);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not filter designs');
    } finally {
      setLoading(false);
    }
  };

  const sendFiltered = async () => {
    if (!selectedContact) return Alert.alert('Select contact', 'Please select a recipient');
    const ids = filterResults.designs.filter(d => !excludedIds.has(d.id)).map(d => d.id);
    if (!ids.length) return Alert.alert('Nothing to send', 'No designs selected');
    setSending(true);
    try {
      const { data } = await sendApi.sendSelected(ids, selectedContact.phone);
      Alert.alert('Sent!', `${data.sent} designs sent to ${selectedContact.name}`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  // Show the message preview modal; user can edit before opening WhatsApp.
  const sendCatalogOnWhatsApp = () => {
    if (!selectedBrand) return Alert.alert('Pick a brand', 'Select a brand first.');
    const params = {};
    if (minRate) params.minRate = minRate;
    if (maxRate) params.maxRate = maxRate;
    if (filterFabrics.length === 1) params.fabric = filterFabrics[0];
    const link = getCatalogUrl(selectedBrand.id, params);
    const range = (minRate || maxRate) ? ` (₹${minRate || '0'}–${maxRate || '∞'})` : '';
    setCatalogMsg(`Namaste! 🙏\nHere's our latest *${selectedBrand.name}* saree catalogue${range}:\n${link}\n\nTap the link to view designs & rates. Reply here to place an order.`);
    setMsgModal(true);
  };

  const openWhatsApp = () => {
    setMsgModal(false);
    Linking.openURL(whatsappLink(catalogMsg, selectedContact?.phone));
  };

  const selectBrand = async (brand) => {
    setSelectedBrand(brand);
    setSelectedItem(null);
    setPreview(null);
    const { data } = await itemsApi.getAll(brand.id);
    setItems(data);
  };

  const loadPreview = async (item) => {
    setSelectedItem(item);
    setPreview(null);
    setLoading(true);
    try {
      const { data } = await sendApi.preview(item.id);
      setPreview(data);
    } catch {
      Alert.alert('Error', 'Could not load preview');
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!selectedContact) return Alert.alert('Select contact', 'Please select a recipient');
    setSending(true);
    try {
      const { data } = await sendApi.send(selectedItem.id, selectedContact.phone);
      Alert.alert('Sent!', `${data.sent} designs sent, ${data.skipped} out-of-stock skipped.`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  const inStockDesigns = preview?.designs?.filter(d => d.in_stock !== 0) || [];
  const outOfStockCount = (preview?.designs?.length || 0) - inStockDesigns.length;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'item' && styles.modeBtnActive]}
          onPress={() => setMode('item')}
        >
          <Text style={[styles.modeBtnText, mode === 'item' && styles.modeBtnTextActive]}>By Item</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'filter' && styles.modeBtnActive]}
          onPress={() => setMode('filter')}
        >
          <Text style={[styles.modeBtnText, mode === 'filter' && styles.modeBtnTextActive]}>By Price / Work</Text>
        </TouchableOpacity>
      </View>

      {/* Step 1 — Brand */}
      <View style={styles.section}>
        <Text style={styles.stepLabel}>Step 1</Text>
        <Text style={styles.stepTitle}>Select Brand</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {brands.map(b => (
            <TouchableOpacity
              key={b.id}
              style={[styles.chip, selectedBrand?.id === b.id && styles.chipActive]}
              onPress={() => { mode === 'filter' ? (setSelectedBrand(b), setFilterResults(null)) : selectBrand(b); }}
            >
              <Text style={[styles.chipText, selectedBrand?.id === b.id && styles.chipTextActive]}>{b.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Quick share — always visible once a brand is picked */}
      {selectedBrand && (
        <>
          <TouchableOpacity style={styles.waBtn} onPress={sendCatalogOnWhatsApp}>
            <Text style={styles.waBtnText}>
              {'📲 Send Catalogue on WhatsApp'}
              {(minRate || maxRate) ? ` (₹${minRate || '0'}–${maxRate || '∞'})` : ''}
              {filterFabrics.length === 1 ? ` · ${filterFabrics[0]}` : ''}
              {selectedContact ? `\n→ ${selectedContact.name}` : ''}
            </Text>
          </TouchableOpacity>

          {/* Inline contact picker so users don't need to scroll down */}
          {contacts.length > 0 && (
            <View style={styles.catalogContactRow}>
              <Text style={styles.catalogContactLabel}>To (optional):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {contacts.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.contactChip, selectedContact?.id === c.id && styles.contactChipActive]}
                    onPress={() => setSelectedContact(selectedContact?.id === c.id ? null : c)}
                  >
                    <Text style={[styles.contactChipText, selectedContact?.id === c.id && styles.contactChipTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.brandActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(getCatalogUrl(selectedBrand.id))}>
              <Text style={styles.actionBtnText}>🔗 Open Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDark]} onPress={() => Linking.openURL(getPdfUrl(selectedBrand.id, { inStockOnly: 'true' }))}>
              <Text style={styles.actionBtnText}>📄 PDF</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ───────────── FILTER MODE ───────────── */}
      {mode === 'filter' && selectedBrand && (
        <>
          <View style={styles.section}>
            <Text style={styles.stepLabel}>Step 2</Text>
            <Text style={styles.stepTitle}>Price Range</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, marginBottom: 10 }}>
              {PRICE_PRESETS.map(p => {
                const active = minRate === p.min && maxRate === p.max;
                return (
                  <TouchableOpacity
                    key={p.label}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => { setMinRate(p.min); setMaxRate(p.max); }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>₹{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TextInput
                style={styles.rateInput}
                placeholder="Min ₹"
                placeholderTextColor={colors.textSecondary}
                value={minRate}
                onChangeText={setMinRate}
                keyboardType="numeric"
              />
              <Text style={{ color: colors.textSecondary }}>to</Text>
              <TextInput
                style={styles.rateInput}
                placeholder="Max ₹"
                placeholderTextColor={colors.textSecondary}
                value={maxRate}
                onChangeText={setMaxRate}
                keyboardType="numeric"
              />
              {(minRate || maxRate) ? (
                <TouchableOpacity onPress={() => { setMinRate(''); setMaxRate(''); }}>
                  <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {workCats.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.stepTitle}>Work Category {filterWorkCats.length > 0 ? `(${filterWorkCats.length})` : ''}</Text>
              <View style={styles.wrapChips}>
                {workCats.map(w => {
                  const active = filterWorkCats.includes(w);
                  return (
                    <TouchableOpacity
                      key={w}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setFilterWorkCats(active ? filterWorkCats.filter(x => x !== w) : [...filterWorkCats, w])}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{w}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {fabrics.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.stepTitle}>Fabric Type {filterFabrics.length > 0 ? `(${filterFabrics.length})` : ''}</Text>
              <View style={styles.wrapChips}>
                {fabrics.map(f => {
                  const active = filterFabrics.includes(f);
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => {
                        setFilterFabrics(active ? filterFabrics.filter(x => x !== f) : [...filterFabrics, f]);
                      }}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.applyBtn} onPress={runFilter} disabled={loading}>
            <Text style={styles.applyBtnText}>{loading ? 'Searching…' : '🔍 Find Matching Designs'}</Text>
          </TouchableOpacity>

          {filterResults && (
            <>
              <View style={styles.section}>
                <Text style={styles.stepTitle}>
                  {filterResults.designs.length - excludedIds.size} of {filterResults.count} selected
                </Text>
                {filterResults.count === 0 && (
                  <Text style={styles.emptyNote}>No in-stock designs match these filters.</Text>
                )}
                <Text style={styles.skippedNote2}>Tap a design to exclude it from this send.</Text>
              </View>
              <View style={styles.gridWrap}>
                {filterResults.designs.map(d => {
                  const excluded = excludedIds.has(d.id);
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.gridCard, excluded && styles.gridCardExcluded]}
                      onPress={() => toggleInSet(setExcludedIds, d.id)}
                      activeOpacity={0.8}
                    >
                      {d.photo_path
                        ? <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.gridPhoto} />
                        : <View style={[styles.gridPhoto, styles.noPhoto]}><Text style={{ color: colors.textSecondary, fontSize: 11 }}>No photo</Text></View>
                      }
                      {excluded && <View style={styles.excludeOverlay}><Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>✕</Text></View>}
                      <View style={{ padding: 6 }}>
                        <Text style={styles.gridDesign}>#{d.design_number} · ₹{d.rate}</Text>
                        <Text style={styles.gridSub} numberOfLines={1}>
                          {d.item_name}{d.work_category ? ` · ${d.work_category}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {filterResults.count > 0 && (
                <>
                  <View style={[styles.section, { marginTop: 12 }]}>
                    <Text style={styles.stepLabel}>Final Step</Text>
                    <Text style={styles.stepTitle}>Select Recipient</Text>
                    {contacts.length === 0 && (
                      <Text style={styles.emptyNote}>No contacts yet. Add them in More → Contacts.</Text>
                    )}
                    {contacts.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.contactCard, selectedContact?.id === c.id && styles.contactCardActive]}
                        onPress={() => setSelectedContact(c)}
                      >
                        <View style={[styles.contactAvatar, selectedContact?.id === c.id && { backgroundColor: colors.primary }]}>
                          <Text style={[styles.contactAvatarText, selectedContact?.id === c.id && { color: '#fff' }]}>
                            {String(c.name || '?').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.contactName}>{c.name}</Text>
                          <Text style={styles.contactPhone}>{c.phone} · {c.type}</Text>
                        </View>
                        {selectedContact?.id === c.id && <Text style={{ color: colors.primary, fontSize: 18 }}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.sendBtn, (!selectedContact || sending || (filterResults.designs.length - excludedIds.size) === 0) && styles.sendBtnDisabled]}
                    onPress={sendFiltered}
                    disabled={!selectedContact || sending || (filterResults.designs.length - excludedIds.size) === 0}
                  >
                    <Text style={styles.sendBtnText}>
                      {sending ? 'Sending…' : `📤 Send ${filterResults.designs.length - excludedIds.size} designs via WhatsApp`}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Step 2 — Item */}
      {mode === 'item' && items.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.stepLabel}>Step 2</Text>
          <Text style={styles.stepTitle}>Select Item</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {items.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.chip, selectedItem?.id === item.id && styles.chipActive]}
                onPress={() => loadPreview(item)}
              >
                <Text style={[styles.chipText, selectedItem?.id === item.id && styles.chipTextActive]}>{item.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} size="large" />}

      {/* Step 3 — Preview */}
      {mode === 'item' && preview && (
        <>
          <View style={styles.section}>
            <Text style={styles.stepLabel}>Step 3</Text>
            <Text style={styles.stepTitle}>Preview — {inStockDesigns.length} in stock</Text>
            {outOfStockCount > 0 && (
              <Text style={styles.skippedNote}>{outOfStockCount} design{outOfStockCount !== 1 ? 's' : ''} will be skipped (out of stock)</Text>
            )}
          </View>
          <FlatList
            data={inStockDesigns}
            keyExtractor={d => String(d.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item: d }) => (
              <View style={styles.previewCard}>
                {d.photo_path
                  ? <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.previewPhoto} />
                  : <View style={[styles.previewPhoto, styles.noPhoto]}><Text style={{ color: colors.textSecondary, fontSize: 12 }}>No photo</Text></View>
                }
                <View style={{ padding: 8 }}>
                  <Text style={styles.previewDesign}>Design {d.design_number}</Text>
                  <Text style={styles.previewRate}>₹{d.rate}</Text>
                  {d.fabric_type ? <Text style={styles.previewFabric}>{d.fabric_type}</Text> : null}
                </View>
              </View>
            )}
          />

          {/* Step 4 — Recipient */}
          <View style={[styles.section, { marginTop: 20 }]}>
            <Text style={styles.stepLabel}>Step 4</Text>
            <Text style={styles.stepTitle}>Select Recipient</Text>
            {contacts.length === 0 && (
              <Text style={styles.emptyNote}>No contacts yet. Add them in More → Contacts.</Text>
            )}
            {contacts.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.contactCard, selectedContact?.id === c.id && styles.contactCardActive]}
                onPress={() => setSelectedContact(c)}
              >
                <View style={[styles.contactAvatar, selectedContact?.id === c.id && { backgroundColor: colors.primary }]}>
                  <Text style={[styles.contactAvatarText, selectedContact?.id === c.id && { color: '#fff' }]}>
                    {String(c.name || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{c.name}</Text>
                  <Text style={styles.contactPhone}>{c.phone} · {c.type}</Text>
                </View>
                {selectedContact?.id === c.id && <Text style={{ color: colors.primary, fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, (!selectedContact || sending || inStockDesigns.length === 0) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!selectedContact || sending || inStockDesigns.length === 0}
          >
            <Text style={styles.sendBtnText}>
              {sending ? 'Sending…' : `📤 Send ${inStockDesigns.length} designs via WhatsApp`}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>

    {/* Catalogue message preview/edit modal */}
    <Modal visible={msgModal} transparent animationType="slide" onRequestClose={() => setMsgModal(false)}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={styles.msgOverlay} activeOpacity={1} onPress={() => setMsgModal(false)} />
        <View style={styles.msgSheet}>
          <Text style={styles.msgSheetTitle}>Preview & Edit Message</Text>
          {selectedContact
            ? <Text style={styles.msgSheetTo}>To: {selectedContact.name} · {selectedContact.phone}</Text>
            : <Text style={styles.msgSheetTo}>No contact selected — you'll pick the recipient in WhatsApp</Text>
          }
          <TextInput
            style={styles.msgInput}
            value={catalogMsg}
            onChangeText={setCatalogMsg}
            multiline
            textAlignVertical="top"
            autoFocus
          />
          <View style={styles.msgActions}>
            <TouchableOpacity style={styles.msgCancelBtn} onPress={() => setMsgModal(false)}>
              <Text style={styles.msgCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.msgSendBtn} onPress={openWhatsApp}>
              <Text style={styles.msgSendText}>Open in WhatsApp →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  stepLabel: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  stepTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 },
  chip: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    ...shadow.small,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  waBtn: { backgroundColor: colors.whatsapp, marginHorizontal: 16, marginTop: 12, padding: 15, borderRadius: 14, alignItems: 'center', ...shadow.medium, shadowColor: colors.whatsapp },
  waBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center', lineHeight: 22 },
  catalogContactRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 10, gap: 10 },
  catalogContactLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, flexShrink: 0 },
  contactChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  contactChipActive: { backgroundColor: colors.whatsapp, borderColor: colors.whatsapp },
  contactChipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  contactChipTextActive: { color: '#fff', fontWeight: '700' },
  brandActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 10 },
  actionBtn: { flex: 1, backgroundColor: colors.primary, padding: 12, borderRadius: 12, alignItems: 'center' },
  actionBtnDark: { backgroundColor: colors.primaryDark },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  skippedNote: { fontSize: 13, color: '#E67E22', marginTop: -8, marginBottom: 8 },
  previewCard: { width: 130, backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', ...shadow.small },
  previewPhoto: { width: 130, height: 110 },
  noPhoto: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  previewDesign: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  previewRate: { fontSize: 14, color: colors.primary, fontWeight: '800', marginTop: 2 },
  previewFabric: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  emptyNote: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginVertical: 12 },
  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1.5, borderColor: colors.border,
    ...shadow.small,
  },
  contactCardActive: { borderColor: colors.primary, backgroundColor: '#FDF5F6' },
  contactAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  contactAvatarText: { fontWeight: '800', color: colors.primary, fontSize: 16 },
  contactName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  contactPhone: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  sendBtn: {
    margin: 16, backgroundColor: colors.whatsapp,
    padding: 18, borderRadius: 16, alignItems: 'center',
    ...shadow.medium, shadowColor: colors.whatsapp,
  },
  sendBtnDisabled: { backgroundColor: '#ccc', shadowOpacity: 0 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  modeToggle: { flexDirection: 'row', margin: 16, marginBottom: 0, backgroundColor: colors.card, borderRadius: 14, padding: 4, ...shadow.small },
  modeBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.primary },
  modeBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  modeBtnTextActive: { color: '#fff' },
  rateInput: { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  filterChipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  filterChipTextActive: { color: '#fff', fontWeight: '800' },
  applyBtn: { margin: 16, backgroundColor: colors.primary, padding: 16, borderRadius: 14, alignItems: 'center', ...shadow.medium, shadowColor: colors.primary },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  skippedNote2: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginTop: -6 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 0 },
  gridCard: { width: '46%', margin: '2%', backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden', ...shadow.small },
  gridCardExcluded: { opacity: 0.55 },
  gridPhoto: { width: '100%', height: 120 },
  excludeOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(192,57,43,0.55)', alignItems: 'center', justifyContent: 'center', height: 120 },
  gridDesign: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },
  gridSub: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  msgOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  msgSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  msgSheetTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 },
  msgSheetTo: { fontSize: 13, color: colors.textSecondary, marginBottom: 14 },
  msgInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    padding: 14, fontSize: 15, color: colors.textPrimary,
    backgroundColor: colors.background, minHeight: 150, maxHeight: 240,
    marginBottom: 16,
  },
  msgActions: { flexDirection: 'row', gap: 10 },
  msgCancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  msgCancelText: { fontWeight: '700', color: colors.textSecondary, fontSize: 14 },
  msgSendBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.whatsapp, alignItems: 'center', ...shadow.small, shadowColor: colors.whatsapp },
  msgSendText: { fontWeight: '800', color: '#fff', fontSize: 14 },
});
