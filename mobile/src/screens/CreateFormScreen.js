import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, Image, Modal, ActivityIndicator, ScrollView,
  Linking, Clipboard, Platform
} from 'react-native';
import { CameraView } from 'expo-camera';
import { designsApi, contactsApi, ordersApi, getThumbUrl, getCustomCatalogUrl, whatsappLink } from '../api/client';
import { notify, confirmAction } from '../utils/share';
import { colors, shadow } from '../constants/theme';

const QR_PREFIX = 'GOPIRAM:DESIGN:';

export default function CreateFormScreen() {
  const [selectedDesigns, setSelectedDesigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [camPermission, setCamPermission] = useState('idle'); // idle | requesting | active | denied | error
  const [scannedFeedback, setScannedFeedback] = useState('');

  // Customer details inquiry state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [saveToInquiries, setSaveToInquiries] = useState(true);
  const [inquiryModalVisible, setInquiryModalVisible] = useState(false);
  const [savingInquiry, setSavingInquiry] = useState(false);

  // Results sharing modal state
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');

  // Load contacts
  useEffect(() => {
    contactsApi.getAll().then(res => setContacts(res.data)).catch(() => {});
  }, []);

  // Search handler
  const handleSearch = async (text) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await designsApi.search(text);
      setSearchResults(data);
    } catch {
      // Ignore search errors
    } finally {
      setSearching(false);
    }
  };

  // Add design helper
  const addDesign = (design) => {
    if (selectedDesigns.some(d => d.id === design.id)) {
      notify('Already added', `Design ${design.design_number} is already in the list.`);
      return;
    }
    setSelectedDesigns(prev => [...prev, design]);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Remove design helper
  const removeDesign = (designId) => {
    setSelectedDesigns(prev => prev.filter(d => d.id !== designId));
  };

  // Camera permissions
  const startCamera = async () => {
    setCamPermission('requesting');
    if (Platform.OS === 'web') {
      try {
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setCamPermission('active');
        setScannerOpen(true);
      } catch (e) {
        setCamPermission(e.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    } else {
      const { Camera } = await import('expo-camera');
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status === 'granted') {
        setCamPermission('active');
        setScannerOpen(true);
      } else {
        setCamPermission('denied');
      }
    }
  };

  // QR Barcode Scanned handler
  const handleBarcodeScanned = async ({ data }) => {
    if (!data.startsWith(QR_PREFIX)) {
      setScannedFeedback('⚠️ Not a Gopiram QR');
      setTimeout(() => setScannedFeedback(''), 1500);
      return;
    }
    
    const id = data.replace(QR_PREFIX, '');
    if (selectedDesigns.some(d => String(d.id) === id)) {
      setScannedFeedback('✓ Already added');
      setTimeout(() => setScannedFeedback(''), 1500);
      return;
    }

    setScannedFeedback('🔍 Fetching...');
    try {
      const { data: d } = await designsApi.getOne(id);
      setSelectedDesigns(prev => [...prev, d]);
      setScannedFeedback(`✓ Added Design ${d.design_number}`);
      setTimeout(() => setScannedFeedback(''), 1500);
    } catch {
      setScannedFeedback('❌ Design not found');
      setTimeout(() => setScannedFeedback(''), 1500);
    }
  };

  // Handle click on bottom bar Generate Link button
  const handleGenerateLink = () => {
    if (selectedDesigns.length === 0) {
      notify('No designs', 'Select at least one design first.');
      return;
    }
    // Open the customer details modal first to get info for the inquiry
    setInquiryModalVisible(true);
  };

  // Generate link, save inquiry to database (if checked), and navigate to share screen
  const submitFormAndInquiry = async () => {
    if (saveToInquiries && !customerName.trim()) {
      notify('Required', 'Please enter a customer name to save this inquiry.');
      return;
    }

    const ids = selectedDesigns.map(d => d.id);
    const link = getCustomCatalogUrl(ids);
    setGeneratedLink(link);

    if (saveToInquiries) {
      setSavingInquiry(true);
      try {
        const designNos = selectedDesigns.map(d => d.design_number).join(', ');
        await ordersApi.create({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          note: `Custom catalog link: ${link}`,
          design_number: `${selectedDesigns.length} designs (${designNos})`,
          brand_name: 'Custom Form',
          quantity: selectedDesigns.length,
          source: 'custom_form',
        });
        notify('Saved', 'Inquiry saved successfully under Orders.');
      } catch (e) {
        notify('Error', e.response?.data?.error || 'Could not save inquiry.');
      } finally {
        setSavingInquiry(false);
      }
    }

    // Auto-select contact if matching phone number was typed
    if (customerPhone.trim()) {
      const match = contacts.find(c => (c.phone || '').includes(customerPhone.trim()));
      if (match) setSelectedContact(match);
      else setSelectedContact({ name: customerName.trim(), phone: customerPhone.trim() });
    } else {
      setSelectedContact(null);
    }

    setInquiryModalVisible(false);
    setShareModalVisible(true);
  };

  const copyToClipboard = () => {
    Clipboard.setString(generatedLink);
    notify('Copied', 'Custom catalog link copied to clipboard.');
  };

  const shareOnWhatsApp = () => {
    const text = `Namaste! 🙏\nHere's a custom order form created for you containing our selected designs:\n\n${generatedLink}\n\nTap the link to view, adjust quantities, and place your order directly.`;
    Linking.openURL(whatsappLink(text, selectedContact?.phone));
    setShareModalVisible(false);
    
    // Clear selection on success
    setSelectedDesigns([]);
    setCustomerName('');
    setCustomerPhone('');
  };

  return (
    <View style={styles.container}>
      {/* Search Header Row */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search design no, item, brand..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.scanBtn} onPress={startCamera}>
          <Text style={styles.scanBtnIcon}>📷</Text>
        </TouchableOpacity>
      </View>

      {/* Floating Search Results */}
      {searchQuery.trim().length > 0 && (
        <View style={styles.searchResultsContainer}>
          {searching && <ActivityIndicator color={colors.primary} style={{ padding: 12 }} />}
          {!searching && searchResults.length === 0 && (
            <Text style={styles.noResultsText}>No designs found</Text>
          )}
          <FlatList
            data={searchResults}
            keyExtractor={d => String(d.id)}
            renderItem={({ item: d }) => (
              <TouchableOpacity style={styles.searchResultItem} onPress={() => addDesign(d)}>
                {d.photo_path ? (
                  <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.searchResultThumb} />
                ) : (
                  <View style={[styles.searchResultThumb, { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 10 }}>🛍️</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchResultTitle}>Design {d.design_number}</Text>
                  <Text style={styles.searchResultSub}>{d.item_name} · {d.brand_name} · ₹{d.rate}</Text>
                </View>
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 200 }}
          />
        </View>
      )}

      {/* Selected Items List */}
      <Text style={styles.sectionTitle}>Selected Designs ({selectedDesigns.length})</Text>
      <FlatList
        data={selectedDesigns}
        keyExtractor={d => String(d.id)}
        renderItem={({ item: d }) => (
          <View style={styles.selectedItemCard}>
            {d.photo_path ? (
              <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.itemThumb} />
            ) : (
              <View style={[styles.itemThumb, styles.itemThumbPlaceholder]}>
                <Text style={{ fontSize: 18 }}>🛍️</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.itemName}>Design {d.design_number}</Text>
              <Text style={styles.itemSub}>{d.item_name} · {d.brand_name}</Text>
              <Text style={styles.itemRate}>₹{d.rate}</Text>
            </View>
            <TouchableOpacity onPress={() => removeDesign(d.id)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✍️</Text>
            <Text style={styles.emptyTitle}>Add designs to your list</Text>
            <Text style={styles.emptySubtitle}>Use the search bar above or tap the 📷 button to scan a saree QR code directly.</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Floating Bottom Action Bar */}
      {selectedDesigns.length > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateLink}>
            <Text style={styles.generateBtnText}>Generate Link</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* QR Scanner Modal */}
      <Modal visible={scannerOpen} animationType="fade" transparent>
        <View style={styles.scannerOverlay}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcodeScanned}
          >
            <View style={styles.cameraOverlay}>
              <View style={styles.cameraHeader}>
                <Text style={styles.cameraTitle}>Scan Saree QR</Text>
                <TouchableOpacity onPress={() => { setScannerOpen(false); setScannedFeedback(''); }} style={styles.cameraCloseBtn}>
                  <Text style={styles.cameraCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.scannerFrameContainer}>
                <View style={styles.scannerFrame}>
                  {/* Corner brackets */}
                  <View style={[styles.corner, styles.tl]} />
                  <View style={[styles.corner, styles.tr]} />
                  <View style={[styles.corner, styles.bl]} />
                  <View style={[styles.corner, styles.br]} />
                </View>
              </View>

              <View style={styles.cameraFooter}>
                {scannedFeedback ? (
                  <View style={styles.feedbackBadge}>
                    <Text style={styles.feedbackText}>{scannedFeedback}</Text>
                  </View>
                ) : (
                  <Text style={styles.cameraInstructions}>Align saree QR tag inside the frame. Scanning is continuous — you can scan multiple sarees.</Text>
                )}
              </View>
            </View>
          </CameraView>
        </View>
      </Modal>

      {/* Customer Details & Inquiry Modal */}
      <Modal visible={inquiryModalVisible} animationType="slide" transparent>
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>Inquiry Details</Text>
            <Text style={styles.inquirySub}>Enter customer details to generate the link and save this custom catalog as an inquiry.</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Customer Name *"
              placeholderTextColor={colors.textSecondary}
              value={customerName}
              onChangeText={setCustomerName}
              autoCorrect={false}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="WhatsApp Number (optional)"
              placeholderTextColor={colors.textSecondary}
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setSaveToInquiries(v => !v)}
              activeOpacity={0.8}
            >
              <Text style={styles.checkboxIcon}>{saveToInquiries ? '☑️' : '⬛'}</Text>
              <Text style={styles.checkboxLabel}>Save under Order Inquiries</Text>
            </TouchableOpacity>

            <View style={styles.shareActions}>
              <TouchableOpacity style={styles.copyBtn} onPress={() => setInquiryModalVisible(false)}>
                <Text style={styles.copyBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.whatsappBtn, { backgroundColor: colors.primary || '#8B1A2B' }]}
                onPress={submitFormAndInquiry}
                disabled={savingInquiry}
              >
                <Text style={styles.whatsappBtnText}>
                  {savingInquiry ? 'Saving...' : 'Generate & Continue'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share / Result Link Modal */}
      <Modal visible={shareModalVisible} animationType="slide" transparent>
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>Order Form Created!</Text>
            <Text style={styles.shareLink} numberOfLines={2}>{generatedLink}</Text>

            {/* Optional Recipient Picker */}
            <Text style={styles.recipientLabel}>Send to contact (optional):</Text>
            <ScrollView horizontal style={styles.contactsScroll} showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.contactChip, !selectedContact && styles.contactChipActive]}
                onPress={() => setSelectedContact(null)}
              >
                <Text style={[styles.contactChipText, !selectedContact && { color: '#fff' }]}>None (Open WhatsApp)</Text>
              </TouchableOpacity>
              {contacts.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.contactChip, selectedContact?.id === c.id && styles.contactChipActive]}
                  onPress={() => setSelectedContact(c)}
                >
                  <Text style={[styles.contactChipText, selectedContact?.id === c.id && { color: '#fff' }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.shareActions}>
              <TouchableOpacity style={styles.copyBtn} onPress={copyToClipboard}>
                <Text style={styles.copyBtnText}>Copy Link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.whatsappBtn} onPress={shareOnWhatsApp}>
                <Text style={styles.whatsappBtnText}>Share on WhatsApp</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeShareBtn} onPress={() => setShareModalVisible(false)}>
              <Text style={styles.closeShareBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfaf7', padding: 16 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  searchInput: {
    flex: 1,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e8e2dc',
    ...shadow,
  },
  scanBtn: {
    width: 48,
    height: 48,
    backgroundColor: colors.primary || '#8B1A2B',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow,
  },
  scanBtnIcon: { fontSize: 20, color: '#fff' },
  searchResultsContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8e2dc',
    marginBottom: 16,
    overflow: 'hidden',
    ...shadow,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f0eb',
  },
  searchResultThumb: { width: 40, height: 40, borderRadius: 6 },
  searchResultTitle: { fontSize: 13.5, fontWeight: '700', color: colors.textPrimary || '#2C1810' },
  searchResultSub: { fontSize: 11, color: colors.textSecondary || '#888', marginTop: 2 },
  noResultsText: { textAlign: 'center', padding: 16, color: '#999', fontSize: 13 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#888', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 },
  selectedItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f5f0eb',
    ...shadow,
  },
  itemThumb: { width: 56, height: 56, borderRadius: 8 },
  itemThumbPlaceholder: { backgroundColor: '#f5f0eb', justifyContent: 'center', alignItems: 'center' },
  itemName: { fontSize: 14, fontWeight: '800', color: '#2c1810' },
  itemSub: { fontSize: 12, color: '#777', marginTop: 2 },
  itemRate: { fontSize: 14, fontWeight: '800', color: colors.primary || '#8B1A2B', marginTop: 4 },
  removeBtn: { padding: 8 },
  removeBtnText: { fontSize: 18, color: '#aaa', fontWeight: 'bold' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#2c1810', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f5f0eb',
    padding: 16,
    alignItems: 'center',
  },
  generateBtn: {
    backgroundColor: colors.primary || '#8B1A2B',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    ...shadow,
  },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  
  // Scanner UI
  scannerOverlay: { flex: 1, backgroundColor: '#000' },
  cameraOverlay: { flex: 1, justifyContent: 'space-between', padding: 20 },
  cameraHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Platform.OS === 'ios' ? 40 : 10 },
  cameraTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  cameraCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  cameraCloseBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  scannerFrameContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scannerFrame: { width: 250, height: 250, position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#fff', borderWidth: 3 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  cameraFooter: { alignItems: 'center', marginBottom: 40 },
  cameraInstructions: { color: '#fff', opacity: 0.8, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  feedbackBadge: { backgroundColor: colors.primary || '#8B1A2B', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
  feedbackText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Share UI
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  shareSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  shareTitle: { fontSize: 18, fontWeight: '800', color: '#2c1810', marginBottom: 12 },
  shareLink: { backgroundColor: '#faf6f2', padding: 12, borderRadius: 8, fontSize: 13, color: '#7a5a4a', borderWidth: 1, borderColor: '#ebdcd3', marginBottom: 20 },
  recipientLabel: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: 8 },
  contactsScroll: { marginBottom: 20 },
  contactChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1.5, borderColor: '#e8e2dc', marginRight: 8 },
  contactChipActive: { backgroundColor: colors.primary || '#8B1A2B', borderColor: colors.primary || '#8B1A2B' },
  contactChipText: { fontSize: 13, color: '#666', fontWeight: '600' },
  shareActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  copyBtn: { flex: 1, height: 48, borderWidth: 1.5, borderColor: '#ddd', padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  copyBtnText: { color: '#666', fontWeight: '700', fontSize: 14 },
  whatsappBtn: { flex: 2, height: 48, backgroundColor: '#25D366', padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  whatsappBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  closeShareBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  closeShareBtnText: { color: '#999', fontSize: 14, fontWeight: '600' },

  // Inquiry form specific UI
  inquirySub: { fontSize: 13, color: '#888', marginBottom: 16 },
  modalInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    borderWidth: 1.5,
    borderColor: '#e8e2dc',
    marginBottom: 12,
    color: '#2c1810',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingVertical: 4,
  },
  checkboxIcon: {
    fontSize: 18,
    color: colors.primary || '#8B1A2B',
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
});
