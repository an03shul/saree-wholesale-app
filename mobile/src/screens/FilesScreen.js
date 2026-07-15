import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Modal, ActivityIndicator, RefreshControl, Platform, Linking, Image,
} from 'react-native';
import { filesApi, brandsApi, getFileDownloadUrl } from '../api/client';
import { pickFile } from '../utils/pickFile';
import { confirmAction, notify } from '../utils/share';
import { parseServerDate } from '../utils/date';
import { colors, shadow, modalBase } from '../constants/theme';

// Reusable doc list: filters files to `types`, tap to view (image) or download (PDF), optional upload.
// Used for accountant discounts (upload) and read-only invoice/order-form views.
//   props: { types:[...], canUpload, uploadType, uploadTypes:[...], allowBrandTag, canRename, canDelete, emptyText }
export default function FilesScreen({ types, canUpload, uploadType, uploadTypes, allowBrandTag, canRename, canDelete, emptyText }) {
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
    const p = await pickFile();
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

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  return (
    <View style={styles.container}>
      <FlatList
        data={files}
        keyExtractor={f => String(f.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>🧾</Text>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySub}>{emptyText || 'No documents'}</Text>
          </View>
        }
        renderItem={({ item: f }) => (
          // Images open in an in-app viewer; PDFs still open/download in the
          // browser (Content-Disposition download looked like "nothing happened"
          // for pictures on the installed PWA).
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => (/\.pdf$/i.test(f.path) ? open(f.id) : setViewing(f))}>
            <Text style={styles.fileIcon}>{/\.pdf$/i.test(f.path) ? '📄' : '🖼️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.label} numberOfLines={1}>{f.label || f.type}</Text>
              <Text style={styles.sub}>{f.type}{f.brand_name ? ` · ${f.brand_name}` : ''} · {fmt(f.created_at)}</Text>
            </View>
            {canRename && (
              <TouchableOpacity style={styles.action} onPress={() => { setRenaming(f); setRenameLabel(f.label || ''); }}>
                <Text style={{ fontSize: 16 }}>✏️</Text>
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity style={styles.action} onPress={() => doDelete(f)}>
                <Text style={{ fontSize: 16 }}>🗑️</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.action} onPress={() => open(f.id)}>
              <Text style={styles.download}>⬇</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
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
                <Text style={styles.pickLabel}>Manufacturer / brand (optional)</Text>
                <View style={styles.chips}>
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
