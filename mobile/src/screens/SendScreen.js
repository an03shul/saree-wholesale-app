import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image, ScrollView, Linking, TextInput,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { brandsApi, itemsApi, contactsApi, sendApi, fabricsApi, workCategoriesApi, getImageUrl, getThumbUrl, getCatalogUrl, getPdfUrl, whatsappLink } from '../api/client';
import { colors, shadow } from '../constants/theme';
import { shareDesignsList, notify } from '../utils/share';

const PRICE_PRESETS = [
  { label: '300–500', min: '300', max: '500' },
  { label: '400–700', min: '400', max: '700' },
  { label: '500–800', min: '500', max: '800' },
  { label: '800–1200', min: '800', max: '1200' },
  { label: '1200+', min: '1200', max: '' },
];

// Search-based recipient picker. With 1000+ contacts we can't render the whole
// list — show a search box, reveal matches only as the user types, and collapse
// to a compact bar once a contact is picked.
function ContactPicker({ contacts, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const results = q
    ? contacts.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (digits && (c.phone || '').includes(digits))
      ).slice(0, 30)
    : [];

  if (selected) {
    return (
      <View style={styles.pickedBar}>
        <View style={[styles.contactAvatar, { backgroundColor: colors.primary }]}>
          <Text style={[styles.contactAvatarText, { color: '#fff' }]}>{String(selected.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.contactName} numberOfLines={1}>{selected.name}</Text>
          <Text style={styles.contactPhone}>{selected.phone}</Text>
        </View>
        <TouchableOpacity style={styles.changeBtn} onPress={() => onSelect(null)}>
          <Text style={styles.changeBtnText}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        style={styles.contactSearch}
        placeholder="🔍  Search contact by name or number…"
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {q.length === 0 && (
        <Text style={styles.skippedNote2}>Type a name or number to find a contact.</Text>
      )}
      {q.length > 0 && results.length === 0 && (
        <Text style={styles.emptyNote}>No contacts match "{query}".</Text>
      )}
      {results.map(c => (
        <TouchableOpacity key={c.id} style={styles.contactCard} onPress={() => { onSelect(c); setQuery(''); }}>
          <View style={styles.contactAvatar}>
            <Text style={styles.contactAvatarText}>{String(c.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactName} numberOfLines={1}>{c.name}</Text>
            <Text style={styles.contactPhone}>{c.phone} · {c.type}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {results.length === 30 && (
        <Text style={styles.skippedNote2}>Showing first 30 — keep typing to narrow down.</Text>
      )}
    </View>
  );
}

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

  // Filter mode state — multiple brands can be picked at once; each still
  // gets its own separate WhatsApp share (per user's request), but filters
  // (price/fabric/work) are picked once and applied to every selected brand.
  const [filterBrandIds, setFilterBrandIds] = useState(new Set());
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [filterWorkCats, setFilterWorkCats] = useState([]);
  const [filterFabrics, setFilterFabrics] = useState([]);
  const [filterBatches, setFilterBatches] = useState(null); // [{ brand, count, designs }]
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

  const toggleFilterBrand = (id) => {
    setFilterBrandIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setFilterBatches(null);
  };

  const runFilter = async () => {
    if (!filterBrandIds.size) return notify('Select brand', 'Pick at least one brand first');
    setLoading(true);
    setFilterBatches(null);
    setExcludedIds(new Set());
    try {
      const params = { in_stock_only: 'true' };
      if (minRate) params.min_rate = minRate;
      if (maxRate) params.max_rate = maxRate;
      if (filterWorkCats.length) params.work_categories = filterWorkCats.join(',');
      if (filterFabrics.length) params.fabric_types = filterFabrics.join(',');
      const brandList = brands.filter(b => filterBrandIds.has(b.id));
      const results = await Promise.all(brandList.map(b => sendApi.filterBrand(b.id, params)));
      setFilterBatches(results.map((res, idx) => ({ brand: brandList[idx], ...res.data })).filter(batch => batch.count > 0));
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not filter designs');
    } finally {
      setLoading(false);
    }
  };

  // One WhatsApp share per brand batch — staff picks filters once, then taps
  // through a separate share sheet for each brand.
  const sendBatch = async (batch) => {
    const activeDesigns = batch.designs.filter(d => !excludedIds.has(d.id));
    if (!activeDesigns.length) return notify('Nothing to send', `No designs selected for ${batch.brand.name}`);
    setSending(true);
    try {
      const caption = selectedContact
        ? `*${batch.brand.name}* Collection\nFor: ${selectedContact.name}\nReply here to place an order 🙏`
        : `*${batch.brand.name}* Collection\nReply here to place an order 🙏`;

      await shareDesignsList({
        designs: activeDesigns,
        brandName: batch.brand.name,
        caption,
      });
    } finally {
      setSending(false);
    }
  };

  // Show the message preview modal for a single brand; user can edit before opening WhatsApp.
  const sendCatalogOnWhatsApp = (brand) => {
    if (!brand) return notify('Pick a brand', 'Select a brand first.');
    const params = {};
    if (minRate) params.minRate = minRate;
    if (maxRate) params.maxRate = maxRate;
    if (filterFabrics.length === 1) params.fabric = filterFabrics[0];
    const link = getCatalogUrl(brand.id, params);
    const range = (minRate || maxRate) ? ` (₹${minRate || '0'}–${maxRate || '∞'})` : '';
    setCatalogMsg(`Namaste! 🙏\nHere's our latest *${brand.name}* saree catalogue${range}:\n${link}\n\nTap the link to view designs & rates. Reply here to place an order.`);
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
      notify('Error', 'Could not load preview');
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!inStockDesigns.length) return notify('Nothing to send', 'No in-stock designs available');
    setSending(true);
    try {
      const caption = selectedContact
        ? `*${selectedBrand?.name || 'Gopiram Saree'} · ${selectedItem?.name || ''}*\nFor: ${selectedContact.name}\nReply here to place an order 🙏`
        : `*${selectedBrand?.name || 'Gopiram Saree'} · ${selectedItem?.name || ''}*\nReply here to place an order 🙏`;

      await shareDesignsList({
        designs: inStockDesigns,
        brandName: selectedBrand?.name,
        defaultItemName: selectedItem?.name,
        caption,
      });
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
        <Text style={styles.stepTitle}>
          Select Brand{mode === 'filter' && filterBrandIds.size > 0 ? ` (${filterBrandIds.size})` : ''}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {mode === 'filter' && brands.length > 0 && (
            <TouchableOpacity
              style={[styles.chip, filterBrandIds.size === brands.length && styles.chipActive]}
              onPress={() => setFilterBrandIds(filterBrandIds.size === brands.length ? new Set() : new Set(brands.map(b => b.id)))}
            >
              <Text style={[styles.chipText, filterBrandIds.size === brands.length && styles.chipTextActive]}>
                {filterBrandIds.size === brands.length ? 'Clear All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          )}
          {brands.map(b => {
            const active = mode === 'filter' ? filterBrandIds.has(b.id) : selectedBrand?.id === b.id;
            return (
              <TouchableOpacity
                key={b.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => { mode === 'filter' ? toggleFilterBrand(b.id) : selectBrand(b); }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{b.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Quick share — item mode, single brand */}
      {mode === 'item' && selectedBrand && (
        <>
          <TouchableOpacity style={styles.waBtn} onPress={() => sendCatalogOnWhatsApp(selectedBrand)}>
            <Text style={styles.waBtnText}>
              {'📲 Send Catalogue on WhatsApp'}
              {selectedContact ? `\n→ ${selectedContact.name}` : ''}
            </Text>
          </TouchableOpacity>

          {/* Inline contact picker so users don't need to scroll down */}
          {contacts.length > 0 && (
            <View style={styles.catalogContactPicker}>
              <Text style={styles.catalogContactLabel}>To (optional):</Text>
              <ContactPicker contacts={contacts} selected={selectedContact} onSelect={setSelectedContact} />
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

      {/* Quick share — filter mode, one row per selected brand so filters are picked once */}
      {mode === 'filter' && filterBrandIds.size > 0 && (
        <View style={styles.section}>
          <Text style={styles.stepLabel}>Quick Send</Text>
          <Text style={styles.stepTitle}>Catalogue Link per Brand</Text>
          {brands.filter(b => filterBrandIds.has(b.id)).map(b => (
            <View key={b.id} style={styles.quickSendRow}>
              <Text style={styles.quickSendRowName} numberOfLines={1}>{b.name}</Text>
              <TouchableOpacity style={styles.quickSendBtn} onPress={() => sendCatalogOnWhatsApp(b)}>
                <Text style={styles.quickSendBtnText}>📲 Send</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickSendIconBtn} onPress={() => Linking.openURL(getCatalogUrl(b.id, filterFabrics.length === 1 ? { fabric: filterFabrics[0] } : {}))}>
                <Text style={styles.quickSendIconText}>🔗</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickSendIconBtn} onPress={() => Linking.openURL(getPdfUrl(b.id, { inStockOnly: 'true' }))}>
                <Text style={styles.quickSendIconText}>📄</Text>
              </TouchableOpacity>
            </View>
          ))}
          {contacts.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.catalogContactLabel}>To (optional):</Text>
              <ContactPicker contacts={contacts} selected={selectedContact} onSelect={setSelectedContact} />
            </View>
          )}
        </View>
      )}

      {/* ───────────── FILTER MODE ───────────── */}
      {mode === 'filter' && filterBrandIds.size > 0 && (
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
                <TouchableOpacity
                  style={[styles.filterChip, filterWorkCats.length === workCats.length && styles.filterChipActive]}
                  onPress={() => setFilterWorkCats(filterWorkCats.length === workCats.length ? [] : [...workCats])}
                >
                  <Text style={[styles.filterChipText, filterWorkCats.length === workCats.length && styles.filterChipTextActive]}>
                    {filterWorkCats.length === workCats.length ? 'Clear All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
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
                <TouchableOpacity
                  style={[styles.filterChip, filterFabrics.length === fabrics.length && styles.filterChipActive]}
                  onPress={() => setFilterFabrics(filterFabrics.length === fabrics.length ? [] : [...fabrics])}
                >
                  <Text style={[styles.filterChipText, filterFabrics.length === fabrics.length && styles.filterChipTextActive]}>
                    {filterFabrics.length === fabrics.length ? 'Clear All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
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

          {filterBatches && (
            <>
              {filterBatches.length === 0 && (
                <View style={styles.section}>
                  <Text style={styles.emptyNote}>No in-stock designs match these filters in the selected brands.</Text>
                </View>
              )}

              {filterBatches.length > 0 && (
                <View style={[styles.section, { marginTop: 4 }]}>
                  <Text style={styles.stepLabel}>Final Step</Text>
                  <Text style={styles.stepTitle}>Select Recipient</Text>
                  {contacts.length === 0 ? (
                    <Text style={styles.emptyNote}>No contacts yet. Add them in More → Contacts.</Text>
                  ) : (
                    <ContactPicker contacts={contacts} selected={selectedContact} onSelect={setSelectedContact} />
                  )}
                  <Text style={[styles.skippedNote2, { marginTop: 8 }]}>Tap a design below to exclude it from that brand's send.</Text>
                </View>
              )}

              {filterBatches.map(batch => {
                const activeCount = batch.designs.length - batch.designs.filter(d => excludedIds.has(d.id)).length;
                return (
                  <View key={batch.brand.id}>
                    <View style={[styles.section, { paddingTop: 16 }]}>
                      <Text style={styles.stepTitle}>{batch.brand.name} — {activeCount} of {batch.count} selected</Text>
                    </View>
                    <View style={styles.gridWrap}>
                      {batch.designs.map(d => {
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
                    <TouchableOpacity
                      style={[styles.sendBtn, (sending || activeCount === 0) && styles.sendBtnDisabled]}
                      onPress={() => sendBatch(batch)}
                      disabled={sending || activeCount === 0}
                    >
                      <Text style={styles.sendBtnText}>
                        {sending ? 'Preparing Share Sheet…' : `📤 Share ${activeCount} designs via WhatsApp — ${batch.brand.name}`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
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
            {contacts.length === 0 ? (
              <Text style={styles.emptyNote}>No contacts yet. Add them in More → Contacts.</Text>
            ) : (
              <ContactPicker contacts={contacts} selected={selectedContact} onSelect={setSelectedContact} />
            )}
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, (sending || inStockDesigns.length === 0) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={sending || inStockDesigns.length === 0}
          >
            <Text style={styles.sendBtnText}>
              {sending ? 'Preparing Share Sheet…' : `📤 Share ${inStockDesigns.length} designs via WhatsApp`}
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
  catalogContactPicker: { paddingHorizontal: 16, marginTop: 10 },
  catalogContactLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 },
  contactSearch: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary, marginBottom: 8,
  },
  pickedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FDF5F6', borderRadius: 14, padding: 12,
    borderWidth: 1.5, borderColor: colors.primary,
  },
  changeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  changeBtnText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
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
  quickSendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 12, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  quickSendRowName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  quickSendBtn: { backgroundColor: colors.whatsapp, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  quickSendBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  quickSendIconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  quickSendIconText: { fontSize: 13 },
});
