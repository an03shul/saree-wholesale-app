import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Alert,
  ActivityIndicator, ScrollView, Image, Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { brandsApi, itemsApi, importApi, getImageUrl, getThumbUrl, setAuthToken } from '../api/client';
import { colors, shadow } from '../constants/theme';
import { compressImage } from '../utils/image';
import { notify } from '../utils/share';

export default function BulkImportScreen({ navigation }) {
  const [step, setStep] = useState('pick'); // 'pick' | 'review'
  const [brands, setBrands] = useState([]);
  const [items, setItems] = useState([]);
  const [brand, setBrand] = useState(null);
  const [item, setItem] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [batchRate, setBatchRate] = useState('');
  const [batchPcs, setBatchPcs] = useState('');
  const [saving, setSaving] = useState(false);

  // Single-piece Quick mode: 1 pc each, shared details, auto-sequential numbers, no OCR.
  const [quickMode, setQuickMode] = useState(false);
  const [startNumber, setStartNumber] = useState('');
  const [batchFabric, setBatchFabric] = useState('');
  const [batchWork, setBatchWork] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: 'Bulk Add Designs' });
    brandsApi.getAll().then(r => setBrands(r.data)).catch(() => {});
  }, []);

  const selectBrand = async (b) => {
    setBrand(b); setItem(null);
    const { data } = await itemsApi.getAll(b.id);
    setItems(data);
  };

  const pickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return notify('Permission needed', 'Allow photo access');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 50,
    });
    if (!result.canceled) {
      const compressed = await Promise.all((result.assets || []).map(compressImage));
      setPhotos(compressed);
    }
  };

  const analyze = async () => {
    if (!item) return notify('Pick an item', 'Choose the brand and item first.');
    if (!photos.length) return notify('Pick photos', 'Select up to 20 design photos.');
    const token = await AsyncStorage.getItem('auth_token');
    if (token) setAuthToken(token);
    setAnalyzing(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < photos.length; i++) {
        const res = await fetch(photos[i].uri);
        const blob = await res.blob();
        fd.append('photos', new File([blob], `photo_${i}.jpg`, { type: 'image/jpeg' }));
      }
      const { data } = await importApi.analyze(fd);
      const withDefaults = data.drafts.map(d => ({
        ...d,
        rate: batchRate || '',
        pcs_per_set: batchPcs || '',
      }));
      setDrafts(withDefaults);
      setStep('review');
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Could not read photos';
      notify('Error', msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const updateDraft = (idx, field, value) => {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const applyBatch = (field, value) => {
    setDrafts(prev => prev.map(d => ({ ...d, [field]: value })));
  };

  const savingRef = useRef(false);
  const save = async () => {
    if (savingRef.current) return; // guard against rapid double-taps creating duplicates
    const ready = drafts.filter(d => d.design_number && d.rate !== '' && d.rate != null);
    if (!ready.length) return notify('Nothing ready', 'Each design needs a design number and a rate.');
    savingRef.current = true;
    setSaving(true);
    try {
      const { data } = await importApi.save(item.id, drafts);
      notify(
        'Saved',
        `${data.saved} design${data.saved !== 1 ? 's' : ''} added.` +
        (data.skipped?.length ? `\n${data.skipped.length} skipped (missing number/rate or duplicate).` : ''),
        [{ text: 'OK', onPress: () => { setStep('pick'); setPhotos([]); setDrafts([]); } }]
      );
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not save');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // Single-piece Quick mode: upload all photos, auto-number sequentially, copy
  // shared details to every design, and save in one go (no OCR, no review).
  const quickSave = async () => {
    if (savingRef.current) return;
    if (!item) return notify('Pick an item', 'Choose the brand and item first.');
    if (!photos.length) return notify('Pick photos', 'Select the design photos.');
    if (!startNumber.trim()) return notify('Starting number', 'Enter the design number to start from (e.g. 1001).');
    const start = parseInt(startNumber, 10);
    if (isNaN(start)) return notify('Starting number', 'Starting design number must be a number.');
    if (batchRate === '' || batchRate == null) return notify('Rate', 'Enter the rate that applies to all pieces.');

    const token = await AsyncStorage.getItem('auth_token');
    if (token) setAuthToken(token);
    savingRef.current = true;
    setSaving(true);
    try {
      // 1. Upload the photos (skip OCR — fast).
      const fd = new FormData();
      fd.append('skip_ocr', 'true');
      for (let i = 0; i < photos.length; i++) {
        const res = await fetch(photos[i].uri);
        const blob = await res.blob();
        fd.append('photos', new File([blob], `photo_${i}.jpg`, { type: 'image/jpeg' }));
      }
      const { data } = await importApi.analyze(fd);
      // 2. Assign sequential numbers (in selection order) + shared details.
      const designs = data.drafts.map((d, i) => ({
        photo_path: d.photo_path,
        design_number: String(start + i),
        rate: batchRate,
        pcs_per_set: '1',
        fabric_type: batchFabric || null,
        work_category: batchWork || null,
        colors: null,
      }));
      // 3. Save all at once.
      const { data: result } = await importApi.save(item.id, designs);
      const last = start + designs.length - 1;
      notify(
        'Saved',
        `${result.saved} design${result.saved !== 1 ? 's' : ''} added (#${start}–#${last}, 1 pc each).` +
        (result.skipped?.length ? `\n${result.skipped.length} skipped (design number already exists).` : ''),
        [{ text: 'OK', onPress: () => { setPhotos([]); setStartNumber(''); } }]
      );
    } catch (e) {
      notify('Error', e.response?.data?.error || e.message || 'Could not save');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // ---------- STEP 1: pick brand/item + photos ----------
  if (step === 'pick') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>⚡ How it works</Text>
          <Text style={styles.infoText}>
            Pick a brand & item, upload up to 50 photos, and it reads the design number off each
            tag automatically. Then add rates (and fabric/work if you like) and save them all at once.
          </Text>
        </View>

        <View style={styles.quickToggleCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.quickToggleTitle}>Single-piece Quick mode</Text>
            <Text style={styles.quickToggleSub}>
              For items where every design is 1 saree. Set the details once, auto-number the
              photos, and save in one tap — no per-photo review.
            </Text>
          </View>
          <Switch
            value={quickMode}
            onValueChange={setQuickMode}
            trackColor={{ false: colors.border, true: colors.gold }}
            thumbColor={quickMode ? colors.primary : '#f4f3f4'}
          />
        </View>

        <Text style={styles.label}>1. Brand</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {brands.map(b => (
            <TouchableOpacity key={b.id} style={[styles.chip, brand?.id === b.id && styles.chipActive]} onPress={() => selectBrand(b)}>
              <Text style={[styles.chipText, brand?.id === b.id && styles.chipTextActive]}>{b.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {items.length > 0 && (
          <>
            <Text style={styles.label}>2. Item</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {items.map(it => (
                <TouchableOpacity key={it.id} style={[styles.chip, item?.id === it.id && styles.chipActive]} onPress={() => setItem(it)}>
                  <Text style={[styles.chipText, item?.id === it.id && styles.chipTextActive]}>{it.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={styles.label}>{quickMode ? '3.' : '3.'} Photos {photos.length > 0 ? `(${photos.length} selected)` : ''}</Text>
        <TouchableOpacity style={styles.pickBtn} onPress={pickPhotos}>
          <Text style={styles.pickBtnText}>{photos.length ? '🖼 Change Photos' : '🖼 Select Photos (up to 50)'}</Text>
        </TouchableOpacity>
        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
            {photos.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={styles.thumb} />)}
          </ScrollView>
        )}

        {quickMode ? (
          <>
            <Text style={styles.label}>Details for all designs (1 pc each)</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Start design # *" placeholderTextColor={colors.textSecondary} value={startNumber} onChangeText={setStartNumber} keyboardType="numeric" />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Rate ₹ *" placeholderTextColor={colors.textSecondary} value={batchRate} onChangeText={setBatchRate} keyboardType="numeric" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Fabric (optional)" placeholderTextColor={colors.textSecondary} value={batchFabric} onChangeText={setBatchFabric} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Work (optional)" placeholderTextColor={colors.textSecondary} value={batchWork} onChangeText={setBatchWork} />
            </View>
            {startNumber.trim() && photos.length > 0 && !isNaN(parseInt(startNumber, 10)) && (
              <Text style={styles.quickPreview}>
                Will create #{parseInt(startNumber, 10)}–#{parseInt(startNumber, 10) + photos.length - 1} · 1 pc each · ₹{batchRate || '—'}
              </Text>
            )}
            <TouchableOpacity style={[styles.primaryBtn, (saving || !item || !photos.length) && styles.btnDisabled]} onPress={quickSave} disabled={saving || !item || !photos.length}>
              {saving
                ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator color="#fff" /><Text style={styles.primaryBtnText}>Uploading & saving {photos.length}…</Text></View>
                : <Text style={styles.primaryBtnText}>⚡ Upload & Save {photos.length || ''} Designs</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Optional defaults (applied to all)</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Rate ₹ for all" placeholderTextColor={colors.textSecondary} value={batchRate} onChangeText={setBatchRate} keyboardType="numeric" />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Pcs/set for all" placeholderTextColor={colors.textSecondary} value={batchPcs} onChangeText={setBatchPcs} keyboardType="numeric" />
            </View>

            <TouchableOpacity style={[styles.primaryBtn, (analyzing || !item || !photos.length) && styles.btnDisabled]} onPress={analyze} disabled={analyzing || !item || !photos.length}>
              {analyzing
                ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator color="#fff" /><Text style={styles.primaryBtnText}>Reading {photos.length} photos…</Text></View>
                : <Text style={styles.primaryBtnText}>⚡ Read Design Numbers</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  // ---------- STEP 2: review drafts ----------
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewTitle}>Review {drafts.length} designs</Text>
        <Text style={styles.reviewSub}>{brand?.name} · {item?.name} — fix anything, add rates, then save.</Text>
      </View>

      <View style={styles.batchRow}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Set rate for all" placeholderTextColor={colors.textSecondary} value={batchRate} onChangeText={setBatchRate} keyboardType="numeric" />
        <TouchableOpacity style={styles.applyBtn} onPress={() => applyBatch('rate', batchRate)}><Text style={styles.applyBtnText}>Apply ₹</Text></TouchableOpacity>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Pcs all" placeholderTextColor={colors.textSecondary} value={batchPcs} onChangeText={setBatchPcs} keyboardType="numeric" />
        <TouchableOpacity style={styles.applyBtn} onPress={() => applyBatch('pcs_per_set', batchPcs)}><Text style={styles.applyBtnText}>Apply</Text></TouchableOpacity>
      </View>

      {drafts.map((d, idx) => (
        <View key={idx} style={styles.draftCard}>
          <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.draftPhoto} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TextInput style={[styles.dInput, { flex: 1.2 }, !d.design_number && styles.dInputWarn]} placeholder="Design no.*" placeholderTextColor={colors.danger} value={d.design_number || ''} onChangeText={v => updateDraft(idx, 'design_number', v)} />
              <TextInput style={[styles.dInput, { flex: 1 }, (d.rate === '' || d.rate == null) && styles.dInputWarn]} placeholder="Rate ₹*" placeholderTextColor={colors.danger} value={String(d.rate ?? '')} onChangeText={v => updateDraft(idx, 'rate', v)} keyboardType="numeric" />
              <TextInput style={[styles.dInput, { flex: 0.8 }]} placeholder="Pcs" placeholderTextColor={colors.textSecondary} value={String(d.pcs_per_set ?? '')} onChangeText={v => updateDraft(idx, 'pcs_per_set', v)} keyboardType="numeric" />
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TextInput style={[styles.dInput, { flex: 1 }]} placeholder="Fabric" placeholderTextColor={colors.textSecondary} value={d.fabric_type || ''} onChangeText={v => updateDraft(idx, 'fabric_type', v)} />
              <TextInput style={[styles.dInput, { flex: 1 }]} placeholder="Work" placeholderTextColor={colors.textSecondary} value={d.work_category || ''} onChangeText={v => updateDraft(idx, 'work_category', v)} />
            </View>
            <TextInput style={styles.dInput} placeholder="Colours" placeholderTextColor={colors.textSecondary} value={d.colors || ''} onChangeText={v => updateDraft(idx, 'colors', v)} />
            {!d.design_number && (
              <Text style={styles.warnText}>⚠ Couldn't read a number — type it in</Text>
            )}
          </View>
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('pick')}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primaryBtn, { flex: 2, marginTop: 0 }, saving && styles.btnDisabled]} onPress={save} disabled={saving}>
          <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : `Save ${drafts.length} Designs`}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  infoCard: { backgroundColor: colors.goldLight, borderRadius: 14, padding: 14, marginBottom: 16 },
  infoTitle: { fontSize: 14, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  infoText: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  quickToggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: colors.gold, ...shadow.small },
  quickToggleTitle: { fontSize: 15, fontWeight: '800', color: colors.primary },
  quickToggleSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 17 },
  quickPreview: { fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 12, textAlign: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 6 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, ...shadow.small },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  pickBtn: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.gold, borderRadius: 12, padding: 14, alignItems: 'center' },
  pickBtnText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  thumb: { width: 70, height: 70, borderRadius: 8 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.card },
  primaryBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 20, ...shadow.medium, shadowColor: colors.primary },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryBtn: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border },
  secondaryBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  reviewHeader: { marginBottom: 12 },
  reviewTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  reviewSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  batchRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 14 },
  applyBtn: { backgroundColor: colors.gold, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 10 },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  draftCard: { flexDirection: 'row', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 10, marginBottom: 10, ...shadow.small },
  draftPhoto: { width: 84, height: 84, borderRadius: 10 },
  dInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.textPrimary, backgroundColor: colors.background },
  dInputWarn: { borderColor: colors.danger },
  warnText: { fontSize: 11, color: colors.danger, fontWeight: '600' },
});
