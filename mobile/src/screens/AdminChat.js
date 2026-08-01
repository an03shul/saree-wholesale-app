import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet,
} from 'react-native';
import { adminApi } from '../api/client';
import { notify } from '../utils/share';
import { colors, shadow } from '../constants/theme';
import ChatThread from '../components/ChatThread';

// Admin side of the manufacturer chat: a list of per-manufacturer (per-brand)
// threads; tap one to read the conversation and reply. Opened from the 💬 icon
// on the admin home header.
export default function AdminChatModal({ visible, onClose }) {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openBrand, setOpenBrand] = useState(null); // { brand_id, brand_name }

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getManufacturerNotes()
      .then(({ data }) => setMsgs(data))
      .catch(() => notify('Error', 'Could not load messages'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (visible) load(); }, [visible, load]);

  // Group messages into per-brand threads, most-recently-active first.
  const threads = useMemo(() => {
    const m = new Map();
    for (const n of msgs) {
      if (n.brand_id == null) continue;
      if (!m.has(n.brand_id)) m.set(n.brand_id, { brand_id: n.brand_id, brand_name: n.brand_name || 'Unknown', messages: [] });
      m.get(n.brand_id).messages.push(n);
    }
    return [...m.values()].sort((a, b) =>
      new Date(b.messages[b.messages.length - 1].created_at) - new Date(a.messages[a.messages.length - 1].created_at));
  }, [msgs]);

  const active = openBrand ? threads.find(t => t.brand_id === openBrand.brand_id) : null;
  const back = () => { if (openBrand) setOpenBrand(null); else onClose(); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={back}>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={back} style={{ padding: 6, minWidth: 60 }}>
            <Text style={styles.headerBtn}>{openBrand ? '‹ Back' : '✕'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{openBrand ? openBrand.brand_name : 'Manufacturer Chat'}</Text>
          <View style={{ width: 60 }} />
        </View>
        {loading ? <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
          : openBrand && active ? (
            <ChatThread
              messages={active.messages}
              mineRole="admin"
              loading={false}
              placeholder={`Reply to ${openBrand.brand_name}…`}
              onSend={async (t) => {
                try {
                  await adminApi.replyManufacturerNote(openBrand.brand_id, t);
                  const { data } = await adminApi.getManufacturerNotes();
                  setMsgs(data);
                } catch (e) { notify('Error', e.response?.data?.error || 'Could not send'); throw e; }
              }}
            />
          ) : (
            <FlatList
              data={threads}
              keyExtractor={t => String(t.brand_id)}
              contentContainerStyle={{ padding: 14 }}
              ListEmptyComponent={<Text style={styles.empty}>No manufacturer messages yet. When a manufacturer sends a note, their thread appears here.</Text>}
              renderItem={({ item: t }) => {
                const last = t.messages[t.messages.length - 1];
                return (
                  <TouchableOpacity style={styles.threadRow} onPress={() => setOpenBrand({ brand_id: t.brand_id, brand_name: t.brand_name })}>
                    <View style={styles.avatar}><Text style={styles.avatarTxt}>{t.brand_name.charAt(0).toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.threadName} numberOfLines={1}>{t.brand_name}</Text>
                      <Text style={styles.threadSnippet} numberOfLines={1}>{last.sender_role === 'admin' ? 'You: ' : ''}{last.body}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#8B1A2B', paddingTop: 50, paddingBottom: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBtn: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontWeight: '800', fontSize: 17, letterSpacing: 0.3 },
  empty: { textAlign: 'center', marginTop: 60, color: colors.textSecondary, paddingHorizontal: 24, lineHeight: 21 },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, ...shadow.small },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#8B1A2B', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 18 },
  threadName: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  threadSnippet: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
});
