import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { adminApi, authApi, setAuthToken, settingsApi, brandsApi, attendanceApi, tallyApi, getThumbUrl } from '../api/client';
import { confirmAction, notify } from '../utils/share';
import { parseServerDate } from '../utils/date';
import { BarChart, HBar } from '../components/InsightCharts';

// ₹ with Indian grouping; compact for large numbers.
const inr = (n) => {
  n = Math.round(n || 0);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n % 1e7 ? 1 : 0)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n % 1e5 ? 1 : 0)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
};
const deltaPct = (cur, prev) => {
  if (!prev) return cur > 0 ? { v: 100, up: true } : null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return d === 0 ? null : { v: Math.abs(d), up: d > 0 };
};

export default function AdminScreen({ user, onLogout }) {
  const [tab, setTab] = useState('business'); // business | staffwatch | tally | ...
  const [biz, setBiz] = useState(null); // /api/admin/business-insights
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
  const [tallySync, setTallySync] = useState(null); // /api/tally/status — null until loaded
  const [subs, setSubs] = useState([]); // manufacturer design submissions awaiting review
  const [tallyVal, setTallyVal] = useState(null);   // /api/tally/value-summary
  const [tallyRecv, setTallyRecv] = useState(null); // /api/admin/tally-receivables
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

  const loadBiz = useCallback(async () => {
    setLoading(true);
    try { const { data } = await adminApi.businessInsights(); setBiz(data); }
    catch { notify('Error', 'Could not load business insights'); }
    finally { setLoading(false); }
  }, []);

  const loadTally = useCallback(async () => {
    setLoading(true);
    try {
      const [st, val, recv] = await Promise.all([
        tallyApi.getStatus().catch(() => ({ data: { synced: false } })),
        tallyApi.valueSummary().catch(() => ({ data: null })),
        adminApi.tallyReceivables().catch(() => ({ data: null })),
      ]);
      setTallySync(st.data); setTallyVal(val.data); setTallyRecv(recv.data);
    } finally { setLoading(false); }
  }, []);

  const loadSubs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getDesignSubmissions();
      setSubs(data);
    } catch { notify('Error', 'Could not load submissions'); }
    finally { setLoading(false); }
  }, []);

  const reviewSub = async (s, approve) => {
    try {
      if (approve) await adminApi.approveDesignSubmission(s.id);
      else await adminApi.rejectDesignSubmission(s.id);
      notify(approve ? 'Approved' : 'Rejected', `${s.new_item_name || s.item_name} · ${s.design_number}`);
      setSubs(prev => prev.filter(x => x.id !== s.id));
    } catch (e) { notify('Error', e.response?.data?.error || 'Action failed'); }
  };

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
    if (t === 'business') loadBiz();
    else if (t === 'activity') loadActivity();
    else if (t === 'staffwatch') loadStaffAct();
    else if (t === 'attendance') loadAttendance(attMonth);
    else if (t === 'users') loadUsers();
    else if (t === 'submissions') loadSubs();
    else if (t === 'tally') loadTally();
    else if (t === 'template') loadTemplate();
  };

  React.useEffect(() => {
    loadBiz();
    brandsApi.getAll().then(({ data }) => setBrands(data)).catch(() => {});
    tallyApi.getStatus().then(({ data }) => setTallySync(data)).catch(() => setTallySync({ synced: false }));
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

  const timeOnly = (ts) => parseServerDate(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

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
      if (r.date) map[r.user_id].days.push({ date: r.date, verified: r.lat != null, at: r.checked_in_at });
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
      [...s.days].sort((a, b) => a.date.localeCompare(b.date)).forEach(d => {
        lines.push(`  ${d.date} — ${d.verified ? timeOnly(d.at) : 'marked by admin'}`);
      });
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
        {[['business','📊 Business'],['staffwatch','🟢 Activity'],['tally','🧮 Tally'],['submissions','🧵 Submissions'],['attendance','🗓️ Attendance'],['activity','📋 Logs'],['users','👤 Staff'],['template','💬 Template']].map(([t, label]) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => switchTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tally sync health — agent pushes every ~5 min; stale = agent/Tally down at the shop */}
      {tallySync && (() => {
        const mins = tallySync.last_sync ? Math.floor((Date.now() - parseServerDate(tallySync.last_sync).getTime()) / 60000) : null;
        const ok = tallySync.synced && mins != null && mins <= 15;
        const warn = tallySync.synced && mins != null && mins > 15 && mins <= 60;
        const color = ok ? '#2E7D32' : warn ? '#B26A00' : '#c0392b';
        // Show company + sync mode (incremental/full) when the v2 agent reports them.
        const extra = [tallySync.company, tallySync.mode].filter(Boolean).join(' · ');
        const text = tallySync.synced
          ? `Tally: synced ${relTime(tallySync.last_sync)} · ${tallySync.item_count} items${extra ? ` · ${extra}` : ''}`
          : 'Tally: never synced — is the agent running on the shop PC?';
        return (
          <View style={styles.tallyBar}>
            <View style={[styles.statusDot, { backgroundColor: color, marginRight: 8 }]} />
            <Text style={[styles.tallyBarText, { color }]} numberOfLines={1}>{text}</Text>
          </View>
        );
      })()}

      {loading && <ActivityIndicator color="#c0392b" style={{ marginTop: 30 }} size="large" />}

      {/* Owner business dashboard — shop-wide revenue, demand, top performers */}
      {tab === 'business' && !loading && biz && (() => {
        const revChg = deltaPct(biz.month.value, biz.prevMonth?.value || 0);
        const pending = biz.byStatus.find(s => s.status === 'pending')?.n || 0;
        const done = biz.byStatus.filter(s => s.status === 'confirmed' || s.status === 'dispatched').reduce((n, s) => n + s.n, 0);
        const brandMax = Math.max(1, ...(biz.topBrands || []).map(b => b.pieces));
        return (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* Revenue hero */}
            <View style={styles.bizHero}>
              <Text style={styles.bizHeroLbl}>REVENUE · LAST 30 DAYS <Text style={{ color: 'rgba(240,217,160,0.7)', fontWeight: '600' }}>(est.)</Text></Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                <Text style={styles.bizHeroNum}>{inr(biz.month.value)}</Text>
                {revChg && <Text style={[styles.bizDelta, { color: revChg.up ? '#7CFC9B' : '#FFB4A8' }]}>{revChg.up ? '▲' : '▼'} {revChg.v}%</Text>}
              </View>
              <Text style={styles.bizHeroSub}>{biz.month.pieces} pcs · {biz.month.orders} orders · vs {inr(biz.prevMonth?.value || 0)} prior 30d</Text>
            </View>

            {/* KPI tiles */}
            <View style={styles.bizKpiRow}>
              <View style={styles.bizKpi}><Text style={styles.bizKpiNum}>{biz.week.pieces}</Text><Text style={styles.bizKpiLbl}>pcs · 7d</Text></View>
              <View style={styles.bizKpi}><Text style={[styles.bizKpiNum, pending > 0 && { color: '#B26A00' }]}>{pending}</Text><Text style={styles.bizKpiLbl}>pending</Text></View>
              <View style={styles.bizKpi}><Text style={[styles.bizKpiNum, { color: '#2E7D32' }]}>{done}</Text><Text style={styles.bizKpiLbl}>fulfilled</Text></View>
            </View>

            {/* Demand trend */}
            <Text style={styles.bizSec}>Weekly demand</Text>
            <View style={styles.bizCard}><BarChart data={(biz.trend || []).map(t => ({ label: t.label, value: t.pieces }))} /></View>

            {/* Top brands */}
            {(biz.topBrands || []).length > 0 && <>
              <Text style={styles.bizSec}>Top brands · 90 days</Text>
              <View style={styles.bizCard}>{biz.topBrands.map((b, i) => <HBar key={i} label={b.name} value={b.pieces} max={brandMax} right={`${b.pieces} pcs`} />)}</View>
            </>}

            {/* Top designs */}
            {(biz.topDesigns || []).length > 0 && <>
              <Text style={styles.bizSec}>Top designs · 90 days</Text>
              <View style={styles.bizCard}>{biz.topDesigns.map((d, i) => (
                <View key={i} style={styles.bizRow}>
                  <Text style={styles.bizRowL} numberOfLines={1}>{i + 1}. {d.brand_name ? d.brand_name + ' · ' : ''}{d.item_name || ''} {d.design_number}</Text>
                  <Text style={styles.bizRowR}>{d.pieces} pcs</Text>
                </View>
              ))}</View>
            </>}

            {/* Top customers */}
            {(biz.topCustomers || []).length > 0 && <>
              <Text style={styles.bizSec}>Top customers · 90 days</Text>
              <View style={styles.bizCard}>{biz.topCustomers.map((c, i) => (
                <View key={i} style={styles.bizRow}>
                  <Text style={styles.bizRowL} numberOfLines={1}>{i + 1}. {c.name}</Text>
                  <Text style={styles.bizRowR}>{c.pieces} pcs<Text style={styles.bizRowSub}>  {c.orders} ord</Text></Text>
                </View>
              ))}</View>
            </>}

            {/* Inventory + receivables summary */}
            <Text style={styles.bizSec}>Inventory & dues (from Tally)</Text>
            <View style={styles.bizSplit}>
              <View style={[styles.bizCard, { flex: 1 }]}>
                <Text style={styles.bizMini}>{inr(biz.inventory?.total_value)}</Text>
                <Text style={styles.bizMiniLbl}>stock value</Text>
                <Text style={styles.bizMiniSub}>{biz.inventory?.out_of_stock || 0} out · {biz.inventory?.low_stock || 0} low</Text>
              </View>
              <View style={[styles.bizCard, { flex: 1 }]}>
                <Text style={[styles.bizMini, { color: '#c0392b' }]}>{inr(biz.receivables?.total)}</Text>
                <Text style={styles.bizMiniLbl}>receivables</Text>
                <Text style={styles.bizMiniSub}>{biz.receivables?.count || 0} debtors</Text>
              </View>
            </View>

            {/* Catalog totals */}
            <Text style={styles.bizFoot}>{biz.totals?.brands || 0} brands · {biz.totals?.items || 0} collections · {biz.totals?.designs || 0} designs · {biz.totals?.contacts || 0} contacts</Text>
          </ScrollView>
        );
      })()}

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
                <Text style={styles.loginLine}>{s.checkin_today ? `📍 Checked in ${timeOnly(s.checkin_today)}` : '○ not checked in today'}</Text>
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

      {/* Tally insights — sync health + inventory value + receivables */}
      {tab === 'tally' && !loading && (() => {
        const money = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
        const s = tallySync || {};
        const mins = s.last_sync ? Math.floor((Date.now() - parseServerDate(s.last_sync).getTime()) / 60000) : null;
        const healthColor = s.synced && !s.stale ? '#2E7D32' : s.synced ? '#B26A00' : '#c0392b';
        return (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* Sync health */}
            <View style={styles.tallyCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={[styles.statusDot, { backgroundColor: healthColor, marginRight: 8 }]} />
                <Text style={styles.tallyCardTitle}>Sync health</Text>
              </View>
              {s.synced ? <>
                <Text style={styles.tallyLine}>Last sync: {relTime(s.last_sync)}{s.stale ? '  ⚠️ stale (>30m)' : ''}</Text>
                <Text style={styles.tallyLine}>Company: {s.company || '—'}   ·   Mode: {s.mode || '—'}</Text>
                <Text style={styles.tallyLine}>Items cached: {s.item_count ?? '—'}   ·   Agent v{s.agent_version || '?'}</Text>
                {s.last_cycle && <Text style={styles.tallySub}>Last cycle: {s.last_cycle.stock_synced ?? 0} stock, {s.last_cycle.stock_deleted ?? 0} removed, {s.last_cycle.customers_synced ?? 0} customers</Text>}
                <Text style={styles.tallySub}>AlterID · master {s.last_alter_master ?? '—'} · voucher {s.last_alter_voucher ?? '—'}</Text>
              </> : <Text style={styles.tallyLine}>Never synced — is the agent running on the shop PC?</Text>}
            </View>

            {/* Inventory value */}
            <View style={styles.tallyCard}>
              <Text style={styles.tallyCardTitle}>Inventory value</Text>
              <Text style={styles.tallyBig}>{money(tallyVal?.total_value)}</Text>
              <Text style={styles.tallySub}>{tallyVal?.valued || 0} of {tallyVal?.items || 0} items valued by Tally</Text>
              {(tallyVal?.top || []).length > 0 && <Text style={[styles.tallyLine, { marginTop: 10, fontWeight: '800' }]}>Top by value</Text>}
              {(tallyVal?.top || []).map((it, i) => (
                <View key={i} style={styles.tallyRow}>
                  <Text style={styles.tallyRowL} numberOfLines={1}>{it.name}</Text>
                  <Text style={styles.tallyRowR}>{money(it.value)}<Text style={styles.tallyRowSub}>  {it.qty}{it.units ? ' ' + it.units : ''}</Text></Text>
                </View>
              ))}
              {!tallyVal?.valued && <Text style={styles.tallySub}>No item values yet — the v2 sync agent populates these.</Text>}
            </View>

            {/* Outstanding receivables */}
            <View style={styles.tallyCard}>
              <Text style={styles.tallyCardTitle}>Outstanding receivables</Text>
              <Text style={[styles.tallyBig, { color: '#c0392b' }]}>{money(tallyRecv?.total_outstanding)}</Text>
              <Text style={styles.tallySub}>{tallyRecv?.with_balance || 0} of {tallyRecv?.debtors || 0} debtors with a balance</Text>
              {(tallyRecv?.top || []).map((c, i) => (
                <View key={i} style={styles.tallyRow}>
                  <Text style={styles.tallyRowL} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.tallyRowR}>{money(c.balance)}</Text>
                </View>
              ))}
              {!tallyRecv?.with_balance && <Text style={styles.tallySub}>No balances yet — the v2 sync agent populates these.</Text>}
            </View>
          </ScrollView>
        );
      })()}

      {/* Manufacturer design submissions — review queue */}
      {tab === 'submissions' && !loading && (
        <FlatList
          data={subs}
          keyExtractor={s => String(s.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>No designs awaiting review</Text>}
          renderItem={({ item: s }) => (
            <View style={styles.subCard}>
              <Image source={{ uri: getThumbUrl(s.photo_path) }} style={styles.subThumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.subTitle} numberOfLines={1}>
                  {s.new_item_name ? `${s.new_item_name} (new)` : s.item_name} · {s.design_number}
                </Text>
                <Text style={styles.subMeta}>{s.brand_name} · ₹{s.rate} · {s.pcs_per_set}/set · by {s.username}</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => reviewSub(s, true)}>
                    <Text style={styles.approveText}>✓ Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => confirmAction('Reject submission', `Delete ${s.design_number}?`, () => reviewSub(s, false))}>
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
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
                    {staff.days.length > 0 && (
                      <View style={{ marginTop: 14 }}>
                        <Text style={[styles.watchHint, { marginBottom: 2 }]}>Check-in times</Text>
                        {[...staff.days].sort((a, b) => a.date.localeCompare(b.date)).map(d => (
                          <View key={d.date} style={styles.feedRow}>
                            <Text style={styles.feedAction}>{Number(d.date.slice(8))} {monthLabel(attMonth).split(' ')[0]}</Text>
                            <Text style={styles.logTime}>{d.verified ? `📍 ${timeOnly(d.at)}` : 'marked by admin'}</Text>
                          </View>
                        ))}
                      </View>
                    )}
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
  subCard: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10 },
  subThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#eee' },
  subTitle: { fontSize: 15, fontWeight: '800', color: '#2c1810' },
  subMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  approveBtn: { backgroundColor: '#2E7D32', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  approveText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  rejectBtn: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#c0392b', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  rejectText: { color: '#c0392b', fontWeight: '800', fontSize: 13 },
  bizHero: { backgroundColor: '#8B1A2B', borderRadius: 16, padding: 18, marginBottom: 12 },
  bizHeroLbl: { fontSize: 11, fontWeight: '800', color: '#F0D9A0', letterSpacing: 0.5, marginBottom: 4 },
  bizHeroNum: { fontSize: 32, fontWeight: '900', color: '#fff' },
  bizDelta: { fontSize: 14, fontWeight: '800', paddingBottom: 5 },
  bizHeroSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 6 },
  bizKpiRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  bizKpi: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center' },
  bizKpiNum: { fontSize: 22, fontWeight: '900', color: '#8B1A2B' },
  bizKpiLbl: { fontSize: 11, fontWeight: '700', color: '#888', marginTop: 2 },
  bizSec: { fontSize: 14, fontWeight: '800', color: '#2c1810', marginTop: 16, marginBottom: 8 },
  bizCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  bizRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f0eae6', gap: 10 },
  bizRowL: { flex: 1, fontSize: 13, color: '#2c1810', fontWeight: '600' },
  bizRowR: { fontSize: 13, fontWeight: '800', color: '#2c1810' },
  bizRowSub: { fontSize: 11, fontWeight: '600', color: '#999' },
  bizSplit: { flexDirection: 'row', gap: 10 },
  bizMini: { fontSize: 20, fontWeight: '900', color: '#2E7D32' },
  bizMiniLbl: { fontSize: 12, fontWeight: '700', color: '#2c1810', marginTop: 2 },
  bizMiniSub: { fontSize: 11, color: '#888', marginTop: 3 },
  bizFoot: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 18 },
  tallyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12 },
  tallyCardTitle: { fontSize: 15, fontWeight: '800', color: '#2c1810' },
  tallyBig: { fontSize: 30, fontWeight: '900', color: '#2E7D32', marginTop: 6 },
  tallyLine: { fontSize: 13, color: '#2c1810', marginTop: 3 },
  tallySub: { fontSize: 12, color: '#888', marginTop: 4 },
  tallyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f0eae6', gap: 10 },
  tallyRowL: { flex: 1, fontSize: 13, color: '#2c1810', fontWeight: '600' },
  tallyRowR: { fontSize: 13, fontWeight: '800', color: '#2c1810' },
  tallyRowSub: { fontSize: 11, fontWeight: '600', color: '#999' },
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
  tallyBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' },
  tallyBarText: { fontSize: 12, fontWeight: '700', flex: 1 },
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
