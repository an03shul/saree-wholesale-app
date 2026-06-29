import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { identifyApi, getImageUrl, getThumbUrl } from '../api/client';
import { notify } from '../utils/share';

export default function IdentifyScreen() {
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState(null);
  const [message, setMessage] = useState(null);

  const pickImage = async (fromCamera) => {
    let result;
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        return notify('Permission needed', 'Camera access is required to take a photo.');
      }
      result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: false });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return notify('Permission needed', 'Photo library access is required.');
      }
      result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: false });
    }

    if (!result.canceled && result.assets?.[0]) {
      setPhoto(result.assets[0]);
      setMatches(null);
      setMessage(null);
    }
  };

  const identify = async () => {
    if (!photo) return;
    setLoading(true);
    setMatches(null);
    setMessage(null);

    try {
      const formData = new FormData();
      const uri = photo.uri;
      const filename = uri.split('/').pop();
      const type = photo.mimeType || 'image/jpeg';
      if (Platform.OS === 'web') {
        const res = await fetch(uri);
        const blob = await res.blob();
        formData.append('photo', new File([blob], filename, { type }));
      } else {
        formData.append('photo', { uri, name: filename, type });
      }

      const { data } = await identifyApi.identify(formData);
      setMatches(data.matches || []);
      setMessage(data.message || null);
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not identify the piece. Make sure the backend has an ANTHROPIC_API_KEY set.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPhoto(null);
    setMatches(null);
    setMessage(null);
  };

  const confidenceColor = (c) => {
    if (c === 'high') return '#1a6b3c';
    if (c === 'medium') return '#e67e22';
    return '#999';
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.heading}>Identify Saree Piece</Text>
      <Text style={styles.subheading}>Take or pick a photo of an unknown piece to find it in your catalog.</Text>

      {!photo ? (
        <View style={styles.photoButtons}>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pickImage(true)}>
            <Text style={styles.photoBtnIcon}>📷</Text>
            <Text style={styles.photoBtnText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.photoBtn, { backgroundColor: '#2c1810' }]} onPress={() => pickImage(false)}>
            <Text style={styles.photoBtnIcon}>🖼️</Text>
            <Text style={styles.photoBtnText}>Pick from Gallery</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.previewContainer}>
            <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
            <TouchableOpacity style={styles.changeBtn} onPress={reset}>
              <Text style={styles.changeBtnText}>✕ Change Photo</Text>
            </TouchableOpacity>
          </View>

          {!loading && !matches && (
            <TouchableOpacity style={styles.identifyBtn} onPress={identify}>
              <Text style={styles.identifyBtnText}>🔍 Find in Catalog</Text>
            </TouchableOpacity>
          )}

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#c0392b" size="large" />
              <Text style={styles.loadingText}>Analyzing with AI...{'\n'}This may take 15–30 seconds</Text>
            </View>
          )}

          {message && !loading && (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>{message}</Text>
            </View>
          )}

          {matches && !loading && matches.length === 0 && !message && (
            <View style={styles.noMatchBox}>
              <Text style={styles.noMatchText}>No matching item found in catalog.</Text>
              <Text style={styles.noMatchSub}>Try a clearer photo or add more photos to your designs.</Text>
            </View>
          )}

          {matches && matches.length > 0 && (
            <>
              <Text style={styles.resultsHeading}>Top Matches</Text>
              {matches.map((m, i) => (
                <View key={m.id} style={styles.matchCard}>
                  <View style={styles.matchHeader}>
                    <View style={[styles.rankBadge, { backgroundColor: i === 0 ? '#c0392b' : '#888' }]}>
                      <Text style={styles.rankText}>#{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchBrand}>{m.brand_name}</Text>
                      <Text style={styles.matchItem}>{m.item_name}</Text>
                    </View>
                    <View style={[styles.confidenceBadge, { backgroundColor: confidenceColor(m.confidence) }]}>
                      <Text style={styles.confidenceText}>{m.confidence}</Text>
                    </View>
                  </View>

                  <View style={styles.matchRow}>
                    {m.photo_path && (
                      <Image
                        source={{ uri: getThumbUrl(m.photo_path) }}
                        style={styles.matchThumb}
                        resizeMode="cover"
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchDetail}>Design: {m.design_number}</Text>
                      {m.fabric_type && <Text style={styles.matchDetail}>Fabric: {m.fabric_type}</Text>}
                      {m.colors && <Text style={styles.matchDetail}>Colors: {m.colors}</Text>}
                      <Text style={styles.matchDetail}>Rate: ₹{m.rate} | {m.pcs_per_set} pcs/set</Text>
                      <Text style={styles.matchReason}>{m.reason}</Text>
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity style={styles.tryAgainBtn} onPress={reset}>
                <Text style={styles.tryAgainText}>Try Another Photo</Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f4f0' },
  heading: { fontSize: 22, fontWeight: '700', color: '#2c1810', marginBottom: 6 },
  subheading: { color: '#666', fontSize: 14, marginBottom: 24, lineHeight: 20 },
  photoButtons: { flexDirection: 'row', gap: 12 },
  photoBtn: {
    flex: 1, backgroundColor: '#c0392b', borderRadius: 14, padding: 20,
    alignItems: 'center', gap: 8,
  },
  photoBtnIcon: { fontSize: 32 },
  photoBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  previewContainer: { borderRadius: 14, overflow: 'hidden', marginBottom: 16 },
  preview: { width: '100%', height: 260 },
  changeBtn: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  changeBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  identifyBtn: {
    backgroundColor: '#c0392b', borderRadius: 14, padding: 16,
    alignItems: 'center', marginBottom: 20,
  },
  identifyBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  loadingBox: { alignItems: 'center', paddingVertical: 32, gap: 16 },
  loadingText: { color: '#666', textAlign: 'center', lineHeight: 22 },
  messageBox: { backgroundColor: '#fff3cd', padding: 16, borderRadius: 12, marginBottom: 16 },
  messageText: { color: '#856404', lineHeight: 20 },
  noMatchBox: { backgroundColor: '#fff', padding: 20, borderRadius: 14, alignItems: 'center', gap: 8 },
  noMatchText: { fontSize: 16, fontWeight: '700', color: '#2c1810' },
  noMatchSub: { color: '#888', textAlign: 'center', fontSize: 13 },
  resultsHeading: { fontSize: 18, fontWeight: '700', color: '#2c1810', marginBottom: 12, marginTop: 4 },
  matchCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  matchHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  rankBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  matchBrand: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  matchItem: { fontSize: 16, fontWeight: '700', color: '#2c1810' },
  confidenceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  confidenceText: { color: '#fff', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  matchRow: { flexDirection: 'row', gap: 12 },
  matchThumb: { width: 80, height: 80, borderRadius: 10 },
  matchDetail: { fontSize: 13, color: '#444', marginBottom: 3 },
  matchReason: { fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' },
  tryAgainBtn: {
    borderWidth: 1.5, borderColor: '#c0392b', borderRadius: 14, padding: 14,
    alignItems: 'center', marginTop: 8,
  },
  tryAgainText: { color: '#c0392b', fontWeight: '700', fontSize: 15 },
});
