import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, ActivityIndicator, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { adminApi, authApi, setAuthToken, settingsApi } from '../api/client';

export default function AdminScreen({ user, onLogout }) {
  const [tab, setTab] = useState('activity'); // 'activity' | 'users' | 'template'
  const [template, setTemplate] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [changePinModal, setChangePinModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({ username: '', pin: '', role: 'staff' });
  const [newPin, setNewPin] = useState('');
  const [changePinForm, setChangePinForm] = useState({ current: '', next: '' });

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getActivity(100);
      setLogs(data);
    } catch { Alert.alert('Error', 'Could not load activity log'); }
    finally { setLoading(false); }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getUsers();
      setUsers(data);
    } catch { Alert.alert('Error', 'Could not load users'); }
    finally { setLoading(false); }
  }, []);

  const loadTemplate = useCallback(async () => {
    try {
      const { data } = await settingsApi.getAll();
      setTemplate(data.whatsapp_template || '');
    } catch {}
  }, []);

  const saveTemplate = async () => {
    setTemplateSaving(true);
    try {
      await settingsApi.set('whatsapp_template', template);
      Alert.alert('Saved', 'WhatsApp template updated');
    } catch {
      Alert.alert('Error', 'Could not save template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const switchTab = (t) => {
    setTab(t);
    if (t === 'activity') loadActivity();
    else if (t === 'users') loadUsers();
    else if (t === 'template') loadTemplate();
  };

  React.useEffect(() => { loadActivity(); }, []);

  const addUser = async () => {
    if (!form.username || !form.pin) return Alert.alert('Required', 'Username and PIN are required');
    try {
      await adminApi.addUser(form);
      setAddModal(false);
      setForm({ username: '', pin: '', role: 'staff' });
      loadUsers();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not add user');
    }
  };

  const deleteUser = (u) => {
    Alert.alert('Remove User', `Remove ${u.username}? They will be logged out immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await adminApi.deleteUser(u.id); loadUsers(); }
        catch (e) { Alert.alert('Error', e.response?.data?.error || 'Could not remove user'); }
      }},
    ]);
  };

  const resetPin = async () => {
    if (!newPin || newPin.length < 4) return Alert.alert('Error', 'PIN must be at least 4 digits');
    try {
      await adminApi.resetPin(selectedUser.id, newPin);
      setPinModal(false);
      setNewPin('');
      Alert.alert('Done', `PIN reset for ${selectedUser.username}`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not reset PIN');
    }
  };

  const changeOwnPin = async () => {
    if (!changePinForm.current || !changePinForm.next) return Alert.alert('Required', 'Fill both fields');
    if (changePinForm.next.length < 4) return Alert.alert('Error', 'New PIN must be at least 4 digits');
    try {
      await authApi.changePin(changePinForm.current, changePinForm.next);
      setChangePinModal(false);
      setChangePinForm({ current: '', next: '' });
      Alert.alert('Done', 'PIN changed successfully');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not change PIN');
    }
  };

  const logout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => {
        try { await authApi.logout(); } catch {}
        await AsyncStorage.removeItem('auth_token');
        await AsyncStorage.removeItem('auth_user');
        setAuthToken(null);
        onLogout();
      }},
    ]);
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Admin Panel</Text>
          <Text style={styles.headerSub}>Logged in as {user.username}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabs}>
        {[['activity','📋 Logs'],['users','👤 Staff'],['template','💬 Template']].map(([t, label]) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => switchTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && <ActivityIndicator color="#c0392b" style={{ marginTop: 30 }} size="large" />}

      {/* Activity Log */}
      {tab === 'activity' && !loading && (
        <FlatList
          data={logs}
          keyExtractor={l => String(l.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>No activity yet</Text>}
          renderItem={({ item: l }) => (
            <View style={styles.logCard}>
              <View style={styles.logRow}>
                <View style={[styles.avatar, { backgroundColor: l.username === 'admin' ? '#c0392b' : '#2c1810' }]}>
                  <Text style={styles.avatarText}>{l.username[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.logUser}>{l.username}</Text>
                    <Text style={styles.logTime}>{formatTime(l.created_at)}</Text>
                  </View>
                  <Text style={styles.logAction}>{l.action}</Text>
                  {l.details && <Text style={styles.logDetails}>{l.details}</Text>}
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Users */}
      {tab === 'users' && !loading && (
        <>
          <FlatList
            data={users}
            keyExtractor={u => String(u.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.empty}>No staff added yet</Text>}
            ListHeaderComponent={
              <TouchableOpacity style={styles.changePinLink} onPress={() => setChangePinModal(true)}>
                <Text style={styles.changePinLinkText}>🔑 Change my PIN</Text>
              </TouchableOpacity>
            }
            renderItem={({ item: u }) => (
              <View style={styles.userCard}>
                <View style={[styles.avatar, { backgroundColor: u.role === 'admin' ? '#c0392b' : '#2c1810' }]}>
                  <Text style={styles.avatarText}>{u.username[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{u.username}</Text>
                  <Text style={styles.userRole}>{u.role}</Text>
                </View>
                <TouchableOpacity style={styles.resetBtn} onPress={() => { setSelectedUser(u); setPinModal(true); }}>
                  <Text style={styles.resetBtnText}>Reset PIN</Text>
                </TouchableOpacity>
                {u.id !== user.id && (
                  <TouchableOpacity onPress={() => deleteUser(u)} style={{ paddingLeft: 8 }}>
                    <Text style={{ color: '#e74c3c', fontSize: 20 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
          <TouchableOpacity style={styles.fab} onPress={() => setAddModal(true)}>
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </>
      )}

      {/* WhatsApp Template */}
      {tab === 'template' && (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.templateTitle}>WhatsApp Message Template</Text>
          <Text style={styles.templateHint}>
            Available variables:{'\n'}
            {'{'}<Text style={styles.varName}>item_name</Text>{'}'} {'{'}<Text style={styles.varName}>brand_name</Text>{'}'}{'\n'}
            {'{'}<Text style={styles.varName}>design_number</Text>{'}'} {'{'}<Text style={styles.varName}>rate</Text>{'}'}{'\n'}
            {'{'}<Text style={styles.varName}>pcs_per_set</Text>{'}'} {'{'}<Text style={styles.varName}>fabric_type</Text>{'}'} {'{'}<Text style={styles.varName}>colors</Text>{'}'}
          </Text>
          <TextInput
            style={styles.templateInput}
            multiline
            value={template}
            onChangeText={setTemplate}
            placeholder="Enter template…"
            textAlignVertical="top"
          />
          <TouchableOpacity style={styles.btnPrimary} onPress={saveTemplate} disabled={templateSaving}>
            <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>
              {templateSaving ? 'Saving…' : 'Save Template'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Add User Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Staff</Text>
            <TextInput style={styles.input} placeholder="Username (e.g. raju)" value={form.username}
              onChangeText={v => setForm(f => ({ ...f, username: v.toLowerCase() }))} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="PIN (min 4 digits)" value={form.pin}
              onChangeText={v => setForm(f => ({ ...f, pin: v }))} keyboardType="number-pad" secureTextEntry maxLength={8} />
            <View style={styles.roleRow}>
              {['staff', 'admin'].map(r => (
                <TouchableOpacity key={r} style={[styles.roleBtn, form.role === r && styles.roleBtnActive]}
                  onPress={() => setForm(f => ({ ...f, role: r }))}>
                  <Text style={form.role === r ? { color: '#fff' } : {}}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setAddModal(false)}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={addUser}><Text style={{ color: '#fff' }}>Add</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset PIN Modal */}
      <Modal visible={pinModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Reset PIN for {selectedUser?.username}</Text>
            <TextInput style={styles.input} placeholder="New PIN (min 4 digits)" value={newPin}
              onChangeText={setNewPin} keyboardType="number-pad" secureTextEntry maxLength={8} />
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setPinModal(false); setNewPin(''); }}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={resetPin}><Text style={{ color: '#fff' }}>Reset</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Own PIN Modal */}
      <Modal visible={changePinModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Change My PIN</Text>
            <TextInput style={styles.input} placeholder="Current PIN" value={changePinForm.current}
              onChangeText={v => setChangePinForm(f => ({ ...f, current: v }))} keyboardType="number-pad" secureTextEntry maxLength={8} />
            <TextInput style={styles.input} placeholder="New PIN (min 4 digits)" value={changePinForm.next}
              onChangeText={v => setChangePinForm(f => ({ ...f, next: v }))} keyboardType="number-pad" secureTextEntry maxLength={8} />
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setChangePinModal(false); setChangePinForm({ current: '', next: '' }); }}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={changeOwnPin}><Text style={{ color: '#fff' }}>Change</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f4f0' },
  header: { backgroundColor: '#c0392b', padding: 20, paddingTop: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  logoutBtn: { backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  logoutText: { color: '#fff', fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff' },
  tab: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#c0392b' },
  tabText: { color: '#999', fontWeight: '600' },
  tabTextActive: { color: '#c0392b' },
  empty: { textAlign: 'center', marginTop: 60, color: '#aaa' },
  logCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8 },
  logRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  logUser: { fontWeight: '700', color: '#2c1810', fontSize: 14 },
  logTime: { color: '#aaa', fontSize: 12 },
  logAction: { color: '#444', fontSize: 14, marginTop: 2 },
  logDetails: { color: '#888', fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  userCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  userName: { fontWeight: '700', fontSize: 16, color: '#2c1810' },
  userRole: { color: '#888', fontSize: 12, textTransform: 'capitalize' },
  resetBtn: { borderWidth: 1, borderColor: '#c0392b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  resetBtnText: { color: '#c0392b', fontSize: 13 },
  fab: { position: 'absolute', bottom: 28, right: 16, backgroundColor: '#c0392b', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 34 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#2c1810' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 12 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  roleBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
  roleBtnActive: { backgroundColor: '#c0392b', borderColor: '#c0392b' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  btnPrimary: { backgroundColor: '#c0392b', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnSecondary: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd' },
  changePinLink: { marginBottom: 16 },
  changePinLinkText: { color: '#c0392b', fontWeight: '600', fontSize: 14 },
  tabScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  templateTitle: { fontSize: 18, fontWeight: '800', color: '#2c1810', marginBottom: 12 },
  templateHint: { fontSize: 13, color: '#666', backgroundColor: '#f5f0eb', padding: 12, borderRadius: 10, marginBottom: 16, lineHeight: 22 },
  varName: { color: '#8B1A2B', fontWeight: '700' },
  templateInput: { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 15, minHeight: 160, marginBottom: 20, color: '#1A0A0D', backgroundColor: '#FAF7F2', lineHeight: 22 },
});
