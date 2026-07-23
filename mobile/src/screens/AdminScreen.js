import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, ActivityIndicator, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { adminApi, authApi, setAuthToken, settingsApi, brandsApi, attendanceApi } from '../api/client';
import { confirmAction, notify } from '../utils/share';
import { parseServerDate } from '../utils/date';

export default function AdminScreen({ user, onLogout }) {
  const [tab, setTab] = useState('staffwatch'); // 'staffwatch' | 'activity' | 'users' | 'template'
  const [template, setTemplate] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [changePinModal, setChangePinModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({ username: '', pin: '', role: 'staff', brand_id: null });
  const [brands, setBrands] = useState([]);
  const [newPin, setNewPin] = useState('');
  const [changePinForm, setChangePinForm] = useState({ current: '', next: '' });
  const [staffAct, setStaffAct] = useState([]);
  const [feedUser, setFeedUser] = useState(null);
  const [feed, setFeed] = useState([]);
  const [attMonth, setAttMonth] = useState(() => {
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    return ist.toISOString().slice(0, 7); // current IST month YYYY-MM
  });
  const [attRows, setAttRows] = useState([]);
  const [attEditUser, setAttEditUser] = useState(null);

  const loadAttendance = useCallback(async (month) => {
    setLoading(true);
    try {
      const { data } = await attendanceApi.month(month);
      setAttRows(data.rows || []);
    } catch { notify('Error', 'Could not load attendance'); }
    finally { setLoading(false); }
  }, []);

  const loadStaffAct = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getStaffActivity();
      setStaffAct(data);
    } catch { notify('Error', 'Could not load staff activity'); }
    finally { setLoading(false); }
  }, []);

  const openFeed = async (u) => {
    setFeedUser(u);
    setFeed([]);
    try {
      const { data } = await adminApi.getStaffFeed(u.id);
      setFeed(data);
    } catch { notify('Error', 'Could not load activity feed'); }
  };

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getActivity(100);
      setLogs(data);
    } catch { notify('Error', 'Could not load activity log'); }
    finally { setLoading(false); }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getUsers();
      setUsers(data);
    } catch { notify('Error', 'Could not load users'); }
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
      notify('Saved', 'WhatsApp template updated');
    } catch {
      notify('Error', 'Could not save template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const switchTab = (t) => {
    setTab(t);
    if (t === 'activity') loadActivity();
    else if (t === 'staffwatch') loadStaffAct();
    else if (t === 'attendance') loadAttendance(attMonth);
    else if (t === 'users') loadUsers();
    else if (t === 'template') loadTemplate();
  };

  React.useEffect(() => {
    loadStaffAct();
    brandsApi.getAll().then(({ data }) => setBrands(data)).catch(() => {});
  }, []);

  const addUser = async () => {
    if (!form.username || !form.pin) return notify('Required', 'Username and PIN are required');
    if (form.role === 'manufacturer' && !form.brand_id) return notify('Required', 'Pick a brand for the manufacturer');
    try {
      await adminApi.addUser(form);
      setAddModal(false);
      setForm({ username: '', pin: '', role: 'staff', brand_id: null });
      loadUsers();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not add user');
    }
  };

  const deleteUser = (u) => {
    confirmAction('Remove User', `Remove ${u.username}? They will be logged out immediately.`, async () => {
      try { await adminApi.deleteUser(u.id); loadUsers(); }
      catch (e) { notify('Error', e.response?.data?.error || 'Could not remove user'); }
    }, 'Remove');
  };

  const resetPin = async () => {
    if (!newPin || newPin.length < 4) return notify('Error', 'PIN must be at least 4 digits');
    try {
      await adminApi.resetPin(selectedUser.id, newPin);
      setPinModal(false);
      setNewPin('');
      notify('Done', `PIN reset for ${selectedUser.username}`);
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not reset PIN');
    }
  };

  const changeOwnPin = async () => {
    if (!changePinForm.current || !changePinForm.next) return notify('Required', 'Fill both fields');
    if (changePinForm.next.length < 4) return notify('Error', 'New PIN must be at least 4 digits');
    try {
      await authApi.changePin(changePinForm.current, changePinForm.next);
      setChangePinModal(false);
      setChangePinForm({ current: '', next: '' });
      notify('Done', 'PIN changed successfully');
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not change PIN');
    }
  };

  const logout = () => {
    confirmAction('Log Out', 'Are you sure?', async () => {
      try { await authApi.logout(); } catch {}
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('auth_user');
      setAuthToken(null);
      onLogout();
    }, 'Log Out');
  };

  const formatTime = (ts) => {
    const d = parseServerDate(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const relTime = (ts) => {
    if (!ts) return 'no activity yet';
    const m = Math.floor((Date.now() - parseServerDate(ts).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const statusColor = (ts) => {
    if (!ts) return '#bbb';
    const m = (Date.now() - parseServerDate(ts).getTime()) / 60000;
    if (m < 15) return '#27ae60';   // active
    if (m < 120) return '#f39c12';  // idle a while
    return '#e74c3c';               // stale
  };

  const monthLabel = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };
  const changeMonth = (delta) => {
    const [y, m] = attMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setAttMonth(ym);
    loadAttendance(ym);
  };
  const istTodayStr = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const attByUser = () => {
    const map = {};
    attRows.forEach(r => {
      if (!map[r.user_id]) map[r.user_id] = { user_id: r.user_id, username: r.username, days: [] };
      if (r.date) map[r.user_id].days.push({ date: r.date, verified: r.lat != null });
    });
    return Object.values(map).sort((a, b) => a.username.localeCompare(b.username));
  };
  const toggleDay = async (userId, dayNum, staffDays) => {
    const dateStr = `${attMonth}-${String(dayNum).padStart(2, '0')}`;
    const existing = staffDays.find(d => d.date === dateStr);
    if (existing?.verified) return notify('Geo-verified', 'This is a real check-in from the shop — it can’t be changed.');
    try {
      if (existing) await attendanceApi.adminUnmark(userId, dateStr);
      else {
        if (dateStr > istTodayStr()) return notify('Not allowed', 'Can’t mark a future date.');
        await attendanceApi.adminMark(userId, dateStr);
      }
      await loadAttendance(attMonth);
    } catch (e) { notify('Error', e.response?.data?.error || 'Could not update attendance'); }
  };
  const shareReport = async (list) => {
    const lines = ['Gopiram Sarees — Attendance', monthLabel(attMonth), ''];
    list.forEach(s => {
      lines.push(`${s.username}: ${s.days.length} day${s.days.length === 1 ? '' : 's'} present`);
      if (s.days.length) lines.push('  Days: ' + s.days.map(d => Number(d.date.slice(8))).join(', '));
    });
    const text = lines.join('\n');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) { await navigator.share({ title: 'Attendance', text }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(text); notify('Copied', 'Attendance report copied to clipboard'); return; }
    } catch {}
    notify('Attendance', text);
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
        {[['staffwatch','🟢 Activity'],['attendance','🗓️ Attendance'],['activity','📋 Logs'],['users','👤 Staff'],['template','💬 Template']].map(([t, label]) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => switchTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && <ActivityIndicator color="#c0392b" style={{ marginTop: 30 }} size="large" />}

      {/* Staff Activity dashboard */}
      {tab === 'staffwatch' && !loading && (
        <FlatList
          data={staffAct}
          keyExtractor={s => String(s.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListHeaderComponent={
            <View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryNum}>{staffAct.reduce((n, s) => n + (s.actions_today || 0), 0)}</Text>
                <Text style={styles.summaryLbl}>actions today</Text>
                <Text style={styles.summarySub}>{staffAct.filter(s => (s.actions_today || 0) > 0).length} of {staffAct.length} staff active today</Text>
              </View>
              <Text style={styles.watchHint}>Tap a name to see today’s actions. Counts real work in the app — not just having it open.</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No staff added yet</Text>}
          renderItem={({ item: s }) => (
            <TouchableOpacity style={styles.watchCard} onPress={() => openFeed(s)}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(s.last_active) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{s.username}</Text>
                <Text style={styles.watchSub}>{relTime(s.last_active)}</Text>
                <Text style={styles.loginLine}>🔑 {s.login_at ? `Logged in ${formatTime(s.login_at)}` : 'not logged in'}</Text>
              </View>
              <View style={styles.countPill}>
                <Text style={styles.countNum}>{s.actions_today}</Text>
                <Text style={styles.countLbl}>today</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Attendance (geo-verified daily check-ins) */}
      {tab === 'attendance' && !loading && (() => {
        const list = attByUser();
        return (
          <FlatList
            data={list}
            keyExtractor={s => s.username}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            ListHeaderComponent={
              <View>
                <View style={styles.monthBar}>
                  <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthNav}><Text style={styles.monthNavTxt}>‹</Text></TouchableOpacity>
                  <Text style={styles.monthLbl}>{monthLabel(attMonth)}</Text>
                  <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthNav}><Text style={styles.monthNavTxt}>›</Text></TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.shareBtn} onPress={() => shareReport(list)}>
                  <Text style={styles.shareBtnTxt}>⇪  Share month report</Text>
                </TouchableOpacity>
                <Text style={styles.watchHint}>Each day = one geo-verified check-in from the shop. Tap a staff member to mark them present manually (e.g. their phone can’t use GPS). Only you (admin) can view or share this.</Text>
              </View>
            }
            ListEmptyComponent={<Text style={styles.empty}>No staff</Text>}
            renderItem={({ item: s }) => (
              <TouchableOpacity style={styles.watchCard} onPress={() => setAttEditUser({ user_id: s.user_id, username: s.username })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{s.username}</Text>
                  <Text style={styles.attDays}>{s.days.length ? s.days.map(d => Number(d.date.slice(8))).join(', ') : 'absent all month'}</Text>
                </View>
                <View style={styles.countPill}>
                  <Text style={styles.countNum}>{s.days.length}</Text>
                  <Text style={styles.countLbl}>days</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        );
      })()}

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
                  <Text style={styles.avatarText}>{String(l.username || '?').charAt(0).toUpperCase()}</Text>
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
                  <Text style={styles.avatarText}>{String(u.username || '?').charAt(0).toUpperCase()}</Text>
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

      {/* Staff activity feed modal */}
      <Modal visible={!!feedUser} transparent animationType="slide" onRequestClose={() => setFeedUser(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { maxHeight: '75%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>{feedUser?.username} · today</Text>
              <TouchableOpacity onPress={() => setFeedUser(null)}><Text style={{ fontSize: 20, color: '#888' }}>✕</Text></TouchableOpacity>
            </View>
            <FlatList
              data={feed}
              keyExtractor={f => String(f.id)}
              ListEmptyComponent={<Text style={styles.empty}>No actions recorded today</Text>}
              renderItem={({ item: f }) => (
                <View style={styles.feedRow}>
                  <Text style={styles.feedAction}>{f.action}</Text>
                  <Text style={styles.logTime}>{formatTime(f.created_at)}</Text>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Attendance day editor (admin manual mark / unmark) */}
      <Modal visible={!!attEditUser} transparent animationType="slide" onRequestClose={() => setAttEditUser(null)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { maxHeight: '80%' }]}>
            {attEditUser && (() => {
              const staff = attByUser().find(u => u.user_id === attEditUser.user_id) || { days: [] };
              const y = Number(attMonth.slice(0, 4)), m = Number(attMonth.slice(5, 7));
              const dim = new Date(y, m, 0).getDate();
              const dayStatus = {};
              staff.days.forEach(d => { dayStatus[Number(d.date.slice(8))] = d.verified ? 'verified' : 'manual'; });
              const today = istTodayStr();
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.modalTitle}>{attEditUser.username} · {monthLabel(attMonth)}</Text>
                    <TouchableOpacity onPress={() => setAttEditUser(null)}><Text style={{ fontSize: 20, color: '#888' }}>✕</Text></TouchableOpacity>
                  </View>
                  <Text style={styles.watchHint}>Tap a day to mark present / remove. Green = geo-verified (locked). Maroon = marked by you.</Text>
                  <ScrollView>
                    <View style={styles.dayGrid}>
                      {Array.from({ length: dim }, (_, i) => i + 1).map(dnum => {
                        const dateStr = `${attMonth}-${String(dnum).padStart(2, '0')}`;
                        const st = dayStatus[dnum]; // 'verified' | 'manual' | undefined
                        const future = dateStr > today;
                        return (
                          <TouchableOpacity key={dnum} disabled={future && !st}
                            onPress={() => toggleDay(attEditUser.user_id, dnum, staff.days)}
                            style={[styles.dayChip, st === 'verified' && styles.dayVerified, st === 'manual' && styles.dayManual, future && !st && styles.dayFuture]}>
                            <Text style={[styles.dayChipTxt, st && { color: '#fff' }]}>{dnum}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

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
              {['staff', 'staff2', 'accountant', 'manufacturer', 'admin'].map(r => (
                <TouchableOpacity key={r} style={[styles.roleBtn, form.role === r && styles.roleBtnActive]}
                  onPress={() => setForm(f => ({ ...f, role: r, brand_id: null }))}>
                  <Text style={form.role === r ? { color: '#fff' } : {}}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.role === 'staff2' && (
              <Text style={styles.roleHint}>staff2 can only see rates, tasks & order inquiries.</Text>
            )}
            {form.role === 'accountant' && (
              <Text style={styles.roleHint}>accountant can edit design rates & upload discount docs.</Text>
            )}
            {form.role === 'manufacturer' && (
              <>
                <Text style={styles.roleHint}>manufacturer uploads invoices & dispatch photos for their brand, and sees its stock & sales. Pick their brand:</Text>
                <View style={styles.roleRow}>
                  {brands.map(b => (
                    <TouchableOpacity key={b.id} style={[styles.roleBtn, form.brand_id === b.id && styles.roleBtnActive]}
                      onPress={() => setForm(f => ({ ...f, brand_id: b.id }))}>
                      <Text style={form.brand_id === b.id ? { color: '#fff' } : {}}>{b.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
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
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  roleHint: { fontSize: 12, color: '#888', marginBottom: 16, fontStyle: 'italic' },
  roleBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
  roleBtnActive: { backgroundColor: '#c0392b', borderColor: '#c0392b' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  btnPrimary: { backgroundColor: '#c0392b', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnSecondary: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd' },
  changePinLink: { marginBottom: 16 },
  changePinLinkText: { color: '#c0392b', fontWeight: '600', fontSize: 14 },
  // Horizontal ScrollView collapses to a sliver in this column layout unless its
  // height is pinned — keep it fixed so the tab row is never clipped.
  tabScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee', flexGrow: 0, flexShrink: 0, height: 52 },
  templateTitle: { fontSize: 18, fontWeight: '800', color: '#2c1810', marginBottom: 12 },
  templateHint: { fontSize: 13, color: '#666', backgroundColor: '#f5f0eb', padding: 12, borderRadius: 10, marginBottom: 16, lineHeight: 22 },
  varName: { color: '#8B1A2B', fontWeight: '700' },
  templateInput: { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 15, minHeight: 160, marginBottom: 20, color: '#1A0A0D', backgroundColor: '#FAF7F2', lineHeight: 22 },
  summaryCard: { backgroundColor: '#8B1A2B', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
  summaryNum: { color: '#fff', fontSize: 38, fontWeight: '800', lineHeight: 42 },
  summaryLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  summarySub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 },
  watchHint: { fontSize: 12, color: '#888', backgroundColor: '#f5f0eb', padding: 10, borderRadius: 10, marginBottom: 10, lineHeight: 18 },
  watchCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  watchSub: { color: '#888', fontSize: 13, marginTop: 2 },
  loginLine: { color: '#aaa', fontSize: 12, marginTop: 3 },
  countPill: { alignItems: 'center', minWidth: 48 },
  countNum: { fontSize: 20, fontWeight: '800', color: '#8B1A2B' },
  countLbl: { fontSize: 10, color: '#aaa', textTransform: 'uppercase' },
  feedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0ece6' },
  feedAction: { color: '#2c1810', fontSize: 14, flex: 1 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthNav: { paddingHorizontal: 16, paddingVertical: 6 },
  monthNavTxt: { fontSize: 28, color: '#8B1A2B', fontWeight: '700', lineHeight: 30 },
  monthLbl: { fontSize: 17, fontWeight: '800', color: '#2c1810' },
  shareBtn: { backgroundColor: '#8B1A2B', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 12 },
  shareBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  attDays: { color: '#888', fontSize: 12, marginTop: 3, lineHeight: 17 },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  dayChip: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  dayVerified: { backgroundColor: '#27ae60', borderColor: '#27ae60' },
  dayManual: { backgroundColor: '#8B1A2B', borderColor: '#8B1A2B' },
  dayFuture: { opacity: 0.3 },
  dayChipTxt: { color: '#444', fontWeight: '700' },
});
