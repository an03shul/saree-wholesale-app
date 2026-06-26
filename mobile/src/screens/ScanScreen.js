import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, ActivityIndicator, Alert, ScrollView, Image, Platform,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { designsApi, getImageUrl } from '../api/client';
import { colors, shadow } from '../constants/theme';

const QR_PREFIX = 'GOPIRAM:DESIGN:';

export default function ScanScreen() {
  const [camState, setCamState] = useState('idle'); // idle | requesting | active | denied | error
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [design, setDesign] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const startCamera = async () => {
    setCamState('requesting');
    if (Platform.OS === 'web') {
      try {
        // On web, just request directly via browser API
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setCamState('active');
      } catch (e) {
        if (e.name === 'NotAllowedError') setCamState('denied');
        else setCamState('error');
      }
    } else {
      const { Camera } = await import('expo-camera');
      const { status } = await Camera.requestCameraPermissionsAsync();
      setCamState(status === 'granted' ? 'active' : 'denied');
    }
  };

  const handleBarcode = async ({ data }) => {
    if (scanned || loading) return;
    if (!data.startsWith(QR_PREFIX)) {
      Alert.alert('Unknown QR', 'This QR code is not from Gopiram Saree.');
      return;
    }
    setScanned(true);
    const id = data.replace(QR_PREFIX, '');
    setLoading(true);
    try {
      const { data: d } = await designsApi.getOne(id);
      setDesign(d);
      setDetailVisible(true);
    } catch {
      Alert.alert('Not found', 'Could not find this design in the catalog.');
      setScanned(false);
    } finally {
      setLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailVisible(false);
    setDesign(null);
    setTimeout(() => setScanned(false), 600);
  };

  // Idle — show start button
  if (camState === 'idle') {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.permTitle}>Scan a Design QR Code</Text>
        <Text style={styles.permText}>Point your camera at a QR code on any saree piece to instantly view its details.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={startCamera}>
          <Text style={styles.permBtnText}>Open Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (camState === 'requesting') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#c0392b" size="large" />
        <Text style={styles.permText}>Requesting camera access…</Text>
      </View>
    );
  }

  if (camState === 'denied') {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>🚫</Text>
        <Text style={styles.permTitle}>Camera Access Denied</Text>
        <Text style={styles.permText}>
          Please allow camera access in your browser settings, then tap below.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={startCamera}>
          <Text style={styles.permBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (camState === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.permTitle}>Camera Not Available</Text>
        <Text style={styles.permText}>
          Make sure you are accessing the app over the local network and your browser supports camera access.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={startCamera}>
          <Text style={styles.permBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Active camera
  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
      >
        <View style={styles.overlay}>
          <View style={styles.topDim} />
          <View style={styles.middleRow}>
            <View style={styles.sideDim} />
            <View style={styles.scanBox}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
            <View style={styles.sideDim} />
          </View>
          <View style={styles.bottomDim}>
            <Text style={styles.hint}>Point camera at a design QR code</Text>
            {loading && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}
          </View>
        </View>
      </CameraView>

      {/* Design detail modal */}
      <Modal visible={detailVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailSheet}>
            {design && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailBrand}>{design.brand_name}</Text>
                    <Text style={styles.detailItem}>{design.item_name}</Text>
                  </View>
                  <TouchableOpacity onPress={closeDetail} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {design.photo_path && (
                  <Image source={{ uri: getImageUrl(design.photo_path) }} style={styles.detailPhoto} resizeMode="cover" />
                )}

                <View style={styles.detailGrid}>
                  <DetailRow label="Design No." value={design.design_number} />
                  <DetailRow label="Rate" value={`₹${design.rate}`} highlight />
                  <DetailRow label="Fabric" value={design.fabric_type || '—'} />
                  <DetailRow label="Colors" value={design.colors || '—'} />
                  <DetailRow label="Pcs / Set" value={String(design.pcs_per_set)} />
                  {design.tally_item_name && <DetailRow label="Tally Item" value={design.tally_item_name} />}
                </View>

                <TouchableOpacity style={styles.scanAgainBtn} onPress={closeDetail}>
                  <Text style={styles.scanAgainText}>📷 Scan Another</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({ label, value, highlight }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, highlight && styles.detailValueHighlight]}>{value}</Text>
    </View>
  );
}

const DIM = 'rgba(0,0,0,0.55)';
const BOX = 240;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: colors.background, gap: 12 },
  icon: { fontSize: 52, marginBottom: 4 },
  permTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  permText: { textAlign: 'center', color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  permBtn: { backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, marginTop: 8, ...shadow.small },
  permBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  camera: { flex: 1 },
  overlay: { flex: 1 },
  topDim: { flex: 1, backgroundColor: DIM },
  middleRow: { flexDirection: 'row', height: BOX },
  sideDim: { flex: 1, backgroundColor: DIM },
  scanBox: { width: BOX, height: BOX },
  bottomDim: { flex: 1, backgroundColor: DIM, alignItems: 'center', paddingTop: 24 },
  hint: { color: '#fff', fontSize: 15, fontWeight: '600' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.gold, borderWidth: 3 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  detailSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  detailBrand: { fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' },
  detailItem: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 16, color: colors.textSecondary, fontWeight: '700' },
  detailPhoto: { width: '100%', height: 200, borderRadius: 14, marginBottom: 16 },
  detailGrid: { backgroundColor: colors.background, borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.textSecondary, fontSize: 14 },
  detailValue: { fontWeight: '700', fontSize: 14, color: colors.textPrimary },
  detailValueHighlight: { color: colors.primary, fontSize: 17, fontWeight: '800' },
  scanAgainBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 8, ...shadow.small },
  scanAgainText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
