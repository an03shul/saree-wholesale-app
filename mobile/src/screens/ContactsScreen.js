import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, ActivityIndicator
} from 'react-native';
import * as ExpoContacts from 'expo-contacts';
import { contactsApi, tallyApi } from '../api/client';
import { confirmAction, notify } from '../utils/share';

export default function ContactsScreen({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [tallyPickerVisible, setTallyPickerVisible] = useState(false);
  const [tallyContacts, setTallyContacts] = useState([]);
  const [phonePicker, setPhonePicker] = useState(null); // { contact, phones } for multi-number pick
  const [tallySearch, setTallySearch] = useState('');
  const [loadingTally, setLoadingTally] = useState(false);
  const [selected, setSelected] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [listSearch, setListSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', type: 'individual' });

  const q = listSearch.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const filteredContacts = q
    ? contacts.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (digits && (c.phone || '').includes(digits))
      )
    : contacts;

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: '', phone: '', type: 'individual' });
    setModalVisible(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({ name: c.name, phone: c.phone, type: c.type || 'individual' });
    setModalVisible(true);
  };

  const load = useCallback(async () => {
    const { data } = await contactsApi.getAll();
    setContacts(data);
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const openPhonePicker = async () => {
    const { status } = await ExpoContacts.requestPermissionsAsync();
    if (status !== 'granted') {
      return notify('Permission needed', 'Allow access to contacts to import from your phone directory.');
    }
    setLoadingContacts(true);
    setPickerVisible(true);
    const { data } = await ExpoContacts.getContactsAsync({
      fields: [ExpoContacts.Fields.PhoneNumbers, ExpoContacts.Fields.Name],
      sort: ExpoContacts.SortTypes.FirstName,
    });
    // Only show contacts that have a phone number
    const withPhone = data.filter(c => c.phoneNumbers?.length > 0);
    setPhoneContacts(withPhone);
    setLoadingContacts(false);
  };

  const selectPhoneContact = (contact) => {
    const phones = contact?.phoneNumbers || [];
    if (phones.length === 0) {
      notify('No phone number', `${contact?.name || 'This contact'} has no phone number.`);
      return;
    }
    if (phones.length === 1) {
      prefillFromContact(contact, phones[0].number);
    } else {
      // Multiple numbers — show a web-safe modal (Alert can't list >2 options on web)
      setPhonePicker({ contact, phones });
    }
  };

  const prefillFromContact = (contact, rawPhone) => {
    // Normalize: strip spaces, dashes, brackets; add 91 if no country code
    let phone = rawPhone.replace(/[\s\-().+]/g, '');
    if (phone.startsWith('0')) phone = '91' + phone.slice(1);
    else if (!phone.startsWith('91') && phone.length === 10) phone = '91' + phone;

    setPickerVisible(false);
    setSearchQuery('');
    setForm({ name: contact.name || '', phone, type: 'individual' });
    setModalVisible(true);
  };

  const save = async () => {
    if (!form.name || !form.phone) return notify('Required', 'Name and phone are required');
    try {
      if (editingId) await contactsApi.update(editingId, form);
      else await contactsApi.create(form);
      setModalVisible(false);
      setEditingId(null);
      setForm({ name: '', phone: '', type: 'individual' });
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not save contact');
    }
  };

  const openTallyPicker = async () => {
    setTallyPickerVisible(true);
    setLoadingTally(true);
    setSelected({});
    try {
      const { data } = await tallyApi.getCustomers();
      setTallyContacts(data);
    } catch {
      notify('Error', 'Could not connect to Tally. Make sure Tally Prime is open and running.');
      setTallyPickerVisible(false);
    } finally {
      setLoadingTally(false);
    }
  };

  const toggleSelect = (c) => {
    setSelected(prev => {
      const key = c.name;
      if (prev[key]) { const n = { ...prev }; delete n[key]; return n; }
      return { ...prev, [key]: c };
    });
  };

  const importSelected = async () => {
    const list = Object.values(selected);
    if (!list.length) return notify('None selected', 'Tap contacts to select them first.');
    let imported = 0, skipped = 0;
    for (const c of list) {
      try {
        await contactsApi.create({ name: c.name, phone: c.phone || c.raw_phone, type: 'individual' });
        imported++;
      } catch { skipped++; }
    }
    setTallyPickerVisible(false);
    setSelected({});
    load();
    notify('Done', `${imported} imported${skipped ? `, ${skipped} skipped (already exist or no phone)` : ''}.`);
  };

  const filteredPhoneContacts = phoneContacts.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phoneNumbers?.some(p => p.number.includes(searchQuery))
  );

  return (
    <View style={styles.container}>
      <View style={styles.listSearchWrap}>
        <TextInput
          style={styles.listSearchInput}
          placeholder="🔍  Search contacts by name or number…"
          placeholderTextColor="#999"
          value={listSearch}
          onChangeText={setListSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Text style={styles.listSearchCount}>
          {listSearch ? `${filteredContacts.length} of ${contacts.length}` : `${contacts.length} contacts`}
        </Text>
      </View>
      <FlatList
        data={filteredContacts}
        keyExtractor={c => String(c.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {listSearch
              ? `No contacts match "${listSearch}".`
              : 'No contacts yet.\nTap + to add manually or import from your phone.'}
          </Text>
        }
        renderItem={({ item: c }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => openEdit(c)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{String(c.name || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.phone}>{c.phone}</Text>
              <Text style={styles.type}>{c.type}</Text>
            </View>
            <Text style={styles.editHint}>✎</Text>
            <TouchableOpacity onPress={() => confirmAction('Delete', `Remove ${c.name}?`, async () => { await contactsApi.delete(c.id); load(); }, 'Delete')}>
              <Text style={styles.del}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />

      {/* FAB + Import buttons */}
      <View style={styles.fabRow}>
        <TouchableOpacity style={styles.importBtn} onPress={openPhonePicker}>
          <Text style={styles.importBtnText}>📱 Phone</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.importBtn, { backgroundColor: '#1a6b3c' }]} onPress={openTallyPicker}>
          <Text style={styles.importBtnText}>🏦 Tally</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={openAdd}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Phone number picker (when a device contact has multiple numbers) */}
      <Modal visible={!!phonePicker} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setPhonePicker(null)}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{phonePicker?.contact?.name || 'Select number'}</Text>
            {(phonePicker?.phones || []).map((p, i) => (
              <TouchableOpacity
                key={i}
                style={styles.phoneOption}
                onPress={() => { const ctx = phonePicker; setPhonePicker(null); prefillFromContact(ctx.contact, p.number); }}
              >
                <Text style={styles.phoneOptionText}>{p.label ? `${p.label}: ` : ''}{p.number}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Manual add modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Contact' : 'Add Contact'}</Text>
            <TextInput style={styles.input} placeholder="Name" value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />
            <TextInput style={styles.input} placeholder="Phone with country code (e.g. 919876543210)" value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />
            <View style={styles.typeRow}>
              {['individual', 'group'].map(t => (
                <TouchableOpacity key={t} style={[styles.typeBtn, form.type === t && styles.typeBtnActive]} onPress={() => setForm(f => ({ ...f, type: t }))}>
                  <Text style={form.type === t ? { color: '#fff' } : {}}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setModalVisible(false); setEditingId(null); }}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={save}><Text style={{ color: '#fff' }}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tally customers picker modal */}
      <Modal visible={tallyPickerVisible} animationType="slide">
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Import from Tally</Text>
            <TouchableOpacity onPress={() => { setTallyPickerVisible(false); setTallySearch(''); setSelected({}); }}>
              <Text style={styles.pickerClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Search customer..."
            value={tallySearch}
            onChangeText={setTallySearch}
            autoFocus
          />

          {loadingTally
            ? <ActivityIndicator color="#c0392b" style={{ marginTop: 40 }} size="large" />
            : (
              <>
                <FlatList
                  data={tallyContacts.filter(c =>
                    c.name.toLowerCase().includes(tallySearch.toLowerCase()) ||
                    (c.phone || '').includes(tallySearch)
                  )}
                  keyExtractor={(c, i) => c.name + i}
                  contentContainerStyle={{ paddingBottom: 100 }}
                  ListEmptyComponent={
                    <Text style={styles.empty}>
                      {tallyContacts.length === 0
                        ? 'No customers found in Tally.\nMake sure your customers are under "Sundry Debtors" group.'
                        : 'No results'}
                    </Text>
                  }
                  renderItem={({ item: c }) => {
                    const isSelected = !!selected[c.name];
                    return (
                      <TouchableOpacity
                        style={[styles.phoneContactRow, isSelected && styles.tallyRowSelected]}
                        onPress={() => toggleSelect(c)}
                      >
                        <View style={[styles.avatar, isSelected && { backgroundColor: '#1a6b3c' }]}>
                          <Text style={styles.avatarText}>{isSelected ? '✓' : String(c.name || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>{c.name}</Text>
                          <Text style={styles.phone}>{c.phone || c.raw_phone || 'No phone in Tally'}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
                {Object.keys(selected).length > 0 && (
                  <TouchableOpacity style={styles.importAllBtn} onPress={importSelected}>
                    <Text style={styles.importAllText}>
                      Import {Object.keys(selected).length} customer{Object.keys(selected).length > 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )
          }
        </View>
      </Modal>

      {/* Phone directory picker modal */}
      <Modal visible={pickerVisible} animationType="slide">
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select Contact</Text>
            <TouchableOpacity onPress={() => { setPickerVisible(false); setSearchQuery(''); }}>
              <Text style={styles.pickerClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Search name or number..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />

          {loadingContacts
            ? <ActivityIndicator color="#c0392b" style={{ marginTop: 40 }} size="large" />
            : (
              <FlatList
                data={filteredPhoneContacts}
                keyExtractor={c => c.id}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListEmptyComponent={<Text style={styles.empty}>No contacts found</Text>}
                renderItem={({ item: c }) => (
                  <TouchableOpacity style={styles.phoneContactRow} onPress={() => selectPhoneContact(c)}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{(c.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={styles.name}>{c.name}</Text>
                      <Text style={styles.phone}>{c.phoneNumbers[0].number}{c.phoneNumbers.length > 1 ? ` +${c.phoneNumbers.length - 1} more` : ''}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )
          }
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f4f0' },
  listSearchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: '#f8f4f0' },
  listSearchInput: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#2c1810',
  },
  listSearchCount: { fontSize: 12, color: '#aaa', marginTop: 6, marginLeft: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#c0392b', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  name: { fontWeight: '700', fontSize: 16, color: '#2c1810' },
  phone: { color: '#555', marginTop: 2, fontSize: 13 },
  type: { color: '#aaa', fontSize: 12, marginTop: 1 },
  editHint: { fontSize: 18, color: '#c0392b', paddingHorizontal: 6 },
  del: { fontSize: 20, color: '#e74c3c', paddingLeft: 8 },
  empty: { textAlign: 'center', marginTop: 60, color: '#aaa', lineHeight: 24 },
  fabRow: { position: 'absolute', bottom: 28, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  importBtn: { backgroundColor: '#2c1810', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 28 },
  importBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  fab: { backgroundColor: '#c0392b', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#c0392b', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 34 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  phoneOption: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  phoneOptionText: { fontSize: 15, fontWeight: '600', color: '#2c1810' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#2c1810' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 16 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
  typeBtnActive: { backgroundColor: '#c0392b', borderColor: '#c0392b' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  btnPrimary: { backgroundColor: '#c0392b', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnSecondary: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd' },
  pickerContainer: { flex: 1, backgroundColor: '#f8f4f0' },
  pickerHeader: { backgroundColor: '#c0392b', padding: 20, paddingTop: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  pickerClose: { color: '#fff', fontSize: 22, fontWeight: '700' },
  searchInput: { margin: 16, padding: 12, backgroundColor: '#fff', borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  phoneContactRow: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, gap: 12 },
  tallyRowSelected: { backgroundColor: '#f0fff6', borderWidth: 1, borderColor: '#1a6b3c' },
  importAllBtn: { position: 'absolute', bottom: 28, left: 16, right: 16, backgroundColor: '#1a6b3c', padding: 16, borderRadius: 14, alignItems: 'center' },
  importAllText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
