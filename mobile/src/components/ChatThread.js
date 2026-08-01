import React, { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { parseServerDate } from '../utils/date';
import { colors, shadow } from '../constants/theme';

const fmt = (ts) => parseServerDate(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Two-way message thread with a composer. `mineRole` is the sender_role that
// should render as the current user's (right-aligned, primary) bubbles.
export default function ChatThread({ messages, mineRole, onSend, loading, emptyText, placeholder = 'Type a message…' }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try { await onSend(t); setText(''); }
    catch { /* onSend surfaces its own error */ }
    finally { setSending(false); }
  };
  return (
    <View style={styles.wrap}>
      {loading ? <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
        : (
          <FlatList
            style={{ flex: 1 }}
            data={messages}
            keyExtractor={m => String(m.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 14, flexGrow: 1 }}
            ListEmptyComponent={<Text style={styles.empty}>{emptyText || 'No messages yet'}</Text>}
            renderItem={({ item: m }) => {
              const mine = m.sender_role === mineRole;
              return (
                <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.body, mine && { color: '#fff' }]}>{m.body}</Text>
                    <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.7)' }]}>{fmt(m.created_at)}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      <View style={styles.composer}>
        <TextInput style={styles.input} placeholder={placeholder} placeholderTextColor={colors.textSecondary} value={text} onChangeText={setText} multiline />
        <TouchableOpacity style={[styles.sendBtn, (sending || !text.trim()) && { opacity: 0.5 }]} onPress={send} disabled={sending || !text.trim()}>
          <Text style={styles.sendTxt}>{sending ? '…' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  empty: { textAlign: 'center', marginTop: 40, color: colors.textSecondary, paddingHorizontal: 20, lineHeight: 20 },
  row: { flexDirection: 'row', marginBottom: 8 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9, ...shadow.small },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.card, borderBottomLeftRadius: 4 },
  body: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  time: { fontSize: 10, color: colors.textSecondary, marginTop: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  input: { flex: 1, backgroundColor: colors.background, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, color: colors.textPrimary, maxHeight: 110 },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
