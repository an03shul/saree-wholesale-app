import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, Image, ScrollView, Platform, RefreshControl, Switch, Linking
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-qr-code';
import { designsApi, fabricsApi, workCategoriesApi, sendApi, contactsApi, ordersApi, tallyApi, getImageUrl, getThumbUrl, getWmUrl, whatsappLink, setAuthToken } from '../api/client';
import { useUser } from '../../App';
import { colors, shadow } from '../constants/theme';
import { compressImage } from '../utils/image';

export default function DesignsScreen({ route, navigation }) {
  const { item, brand } = route.params;
  const user = useUser();
  const isAdmin = user?.role === 'admin';

  const [designs, setDesigns] = useState([]);
  const [tallyStock, setTallyStock] = useState({}); // { [design_id]: stock_count }
  const [tallyRefreshing, setTallyRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [fabricOpen, setFabricOpen] = useState(false);
  const [fabricTypes, setFabricTypes] = useState([]);
  const [addFabricVisible, setAddFabricVisible] = useState(false);
  const [newFabricName, setNewFabricName] = useState('');
  const [workCatOpen, setWorkCatOpen] = useState(false);
  const [workCategories, setWorkCategories] = useState([]);
  const [addWorkCatVisible, setAddWorkCatVisible] = useState(false);
  const [newWorkCatName, setNewWorkCatName] = useState('');
  // 'add' | 'edit' — which form the work-cat picker is for
  const [workCatTarget, setWorkCatTarget] = useState('add');
  const [qrDesign, setQrDesign] = useState(null);
  const [form, setForm] = useState({ design_number: '', rate: '', fabric_type: '', pcs_per_set: '', tally_item_name: '', work_category: '' });
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [contacts, setContacts] = useState([]);
  const [cardMenu, setCardMenu] = useState(null); // design whose Edit/Delete menu is open
  const [confirmDel, setConfirmDel] = useState(false); // inline two-tap delete confirm
  const [sending, setSending] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ design_number: '', rate: '', fabric_type: '', pcs_per_set: '', tally_item_name: '', colors: '', work_category: '' });
  const [editPhoto, setEditPhoto] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [orderDesign, setOrderDesign] = useState(null);
  const [orderForm, setOrderForm] = useState({ customer_name: '', customer_phone: '', quantity: '1', note: '' });
  const [orderSaving, setOrderSaving] = useState(false);

  const refreshTallyStock = useCallback(() => {
    if (tallyRefreshing) return;
    setTallyRefreshing(true);
    setTallyStock({});

    const es = tallyApi.stockStream(item.id);

    es.addEventListener('stock', (e) => {
      const { id, stock } = JSON.parse(e.data);
      setTallyStock(prev => ({ ...prev, [id]: stock }));
    });

    es.addEventListener('error', (e) => {
      try {
        const { message } = JSON.parse(e.data);
        Alert.alert('Tally Unavailable', message || 'Could not reach Tally. Make sure Tally is open on the PC.');
      } catch {}
      es.close();
      setTallyRefreshing(false);
    });

    es.addEventListener('done', () => {
      es.close();
      setTallyRefreshing(false);
    });

    // Fallback: close after 30s
    setTimeout(() => { es.close(); setTallyRefreshing(false); }, 30000);
  }, [item.id, tallyRefreshing]);

  useEffect(() => {
    navigation.setOptions({
      title: `${item.name}`,
      headerBackTitle: brand?.name || 'Back',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginRight: 16 }}>
          {isAdmin && (
            <TouchableOpacity onPress={refreshTallyStock} disabled={tallyRefreshing} style={{ alignItems: 'center' }}>
              <Text style={{ color: tallyRefreshing ? 'rgba(255,255,255,0.4)' : '#fff', fontSize: 18 }}>📊</Text>
              {tallyRefreshing && <Text style={{ color: colors.gold, fontSize: 8, fontWeight: '700' }}>LIVE</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => { setSelectMode(m => !m); setSelectedIds(new Set()); }}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>
              {selectMode ? 'Cancel' : 'Select'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.popToTop()}>
            <Text style={{ color: '#fff', fontSize: 20 }}>🏠</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [selectMode, tallyRefreshing]);

  const load = useCallback(async () => {
    try {
      const [designsRes, fabricsRes, workCatsRes, contactsRes] = await Promise.all([
        designsApi.getForItem(item.id),
        fabricsApi.getAll(),
        workCategoriesApi.getAll(),
        contactsApi.getAll(),
      ]);
      setDesigns(designsRes.data);
      setFabricTypes(fabricsRes.data.map(f => f.name));
      setWorkCategories(workCatsRes.data.map(w => w.name));
      setContacts(contactsRes.data);
    } catch {
      Alert.alert('Error', 'Could not load designs');
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  useEffect(() => { load(); }, [load]);

  // Open the Add modal, pre-filling shared details from the most recent design
  // of this item (rate, fabric, pcs, work, Tally name) so only the design number
  // and photo need to be entered each time.
  const openAddModal = () => {
    const last = designs[designs.length - 1];
    setForm({
      design_number: '',
      rate: last ? String(last.rate ?? '') : '',
      fabric_type: last?.fabric_type || '',
      pcs_per_set: last ? String(last.pcs_per_set ?? '') : '',
      tally_item_name: last?.tally_item_name || '',
      work_category: last?.work_category || '',
    });
    setPhoto(null);
    setModalVisible(true);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission needed', 'Allow photo access');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) setPhoto(await compressImage(result.assets[0]));
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission needed', 'Allow camera access');
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) setPhoto(await compressImage(result.assets[0]));
  };

  const savingRef = useRef(false);
  const saveDesign = async () => {
    if (savingRef.current) return; // guard against rapid double-taps creating duplicates
    if (!form.design_number || !form.rate || !form.pcs_per_set) {
      Alert.alert('Required', 'Design number, rate and pcs/set are required');
      return;
    }
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) { Alert.alert('Session expired', 'Please log out and log in again.'); return; }
    setAuthToken(token);
    savingRef.current = true;
    setSaving(true);
    try {
      let payload;
      if (photo) {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
        const res = await fetch(photo.uri);
        const blob = await res.blob();
        fd.append('photo', new File([blob], 'design.jpg', { type: 'image/jpeg' }));
        payload = fd;
      } else {
        payload = { ...form };
      }
      await designsApi.create(item.id, payload);
      setModalVisible(false);
      // Keep the shared details, clear only the per-design fields for the next add
      setForm(f => ({ ...f, design_number: '' }));
      setPhoto(null);
      load();
      Alert.alert('Saved', 'Design added successfully');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message || 'Unknown error');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const addFabric = async () => {
    if (!newFabricName.trim()) return;
    try {
      await fabricsApi.create(newFabricName.trim());
      const { data } = await fabricsApi.getAll();
      setFabricTypes(data.map(f => f.name));
      setForm(f => ({ ...f, fabric_type: newFabricName.trim() }));
      setNewFabricName('');
      setAddFabricVisible(false);
      setFabricOpen(false);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not add fabric');
    }
  };

  const deleteDesign = async (d) => {
    setCardMenu(null);
    setConfirmDel(false);
    try { await designsApi.delete(d.id); load(); }
    catch (e) { Alert.alert('Error', e.response?.data?.error || 'Could not delete'); }
  };

  const openEdit = (d) => {
    setEditTarget(d);
    setEditForm({
      design_number: String(d.design_number),
      rate: String(d.rate),
      fabric_type: d.fabric_type || '',
      pcs_per_set: String(d.pcs_per_set),
      tally_item_name: d.tally_item_name || '',
      colors: d.colors || '',
      work_category: d.work_category || '',
    });
    setEditPhoto(null);
  };

  const saveEdit = async () => {
    if (!editForm.design_number || !editForm.rate || !editForm.pcs_per_set) {
      Alert.alert('Required', 'Design number, rate and pcs/set are required');
      return;
    }
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) { Alert.alert('Session expired', 'Please log in again.'); return; }
    setAuthToken(token);
    setEditSaving(true);
    try {
      let payload;
      if (editPhoto) {
        const fd = new FormData();
        Object.entries(editForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
        const res = await fetch(editPhoto.uri);
        const blob = await res.blob();
        fd.append('photo', new File([blob], 'design.jpg', { type: 'image/jpeg' }));
        payload = fd;
      } else {
        payload = { ...editForm };
      }
      await designsApi.update(editTarget.id, payload);
      setEditTarget(null);
      setEditPhoto(null);
      load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message || 'Could not save');
    } finally {
      setEditSaving(false);
    }
  };

  const buildCaption = (d) =>
    [
      `*${brand.name} · ${item.name}*`,
      `Design #${d.design_number} · ₹${d.rate}` + (d.pcs_per_set ? ` · ${d.pcs_per_set} pcs/set` : ''),
      d.fabric_type || null,
      d.colors || null,
      '\nReply here to place an order 🙏',
    ].filter(Boolean).join('\n');

  // Fetch watermarked image(s) and open native share sheet.
  // Falls back to wa.me link if Web Share API unavailable.
  // Draws brand/item header + two-line footer onto the watermarked image blob.
  const buildShareCard = (blob, d) => new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const HEAD = Math.round(H * 0.09); // header ~9%
      const FOOT = Math.round(H * 0.18); // footer ~18% (two lines)
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H + HEAD + FOOT;
      const ctx = canvas.getContext('2d');

      // Header band
      ctx.fillStyle = '#1A0F0A';
      ctx.fillRect(0, 0, W, HEAD);
      // Image
      ctx.drawImage(img, 0, HEAD, W, H);
      // Footer band
      ctx.fillStyle = '#1A0F0A';
      ctx.fillRect(0, HEAD + H, W, FOOT);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Header: brand · item (small, cream)
      const hfs = Math.max(18, Math.round(HEAD * 0.42));
      ctx.fillStyle = '#E8D5C0';
      ctx.font = `600 ${hfs}px sans-serif`;
      ctx.fillText(`${brand.name}  ·  ${item.name}`, W / 2, HEAD / 2);

      // Footer line 1: #DesignNo · ₹Rate (large, white)
      const f1fs = Math.max(28, Math.round(FOOT * 0.40));
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 ${f1fs}px sans-serif`;
      ctx.fillText(`#${d.design_number}  ·  ₹${d.rate}`, W / 2, HEAD + H + FOOT * 0.33);

      // Footer line 2: pcs · fabric · colors (smaller, light gray)
      const f2fs = Math.max(18, Math.round(FOOT * 0.28));
      const meta = [
        d.pcs_per_set ? `${d.pcs_per_set} pcs` : null,
        d.fabric_type || null,
        d.colors || null,
      ].filter(Boolean).join('  ·  ');
      ctx.fillStyle = '#C0A898';
      ctx.font = `500 ${f2fs}px sans-serif`;
      ctx.fillText(meta, W / 2, HEAD + H + FOOT * 0.72);

      canvas.toBlob(resolve, 'image/jpeg', 0.88);
    };
    img.onerror = reject;
    img.src = objectUrl;
  });

  // Web-safe alert. React Native's Alert.alert is a no-op on web, which was
  // silently swallowing share failures on the staff's Android phone — the user
  // saw "nothing happen". window.alert is visible in the browser/PWA.
  const notify = (title, msg) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(`${title}\n\n${msg}`);
    else Alert.alert(title, msg);
  };

  // Fetch a design's watermarked image and bake the header/footer card onto it.
  const buildShareFile = async (d) => {
    const resp = await fetch(getWmUrl(d.photo_path));
    if (!resp.ok) throw new Error(`image failed to load (${resp.status})`);
    const rawBlob = await resp.blob();
    const cardBlob = await buildShareCard(rawBlob, d);
    return new File([cardBlob], `Design-${d.design_number}.jpg`, { type: 'image/jpeg' });
  };

  // Try the native share sheet. Returns true if it ran (or the user cancelled),
  // false if sharing isn't possible here so the caller can fall back.
  const tryNativeShare = async (files, text) => {
    if (typeof navigator === 'undefined' || !navigator.canShare?.({ files })) return false;
    try {
      await navigator.share(text ? { files, text } : { files });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return true; // user dismissed the sheet — fine
      return false; // activation lost / unsupported → fall back
    }
  };

  // Fallback for web when native sharing fails: save the image(s) to the device
  // so the user can attach them manually.
  const downloadFiles = (files) => {
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  };

  const shareDesign = async (d) => {
    if (!d.photo_path) {
      notify('No photo', 'This design has no photo to share.');
      return;
    }
    setSending(true);
    try {
      const file = await buildShareFile(d);
      const shared = await tryNativeShare([file], buildCaption(d));
      if (!shared && Platform.OS === 'web') {
        downloadFiles([file]);
        notify('Image saved', 'Sharing isn’t available on this browser, so the picture was saved to your phone. Attach it in WhatsApp to send.');
      }
    } catch (e) {
      notify('Could not share', `Please check your connection and try again.\n(${e.message})`);
    } finally {
      setSending(false);
    }
  };

  const shareMultiple = async () => {
    const selected = filteredDesigns.filter(d => selectedIds.has(d.id) && d.photo_path);
    if (!selected.length) {
      notify('No photos', 'None of the selected designs have photos.');
      return;
    }
    setSending(true);
    try {
      const files = await Promise.all(selected.map(buildShareFile));
      const shared = await tryNativeShare(files);
      if (!shared && Platform.OS === 'web') {
        downloadFiles(files);
        notify('Images saved', 'Sharing isn’t available on this browser, so the pictures were saved to your phone. Attach them in WhatsApp to send.');
      }
    } catch (e) {
      notify('Could not share', `Please check your connection and try again.\n(${e.message})`);
    } finally {
      setSending(false);
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  };

  const shareSingle = (d) => shareDesign(d);

  const openOrder = (d) => {
    setOrderDesign(d);
    setOrderForm({ customer_name: '', customer_phone: '', quantity: '1', note: '' });
  };

  const saveOrder = async () => {
    if (!orderForm.customer_name.trim()) { Alert.alert('Required', 'Enter customer name'); return; }
    setOrderSaving(true);
    try {
      await ordersApi.create({
        design_id: orderDesign.id,
        customer_name: orderForm.customer_name.trim(),
        customer_phone: orderForm.customer_phone.trim() || null,
        quantity: parseInt(orderForm.quantity) || 1,
        note: orderForm.note.trim() || null,
        source: 'design_card',
      });
      setOrderDesign(null);
      Alert.alert('Saved', 'Order logged successfully');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save order');
    } finally {
      setOrderSaving(false);
    }
  };

  const onCardLongPress = (d) => {
    if (!isAdmin || selectMode) return;
    setCardMenu(d); // open a web-safe modal menu (Alert can't show 3 buttons on web)
  };

  const toggleDesignStock = async (d) => {
    try {
      const { data } = await designsApi.toggleStock(d.id);
      setDesigns(prev => prev.map(x => x.id === d.id ? { ...x, in_stock: data.in_stock } : x));
    } catch {
      Alert.alert('Error', 'Could not update stock status');
    }
  };

  const filteredDesigns = searchQuery.trim()
    ? designs.filter(d => {
        const q = searchQuery.toLowerCase();
        return (
          d.design_number?.toLowerCase().includes(q) ||
          d.fabric_type?.toLowerCase().includes(q) ||
          d.colors?.toLowerCase().includes(q)
        );
      })
    : designs;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  return (
    <View style={styles.container}>
      {!selectMode && (
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by design no., fabric, color…"
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>
      )}
      <FlatList
        data={filteredDesigns}
        keyExtractor={d => String(d.id)}
        numColumns={2}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={['#c0392b']} tintColor="#c0392b" />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {searchQuery.trim() ? `No designs match "${searchQuery}"` : 'No designs yet. Tap + to add.'}
          </Text>
        }
        renderItem={({ item: d }) => {
          const selected = selectedIds.has(d.id);
          return (
            <TouchableOpacity
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => {
                if (selectMode) {
                  setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                    return next;
                  });
                }
              }}
              onLongPress={() => onCardLongPress(d)}
            >
              <View style={styles.photoContainer}>
                {d.photo_path
                  ? <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.photo} />
                  : <View style={[styles.photo, styles.noPhoto]}><Text style={styles.noPhotoText}>No photo</Text></View>
                }
                <View style={styles.photoHeader}>
                  <Image source={require('../../assets/logo.png')} style={styles.photoHeaderLogo} resizeMode="contain" />
                  <Text style={styles.photoHeaderText} numberOfLines={1}>{brand?.name} · {item.name}</Text>
                </View>
                <View style={styles.photoFooter}>
                  <Text style={styles.photoFooterMain}>#{d.design_number} · ₹{d.rate}</Text>
                  <Text style={styles.photoFooterSub}>
                    {d.pcs_per_set} pcs{d.fabric_type ? ` · ${d.fabric_type}` : ''}{d.work_category ? ` · ${d.work_category}` : ''}
                  </Text>
                </View>
                {selectMode && (
                  <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                    {selected && <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✓</Text>}
                  </View>
                )}
              </View>
              {!selectMode && (
                <View style={styles.cardInfo}>
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnQr]} onPress={() => setQrDesign(d)}>
                      <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>QR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnOrder]} onPress={() => openOrder(d)}>
                      <Text style={styles.actionBtnText}>Order</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnShare]} onPress={() => shareSingle(d)}>
                      <Text style={[styles.actionBtnText, { color: '#fff' }]}>Send</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    {isAdmin ? (
                      <View style={styles.stockToggle}>
                        <Text style={[styles.stockLabel, { color: d.in_stock ? '#2E7D32' : colors.danger }]}>
                          {d.in_stock ? 'In Stock' : 'Out'}
                        </Text>
                        <Switch
                          value={!!d.in_stock}
                          onValueChange={() => toggleDesignStock(d)}
                          trackColor={{ false: '#FFCDD2', true: '#C8E6C9' }}
                          thumbColor={d.in_stock ? '#2E7D32' : colors.danger}
                          ios_backgroundColor="#FFCDD2"
                        />
                      </View>
                    ) : !d.in_stock ? (
                      <View style={[styles.stockBadge, styles.stockOut]}>
                        <Text style={styles.stockText}>Out of Stock</Text>
                      </View>
                    ) : null}
                    {isAdmin && tallyStock[d.id] !== undefined && (
                      <Text style={[styles.tallyStockText, { color: tallyStock[d.id] === 0 ? colors.danger : tallyStock[d.id] === null ? colors.textSecondary : '#2E7D32' }]}>
                        {tallyStock[d.id] === null ? 'No Tally link' : `Tally: ${tallyStock[d.id]} sets`}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {isAdmin && !selectMode && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {selectMode && (
        <View style={styles.shareBar}>
          <Text style={styles.shareBarCount}>
            {selectedIds.size === 0 ? 'Tap designs to select' : `${selectedIds.size} selected`}
          </Text>
          <TouchableOpacity
            style={[styles.shareBtn, (selectedIds.size === 0 || sending) && styles.shareBtnDisabled]}
            disabled={selectedIds.size === 0 || sending}
            onPress={shareMultiple}
          >
            <Text style={styles.shareBtnText}>{sending ? 'Preparing…' : 'Share via WhatsApp'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Design action menu (admin) — web-safe replacement for the 3-button Alert */}
      <Modal visible={!!cardMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.fabricOverlay} activeOpacity={1} onPress={() => { setCardMenu(null); setConfirmDel(false); }}>
          <View style={[styles.fabricSheet, { paddingBottom: 28 }]}>
            <Text style={styles.fabricTitle}>Design {cardMenu?.design_number}</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => { const d = cardMenu; setCardMenu(null); setConfirmDel(false); openEdit(d); }}>
              <Text style={styles.menuItemText}>✏️  Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { confirmDel ? deleteDesign(cardMenu) : setConfirmDel(true); }}>
              <Text style={[styles.menuItemText, { color: colors.danger }]}>
                {confirmDel ? '🗑  Tap again to confirm delete' : '🗑  Delete'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => { setCardMenu(null); setConfirmDel(false); }}>
              <Text style={[styles.menuItemText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>


      {/* Log Order Modal */}
      <Modal visible={!!orderDesign} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.fabricSheet, { padding: 28, paddingBottom: 36 }]}>
            <Text style={styles.modalTitle}>Log Order — Design {orderDesign?.design_number}</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 16, fontSize: 13 }}>
              {item.name}  ·  ₹{orderDesign?.rate}
            </Text>
            <TextInput style={styles.input} placeholder="Customer name *" placeholderTextColor={colors.textSecondary} value={orderForm.customer_name} onChangeText={v => setOrderForm(f => ({ ...f, customer_name: v }))} />
            <TextInput style={styles.input} placeholder="Phone (optional)" placeholderTextColor={colors.textSecondary} value={orderForm.customer_phone} onChangeText={v => setOrderForm(f => ({ ...f, customer_phone: v }))} keyboardType="phone-pad" />
            <TextInput style={styles.input} placeholder="Quantity" placeholderTextColor={colors.textSecondary} value={orderForm.quantity} onChangeText={v => setOrderForm(f => ({ ...f, quantity: v }))} keyboardType="number-pad" />
            <TextInput style={[styles.input, { height: 70 }]} placeholder="Notes (optional)" placeholderTextColor={colors.textSecondary} value={orderForm.note} onChangeText={v => setOrderForm(f => ({ ...f, note: v }))} multiline />
            <View style={styles.row}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setOrderDesign(null)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={saveOrder} disabled={orderSaving}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{orderSaving ? 'Saving...' : 'Save Order'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Design Modal */}
      <Modal visible={!!editTarget} animationType="slide">
        <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} keyboardShouldPersistTaps="always" contentContainerStyle={{ padding: 24 }}>
          <Text style={styles.modalTitle}>Edit Design — {editTarget?.design_number}</Text>

          <TouchableOpacity style={styles.photoBox} onPress={async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') return;
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
            if (!result.canceled) setEditPhoto(await compressImage(result.assets[0]));
          }}>
            {editPhoto
              ? <Image source={{ uri: editPhoto.uri }} style={styles.photoPreview} />
              : editTarget?.photo_path
                ? <Image source={{ uri: getImageUrl(editTarget.photo_path) }} style={styles.photoPreview} />
                : <Text style={styles.photoPlaceholder}>Tap to change photo</Text>
            }
          </TouchableOpacity>

          <Text style={styles.label}>Design Number *</Text>
          <TextInput style={styles.input} value={editForm.design_number} onChangeText={v => setEditForm(f => ({ ...f, design_number: v }))} />

          <Text style={styles.label}>Rate (₹) *</Text>
          <TextInput style={styles.input} value={editForm.rate} onChangeText={v => setEditForm(f => ({ ...f, rate: v }))} keyboardType="numeric" />

          <Text style={styles.label}>Colors</Text>
          <TextInput style={styles.input} placeholder="e.g. Red, Blue" placeholderTextColor={colors.textSecondary} value={editForm.colors} onChangeText={v => setEditForm(f => ({ ...f, colors: v }))} />

          <Text style={styles.label}>Fabric Type</Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setFabricOpen(true)}>
            <Text style={editForm.fabric_type ? styles.dropdownText : styles.dropdownPlaceholder}>
              {editForm.fabric_type || 'Select fabric type'}
            </Text>
            <Text style={styles.dropdownArrow}>▾</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Pcs per Set *</Text>
          <TextInput style={styles.input} value={editForm.pcs_per_set} onChangeText={v => setEditForm(f => ({ ...f, pcs_per_set: v }))} keyboardType="numeric" />

          <Text style={styles.label}>Work Category</Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => { setWorkCatTarget('edit'); setWorkCatOpen(true); }}>
            <Text style={editForm.work_category ? styles.dropdownText : styles.dropdownPlaceholder}>
              {editForm.work_category || 'Select work type'}
            </Text>
            <Text style={styles.dropdownArrow}>▾</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Tally Item Name</Text>
          <TextInput style={styles.input} value={editForm.tally_item_name} onChangeText={v => setEditForm(f => ({ ...f, tally_item_name: v }))} />

          <View style={styles.row}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => { setEditTarget(null); setEditPhoto(null); }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={saveEdit} disabled={editSaving}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{editSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>

      {/* Add Design Modal */}
      <Modal visible={modalVisible} animationType="slide">
        <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} keyboardShouldPersistTaps="always" contentContainerStyle={{ padding: 24 }}>
          <View>
            <Text style={styles.modalTitle}>Add Design — {item.name}</Text>

            <TouchableOpacity style={styles.photoBox} onPress={pickImage}>
              {photo
                ? <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                : <Text style={styles.photoPlaceholder}>Tap to pick photo</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto}>
              <Text style={{ color: '#c0392b' }}>📷 Take photo instead</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Design Number *</Text>
            <TextInput style={styles.input} placeholder="e.g. 1001" value={form.design_number} onChangeText={v => setForm(f => ({ ...f, design_number: v }))} />

            <Text style={styles.label}>Rate (₹) *</Text>
            <TextInput style={styles.input} placeholder="e.g. 850" value={form.rate} onChangeText={v => setForm(f => ({ ...f, rate: v }))} keyboardType="numeric" />

            <Text style={styles.label}>Fabric Type</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setFabricOpen(true)}>
              <Text style={form.fabric_type ? styles.dropdownText : styles.dropdownPlaceholder}>
                {form.fabric_type || 'Select fabric type'}
              </Text>
              <Text style={styles.dropdownArrow}>▾</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Pcs per Set *</Text>
            <TextInput style={styles.input} placeholder="e.g. 6" value={form.pcs_per_set} onChangeText={v => setForm(f => ({ ...f, pcs_per_set: v }))} keyboardType="numeric" />

            <Text style={styles.label}>Work Category</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => { setWorkCatTarget('add'); setWorkCatOpen(true); }}>
              <Text style={form.work_category ? styles.dropdownText : styles.dropdownPlaceholder}>
                {form.work_category || 'Select work type'}
              </Text>
              <Text style={styles.dropdownArrow}>▾</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Tally Item Name</Text>
            <TextInput style={styles.input} placeholder="Exact name in Tally (optional)" value={form.tally_item_name} onChangeText={v => setForm(f => ({ ...f, tally_item_name: v }))} />

            <View style={styles.row}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setModalVisible(false); setPhoto(null); }}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={saveDesign} disabled={saving}>
                <Text style={{ color: '#fff' }}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </Modal>

      {/* QR Code Modal */}
      <Modal visible={!!qrDesign} transparent animationType="fade">
        <TouchableOpacity style={styles.fabricOverlay} activeOpacity={1} onPress={() => setQrDesign(null)}>
          <View style={[styles.fabricSheet, { alignItems: 'center', paddingVertical: 32 }]}>
            <Text style={styles.fabricTitle}>Design {qrDesign?.design_number}</Text>
            <Text style={{ color: '#888', marginBottom: 20, fontSize: 13 }}>{item.name} — ₹{qrDesign?.rate}</Text>
            {qrDesign && (
              <QRCode value={`GOPIRAM:DESIGN:${qrDesign.id}`} size={200} fgColor="#2c1810" bgColor="#ffffff" />
            )}
            <TouchableOpacity
              style={[styles.btnPrimary, { marginTop: 20, paddingHorizontal: 32 }]}
              onPress={() => {
                if (!qrDesign) return;
                const qrValue = `GOPIRAM:DESIGN:${qrDesign.id}`;
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR - Design ${qrDesign.design_number}</title>
                <style>body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff;padding:24px;box-sizing:border-box;}canvas{border-radius:8px;}h2{margin:16px 0 4px;color:#2c1810;font-size:20px;}p{margin:3px 0;color:#666;font-size:14px;}.hint{margin-top:24px;color:#aaa;font-size:12px;text-align:center;}</style>
                <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script></head><body>
                <canvas id="qr"></canvas><h2>Design ${qrDesign.design_number}</h2><p>${item.name}</p><p>₹${qrDesign.rate} · ${qrDesign.pcs_per_set} pcs/set</p>${qrDesign.fabric_type ? `<p>${qrDesign.fabric_type}</p>` : ''}
                <p class="hint" id="hint">Generating QR...</p>
                <script>QRCode.toCanvas(document.getElementById('qr'),'${qrValue}',{width:500,margin:2},function(){const c=document.getElementById('qr');c.toBlob(async function(b){const f=new File([b],'Design-${qrDesign.design_number}.png',{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[f]})){document.getElementById('hint').textContent='Opening share sheet...';try{await navigator.share({files:[f],title:'Design ${qrDesign.design_number} QR Code'});document.getElementById('hint').textContent='Saved!';}catch(e){document.getElementById('hint').textContent='Long-press QR → Save Image';}}else{document.getElementById('hint').textContent='Long-press QR → Save Image';}});});</script>
                </body></html>`;
                window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Save QR</Text>
            </TouchableOpacity>
            <Text style={{ color: '#aaa', marginTop: 12, fontSize: 12 }}>Tap outside to close</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Fabric Picker Modal */}
      <Modal visible={fabricOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.fabricOverlay} activeOpacity={1} onPress={() => setFabricOpen(false)}>
          <View style={styles.fabricSheet}>
            <Text style={styles.fabricTitle}>Select Fabric Type</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={styles.fabricItem} onPress={() => {
                if (editTarget) setEditForm(f => ({ ...f, fabric_type: '' }));
                else setForm(f => ({ ...f, fabric_type: '' }));
                setFabricOpen(false);
              }}>
                <Text style={styles.fabricItemText}>— None —</Text>
              </TouchableOpacity>
              {fabricTypes.map(f => {
                const active = editTarget ? editForm.fabric_type === f : form.fabric_type === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[styles.fabricItem, active && styles.fabricItemActive]}
                    onPress={() => {
                      if (editTarget) setEditForm(fm => ({ ...fm, fabric_type: f }));
                      else setForm(fm => ({ ...fm, fabric_type: f }));
                      setFabricOpen(false);
                    }}
                  >
                    <Text style={[styles.fabricItemText, active && { color: colors.primary, fontWeight: '700' }]}>{f}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* Add new fabric */}
            <TouchableOpacity
              style={styles.addFabricBtn}
              onPress={(e) => { e.stopPropagation?.(); setAddFabricVisible(true); }}
            >
              <Text style={styles.addFabricBtnText}>+ Add New Fabric Type</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Fabric Modal */}
      <Modal visible={addFabricVisible} transparent animationType="fade">
        <View style={[styles.fabricOverlay, { justifyContent: 'center', padding: 32 }]}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24 }}>
            <Text style={styles.fabricTitle}>New Fabric Type</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Khadi"
              value={newFabricName}
              onChangeText={setNewFabricName}
              autoFocus
            />
            <View style={styles.row}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setAddFabricVisible(false); setNewFabricName(''); }}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={addFabric}>
                <Text style={{ color: '#fff' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Work Category Picker */}
      <Modal visible={workCatOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.fabricOverlay} activeOpacity={1} onPress={() => setWorkCatOpen(false)}>
          <View style={styles.fabricSheet}>
            <Text style={styles.fabricTitle}>Select Work Category</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={styles.fabricItem} onPress={() => {
                if (workCatTarget === 'edit') setEditForm(f => ({ ...f, work_category: '' }));
                else setForm(f => ({ ...f, work_category: '' }));
                setWorkCatOpen(false);
              }}>
                <Text style={styles.fabricItemText}>— None —</Text>
              </TouchableOpacity>
              {workCategories.map(w => {
                const active = workCatTarget === 'edit' ? editForm.work_category === w : form.work_category === w;
                return (
                  <TouchableOpacity
                    key={w}
                    style={[styles.fabricItem, active && styles.fabricItemActive]}
                    onPress={() => {
                      if (workCatTarget === 'edit') setEditForm(fm => ({ ...fm, work_category: w }));
                      else setForm(fm => ({ ...fm, work_category: w }));
                      setWorkCatOpen(false);
                    }}
                  >
                    <Text style={[styles.fabricItemText, active && { color: colors.primary, fontWeight: '700' }]}>{w}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.addFabricBtn}
              onPress={(e) => { e.stopPropagation?.(); setAddWorkCatVisible(true); }}
            >
              <Text style={styles.addFabricBtnText}>+ Add New Work Type</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Work Category Modal */}
      <Modal visible={addWorkCatVisible} transparent animationType="fade">
        <View style={[styles.fabricOverlay, { justifyContent: 'center', padding: 32 }]}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24 }}>
            <Text style={styles.fabricTitle}>New Work Type</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Tie + Dye"
              value={newWorkCatName}
              onChangeText={setNewWorkCatName}
              autoFocus
            />
            <View style={styles.row}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setAddWorkCatVisible(false); setNewWorkCatName(''); }}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={async () => {
                if (!newWorkCatName.trim()) return;
                try {
                  await workCategoriesApi.create(newWorkCatName.trim());
                  const { data } = await workCategoriesApi.getAll();
                  setWorkCategories(data.map(w => w.name));
                  if (workCatTarget === 'edit') setEditForm(f => ({ ...f, work_category: newWorkCatName.trim() }));
                  else setForm(f => ({ ...f, work_category: newWorkCatName.trim() }));
                  setNewWorkCatName('');
                  setAddWorkCatVisible(false);
                } catch (e) {
                  Alert.alert('Error', e.response?.data?.error || 'Could not add');
                }
              }}>
                <Text style={{ color: '#fff' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, margin: 12, marginBottom: 0,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
    ...shadow.small,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 4 },
  card: { flex: 1, margin: 5, backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', ...shadow.small },
  photoContainer: { position: 'relative' },
  photo: { width: '100%', height: 170 },
  noPhoto: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { color: colors.textSecondary, fontSize: 13 },
  photoHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(26,10,13,0.55)', paddingHorizontal: 7, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  photoHeaderLogo: { width: 22, height: 22, opacity: 0.9 },
  photoHeaderText: { color: '#fff', fontSize: 9, fontWeight: '600', flex: 1, letterSpacing: 0.2, opacity: 0.9 },
  photoFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(26,10,13,0.68)', paddingHorizontal: 8, paddingVertical: 5,
  },
  photoFooterMain: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.1 },
  photoFooterSub: { color: 'rgba(255,255,255,0.75)', fontSize: 9, marginTop: 1 },
  cardInfo: { padding: 6 },
  cardActions: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  actionBtn: { flex: 1, paddingVertical: 5, borderRadius: 7, alignItems: 'center' },
  actionBtnText: { fontSize: 10, fontWeight: '700', color: colors.gold },
  actionBtnQr: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  actionBtnOrder: { backgroundColor: colors.goldLight, borderWidth: 1, borderColor: colors.gold },
  actionBtnShare: { backgroundColor: colors.whatsapp },
  empty: { textAlign: 'center', marginTop: 60, color: colors.textSecondary, fontSize: 16 },
  fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: colors.primary, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', opacity: 0.82, ...shadow.medium, shadowColor: colors.primary },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 36 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20, color: colors.textPrimary, letterSpacing: 0.2 },
  photoBox: { height: 170, backgroundColor: colors.background, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { color: colors.textSecondary, fontSize: 15 },
  cameraBtn: { alignItems: 'center', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 4, fontSize: 16, color: colors.textPrimary, backgroundColor: colors.background },
  dropdown: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background },
  dropdownText: { fontSize: 16, color: colors.textPrimary },
  dropdownPlaceholder: { fontSize: 16, color: colors.textSecondary },
  dropdownArrow: { color: colors.textSecondary, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16, marginBottom: 40 },
  btnPrimary: { backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  btnSecondary: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border },
  fabricOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  fabricSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '75%' },
  fabricTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14, color: colors.textPrimary, letterSpacing: 0.2 },
  fabricItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border },
  fabricItemActive: { backgroundColor: '#FDF5F6' },
  fabricItemText: { fontSize: 16, color: colors.textPrimary },
  addFabricBtn: { paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
  addFabricBtnText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  cardSelected: { borderWidth: 2.5, borderColor: colors.whatsapp },
  checkCircle: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkCircleSelected: { backgroundColor: colors.whatsapp, borderColor: colors.whatsapp },
  shareBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.card, paddingHorizontal: 20, paddingVertical: 14,
    paddingBottom: 28, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
    ...shadow.medium,
  },
  shareBarCount: { flex: 1, color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  shareBtn: { backgroundColor: colors.whatsapp, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12 },
  shareBtnDisabled: { backgroundColor: '#ccc', opacity: 0.6 },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  menuItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuItemText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  contactRow: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  contactName: { fontWeight: '700', color: colors.textPrimary, fontSize: 16 },
  contactPhone: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
  stockToggle: { alignItems: 'center', gap: 2 },
  stockLabel: { fontSize: 10, fontWeight: '700' },
  tallyStockText: { fontSize: 9, fontWeight: '700' },
  stockBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: '#FEE9E9' },
  stockOut: { backgroundColor: '#FEE9E9' },
  stockText: { fontSize: 11, fontWeight: '700', color: colors.danger },
});
