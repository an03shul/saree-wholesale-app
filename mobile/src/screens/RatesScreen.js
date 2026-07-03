import React, { useState, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Image, Keyboard,
} from 'react-native';
import { designsApi, getThumbUrl } from '../api/client';
import { colors, shadow } from '../constants/theme';

// Staff2 "Rates" tab — the main-screen search bar only. Look up a design by
// number / item / brand to see its price and stock. No catalog browsing.
export default function RatesScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  const search = (q) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await designsApi.search(q.trim());
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const isSearching = query.trim().length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          {isSearching && (
            <TouchableOpacity style={styles.backSearchBtn} onPress={() => { setQuery(''); setResults([]); setSearching(false); Keyboard.dismiss(); }}>
              <Text style={styles.backSearchText}>←</Text>
            </TouchableOpacity>
          )}
          <TextInput
            style={[styles.searchInput, { flex: 1 }]}
            placeholder="🔍  Search design # / item / brand — stock & price"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={search}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>

      {isSearching ? (
        <FlatList
          data={results}
          keyExtractor={d => String(d.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.listHeader}>
              {searching ? 'Searching…' : `${results.length} design${results.length !== 1 ? 's' : ''} found`}
            </Text>
          }
          ListEmptyComponent={
            !searching ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No designs found</Text>
                <Text style={styles.emptySubtitle}>Nothing matches "{query}"</Text>
              </View>
            ) : null
          }
          renderItem={({ item: d }) => (
            <View style={styles.resultCard}>
              {d.photo_path
                ? <Image source={{ uri: getThumbUrl(d.photo_path) }} style={styles.resultPhoto} />
                : <View style={[styles.resultPhoto, styles.resultNoPhoto]}><Text style={styles.resultNoPhotoText}>No photo</Text></View>
              }
              <View style={{ flex: 1 }}>
                <Text style={styles.resultDesign} numberOfLines={1}>Design {d.design_number}</Text>
                <Text style={styles.resultSub} numberOfLines={1}>{d.brand_name} · {d.item_name}</Text>
                <Text style={styles.resultRate}>₹{d.rate}</Text>
              </View>
              <View style={[styles.stockPill, d.in_stock ? styles.stockPillIn : styles.stockPillOut]}>
                <Text style={[styles.stockPillText, { color: d.in_stock ? '#2E7D32' : colors.danger }]}>
                  {d.in_stock ? 'In Stock' : 'Out of Stock'}
                </Text>
              </View>
            </View>
          )}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🧵</Text>
          <Text style={styles.emptyTitle}>Search rates</Text>
          <Text style={styles.emptySubtitle}>Type a design number, item, or brand{'\n'}to check its price and stock</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backSearchBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card,
    borderWidth: 1.5, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', ...shadow.small,
  },
  backSearchText: { fontSize: 22, fontWeight: '700', color: colors.primary },
  searchInput: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.textPrimary, ...shadow.small,
  },
  resultCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 14, padding: 10, marginBottom: 10, ...shadow.small,
  },
  resultPhoto: { width: 54, height: 54, borderRadius: 10, backgroundColor: colors.background },
  resultNoPhoto: { alignItems: 'center', justifyContent: 'center' },
  resultNoPhotoText: { fontSize: 9, color: colors.textSecondary },
  resultDesign: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  resultSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  resultRate: { fontSize: 15, fontWeight: '800', color: colors.primary, marginTop: 3 },
  stockPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  stockPillIn: { backgroundColor: '#E8F5E9' },
  stockPillOut: { backgroundColor: '#FEE9E9' },
  stockPillText: { fontSize: 11, fontWeight: '800' },
  listHeader: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  emptyContainer: { alignItems: 'center', marginTop: 80, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
