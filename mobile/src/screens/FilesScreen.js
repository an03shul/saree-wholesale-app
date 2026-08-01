import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, SectionList, TouchableOpacity, TextInput, StyleSheet,
  Modal, ActivityIndicator, RefreshControl, Platform, Linking, Image,
} from 'react-native';
import { filesApi, brandsApi, getFileDownloadUrl } from '../api/client';
import { useUser } from '../../App';
import { pickFile } from '../utils/pickFile';
import { confirmAction, notify } from '../utils/share';
import { parseServerDate } from '../utils/date';
import { colors, shadow, modalBase } from '../constants/theme';

// Reusable doc list: filters files to `types`, tap to view (image) or download (PDF), optional upload.
// Used for accountant discounts (upload) and read-only invoice/order-form views.
//   props: { types:[...], canUpload, uploadType, uploadTypes:[...], allowBrandTag, canRename, canDelete, emptyText }
//   canDelete: true = every row (admin), 'own' = only rows the current user uploaded (accountant)
export default function FilesScreen({ types, canUpload, uploadType, uploadTypes, allowBrandTag, canRename, canDelete, emptyText }) {
  const user = useUser();
  const [upType, setUpType] = useState(uploadType || (uploadTypes && uploadTypes[0]) || types[0]);
  const [files, setFiles] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [picked, setPicked] = useState(null);
  const [label, setLabel] = useState('');
  const [brandId, setBrandId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(null); // file being renamed
  const [renameLabel, setRenameLabel] = useState('');
  const [viewing, setViewing] = useState(null); // image file shown full-screen
  const [assigning, setAssigning] = useState(null); // file being transferred to a company

  const load = useCallback(async () => {
    try {
      const { data } = await filesApi.list();
      setFiles(data.filter(f => types.includes(f.type)));
      if (allowBrandTag && brands.length === 0) brandsApi.getAll().then(({ data }) => setBrands(data)).catch(() => {});
    } catch { notify('Error', 'Could not load documents'); }
    finally { setLoading(false); }
  }, [types, allowBrandTag, brands.length]);

  useEffect(() => { load(); }, [load]);

  const startUpload = async () => {
    // '*/*' so iOS surfaces the Files picker (PDFs), not just Photo Library.
    const p = await pickFile('*/*');
    if (!p) return;
    setPicked(p); setLabel(p.name || ''); setBrandId(null); setModal(true);
  };

  const doUpload = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('type', upType);
      if (label.trim()) fd.append('label', label.trim());
      if (brandId) fd.append('brand_id', String(brandId));
      fd.append('file', picked.file);
      await filesApi.upload(fd);
      setModal(false); setPicked(null);
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Upload failed');
    } finally { setSaving(false); }
  };

  const doRename = async () => {
    if (!renameLabel.trim()) return;
    setSaving(true);
    try {
      await filesApi.rename(renaming.id, renameLabel.trim());
      setRenaming(null);
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Rename failed');
    } finally { setSaving(false); }
  };

  // Transfer a file to a company (or to Others when brand_id is null).
  const doAssign = async (brand_id) => {
    const f = assigning;
    setAssigning(null);
    try { await filesApi.assignBrand(f.id, brand_id); load(); }
    catch (e) { notify('Error', e.response?.data?.error || 'Could not move'); }
  };

  // When company-tagging is on, group files into per-company sections with an
  // "Others" section for anything the admin hasn't assigned yet.
  const sections = useMemo(() => {
    if (!allowBrandTag) return null;
    const byBrand = new Map();
    const others = [];
    for (const f of files) {
      if (f.brand_id == null) { others.push(f); continue; }
      if (!byBrand.has(f.brand_id)) byBrand.set(f.brand_id, { title: f.brand_name || 'Company', brand_id: f.brand_id, data: [] });
      byBrand.get(f.brand_id).data.push(f);
    }
    const list = [...byBrand.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (others.length) list.push({ title: 'Others', brand_id: null, data: others });
    return list;
  }, [files, allowBrandTag]);

  const doDelete = (f) => {
    confirmAction('Delete', `Delete "${f.label || f.type}"?`, async () => {
      try { await filesApi.delete(f.id); load(); }
      catch (e) { notify('Error', e.response?.data?.error || 'Delete failed'); }
    }, 'Delete');
  };

  const open = (id) => {
    const url = getFileDownloadUrl(id);
    if (Platform.OS === 'web') window.open(url, '_blank');
    else Linking.openURL(url);
  };

  const fmt = (dt) => parseServerDate(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const renderRow = (f) => (
    // Images open in an in-app viewer; PDFs open/download in the browser.
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => (/\.pdf$/i.test(f.path) ? open(f.id) : setViewing(f))}>
      <Text style={styles.fileIcon}>{/\.pdf$/i.test(f.path) ? '📄' : '🖼️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.label} numberOfLines={1}>{f.label || f.type}</Text>
        <Text style={styles.sub}>{f.type}{allowBrandTag ? ` · ${f.brand_name || 'Others'}` : (f.brand_name ? ` · ${f.brand_name}` : '')} · {fmt(f.created_at)}</Text>
      </View>
      {allowBrandTag && (
        <TouchableOpacity style={styles.action} onPress={() => setAssigning(f)}>
          <Text style={{ fontSize: 16 }}>🏢</Text>
        </TouchableOpacity>
      )}
      {canRename && (
        <TouchableOpacity style={styles.action} onPress={() => { setRenaming(f); setRenameLabel(f.label || ''); }}>
          <Text style={{ fontSize: 16 }}>✏️</Text>
        </TouchableOpacity>
      )}
      {(canDelete === true || (canDelete === 'own' && f.uploaded_by === user?.id)) && (
        <TouchableOpacity style={styles.action} onPress={() => doDelete(f)}>
          <Text style={{ fontSize: 16 }}>🗑️</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.action} onPress={() => open(f.id)}>
        <Text style={styles.download}>⬇</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const emptyBlock = (
    <View style={styles.empty}>
      <Text style={{ fontSize: 44, marginBottom: 12 }}>🧾</Text>
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.emptySub}>{emptyText || 'No documents'}</Text>
    </View>
  );
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  return (
    <View style={styles.container}>
      {allowBrandTag ? (
        <SectionList
          sections={sections}
          keyExtractor={f => String(f.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={refresh}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={emptyBlock}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, section.brand_id == null && { color: colors.textSecondary }]}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item: f }) => renderRow(f)}
        />
      ) : (
        <FlatList
          data={files}
          keyExtractor={f => String(f.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={refresh}
          ListEmptyComponent={emptyBlock}
          renderItem={({ item: f }) => renderRow(f)}
        />
      )}
      {canUpload && (
        <TouchableOpacity style={styles.fab} onPress={startUpload}><Text style={styles.fabText}>+</Text></TouchableOpacity>
      )}

      <Modal visible={modal} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>Upload</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 12 }} numberOfLines={1}>📎 {picked?.name}</Text>
            {uploadTypes && (
              <View style={styles.chips}>
                {uploadTypes.map(t => (
                  <TouchableOpacity key={t} style={[styles.chip, upType === t && styles.chipOn]} onPress={() => setUpType(t)}>
                    <Text style={[styles.chipText, upType === t && styles.chipTextOn]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput style={modalBase.input} placeholder="Label (optional)" placeholderTextColor={colors.textSecondary} value={label} onChangeText={setLabel} />
            {allowBrandTag && (
              <>
                <Text style={styles.pickLabel}>Company — leave as Others if not assigned yet</Text>
                <View style={styles.chips}>
                  <TouchableOpacity style={[styles.chip, brandId == null && styles.chipOn]} onPress={() => setBrandId(null)}>
                    <Text style={[styles.chipText, brandId == null && styles.chipTextOn]}>{brandId == null ? '✓ ' : ''}Others</Text>
                  </TouchableOpacity>
                  {brands.map(b => (
                    <TouchableOpacity key={b.id} style={[styles.chip, brandId === b.id && styles.chipOn]} onPress={() => setBrandId(brandId === b.id ? null : b.id)}>
                      <Text style={[styles.chipText, brandId === b.id && styles.chipTextOn]}>{brandId === b.id ? '✓ ' : ''}{b.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={modalBase.row}>
              <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setModal(false)}><Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={modalBase.btnPrimary} onPress={doUpload} disabled={saving}><Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Uploading…' : 'Upload'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing && (
            <Image source={{ uri: getFileDownloadUrl(viewing.id) }} style={{ flex: 1 }} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewing(null)}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.viewerLabel} numberOfLines={1}>{viewing?.label || viewing?.type}</Text>
        </View>
      </Modal>

      <Modal visible={!!renaming} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>Rename</Text>
            <TextInput style={modalBase.input} placeholder="Label" placeholderTextColor={colors.textSecondary} value={renameLabel} onChangeText={setRenameLabel} autoFocus />
            <View style={modalBase.row}>
              <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setRenaming(null)}><Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={modalBase.btnPrimary} onPress={doRename} disabled={saving}><Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transfer a file to a company (or move it to Others) */}
      <Modal visible={!!assigning} transparent animationType="slide" onRequestClose={() => setAssigning(null)}>
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>Move to company</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 12 }} numberOfLines={1}>📎 {assigning?.label || assigning?.type}</Text>
            <View style={styles.chips}>
              <TouchableOpacity style={[styles.chip, assigning?.brand_id == null && styles.chipOn]} onPress={() => doAssign(null)}>
                <Text style={[styles.chipText, assigning?.brand_id == null && styles.chipTextOn]}>Others</Text>
              </TouchableOpacity>
              {brands.map(b => (
                <TouchableOpacity key={b.id} style={[styles.chip, assigning?.brand_id === b.id && styles.chipOn]} onPress={() => doAssign(b.id)}>
                  <Text style={[styles.chipText, assigning?.brand_id === b.id && styles.chipTextOn]}>{b.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setAssigning(null)}><Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, ...shadow.small },
  fileIcon: { fontSize: 26 },
  label: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  download: { fontSize: 20, color: colors.primary },
  action: { padding: 6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  sectionCount: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, backgroundColor: colors.card, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerClose: { position: 'absolute', top: 40, right: 20, padding: 10 },
  viewerLabel: { position: 'absolute', bottom: 30, alignSelf: 'center', color: '#fff', fontSize: 14, maxWidth: '80%', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, overflow: 'hidden' },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: colors.primary, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', opacity: 0.9, ...shadow.medium },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 36 },
  pickLabel: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  chipTextOn: { color: '#fff' },
});
