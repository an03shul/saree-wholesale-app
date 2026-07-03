import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Modal, RefreshControl, ScrollView,
} from 'react-native';
import { tasksApi, adminApi, designsApi, ordersApi } from '../api/client';
import { confirmAction, notify } from '../utils/share';
import { parseServerDate } from '../utils/date';
import { useUser, useTasksBadge } from '../../App';
import { colors, shadow, modalBase } from '../constants/theme';

const DUE_CHIPS = [
  { key: 'none', label: 'No date', days: null },
  { key: 'today', label: 'Today', days: 0 },
  { key: 'tomorrow', label: 'Tomorrow', days: 1 },
  { key: '3', label: 'In 3 days', days: 3 },
  { key: '7', label: 'In 1 week', days: 7 },
];

// Local YYYY-MM-DD for `daysFromNow` days out (null → no due date).
function dateForDays(days) {
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Overdue / due-soon info for a pending task's date badge.
function dueInfo(dueDate, status) {
  if (!dueDate || status === 'done') return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${String(dueDate).slice(0, 10)}T00:00:00`);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return { label: 'Overdue', kind: 'overdue' };
  if (diff === 0) return { label: 'Due today', kind: 'today' };
  if (diff === 1) return { label: 'Due tomorrow', kind: 'soon' };
  return { label: 'Due ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), kind: 'later' };
}
const DUE_STYLES = {
  overdue: { bg: '#FDECEA', text: '#C0392B' },
  today:   { bg: '#FFF4E0', text: '#B8860B' },
  soon:    { bg: '#FFF8E1', text: '#8A6D00' },
  later:   { bg: '#EEF2F7', text: '#5B6B7B' },
};

const emptyForm = { title: '', description: '', dueDate: null, linkType: 'none', design: null, order: null };

export default function TasksScreen({ navigation }) {
  const user = useUser();
  const isAdmin = user?.role === 'admin';
  const { refresh: refreshBadge } = useTasksBadge();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending');

  // Assign / edit modal (admin)
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null); // null = create
  const [form, setForm] = useState(emptyForm);
  const [selectedIds, setSelectedIds] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [saving, setSaving] = useState(false);

  // Link pickers
  const [designQuery, setDesignQuery] = useState('');
  const [designResults, setDesignResults] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderQuery, setOrderQuery] = useState('');
  const searchTimer = useRef(null);

  // Complete modal (assignee/admin)
  const [completeTask, setCompleteTask] = useState(null);
  const [completeNote, setCompleteNote] = useState('');
  const [completing, setCompleting] = useState(false);

  // Detail modal (staff viewing a done task)
  const [detailTask, setDetailTask] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await tasksApi.getAll();
      setTasks(data);
      refreshBadge();
    } catch {
      notify('Error', 'Could not load tasks');
    } finally {
      setLoading(false);
    }
  }, [refreshBadge]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // ---- Assign / edit ----
  const openAddModal = async () => {
    setEditingTask(null);
    setForm(emptyForm);
    setSelectedIds([]);
    setDesignQuery(''); setDesignResults([]); setOrderQuery('');
    setTaskModal(true);
    try {
      const [{ data: users }, { data: ords }] = await Promise.all([adminApi.getUsers(), ordersApi.getAll()]);
      setAssignableUsers(users.filter(u => u.role !== 'admin'));
      setOrders(ords);
    } catch { setAssignableUsers([]); setOrders([]); }
  };

  const openEditModal = async (task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      dueDate: task.due_date ? String(task.due_date).slice(0, 10) : null,
      linkType: task.design_id ? 'design' : task.order_id ? 'order' : 'none',
      design: task.design_id ? { id: task.design_id, design_number: task.design_number } : null,
      order: task.order_id ? { id: task.order_id, customer_name: task.order_customer } : null,
    });
    setSelectedIds([task.assigned_to]);
    setDesignQuery(''); setDesignResults([]); setOrderQuery('');
    setTaskModal(true);
    try {
      const [{ data: users }, { data: ords }] = await Promise.all([adminApi.getUsers(), ordersApi.getAll()]);
      setAssignableUsers(users.filter(u => u.role !== 'admin'));
      setOrders(ords);
    } catch { setAssignableUsers([]); setOrders([]); }
  };

  const toggleAssignee = (id) => {
    if (editingTask) { setSelectedIds([id]); return; } // edit = single assignee
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const allSelected = assignableUsers.length > 0 && selectedIds.length === assignableUsers.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : assignableUsers.map(u => u.id));

  const searchDesigns = (q) => {
    setDesignQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setDesignResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try { const { data } = await designsApi.search(q.trim()); setDesignResults(data); } catch {}
    }, 250);
  };

  const linkPayload = () => ({
    design_id: form.linkType === 'design' ? form.design?.id || null : null,
    order_id: form.linkType === 'order' ? form.order?.id || null : null,
  });

  const saveTask = async () => {
    if (!form.title.trim()) return notify('Required', 'Enter a task title');
    if (selectedIds.length === 0) return notify('Required', editingTask ? 'Pick an assignee' : 'Tag at least one staff member');
    setSaving(true);
    try {
      const base = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.dueDate || null,
        ...linkPayload(),
      };
      if (editingTask) {
        await tasksApi.update(editingTask.id, { ...base, assigned_to: selectedIds[0] });
      } else {
        await Promise.all(selectedIds.map(id => tasksApi.create({ ...base, assigned_to: id })));
      }
      setTaskModal(false);
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || 'Could not save task');
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = (task) => {
    confirmAction('Delete Task', `Delete "${task.title}"?`, async () => {
      try { await tasksApi.delete(task.id); setTaskModal(false); load(); }
      catch { notify('Error', 'Could not delete task'); }
    }, 'Delete');
  };

  // ---- Complete / reopen ----
  const openCompleteModal = (task) => {
    setCompleteTask(task); setCompleteNote('');
  };

  const submitComplete = async () => {
    setCompleting(true);
    try {
      await tasksApi.complete(completeTask.id, { completion_note: completeNote.trim() || undefined });
      setCompleteTask(null);
      load();
    } catch (e) {
      notify('Error', e.response?.data?.error || e.message || 'Could not mark done');
    } finally {
      setCompleting(false);
    }
  };

  const reopenTask = async (task) => {
    try {
      await tasksApi.reopen(task.id);
      setDetailTask(null); setTaskModal(false);
      load();
    } catch { notify('Error', 'Could not reopen task'); }
  };

  // ---- Card tap routing ----
  const onCheckbox = (task) => {
    if (task.status === 'done') reopenTask(task);
    else openCompleteModal(task);
  };
  const onBody = (task) => {
    if (isAdmin) openEditModal(task);
    else if (task.status === 'done') setDetailTask(task);
    else openCompleteModal(task);
  };

  const fmtDate = (dt) => parseServerDate(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const fmtDateTime = (dt) => {
    const d = parseServerDate(dt);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const filteredTasks = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const countFor = (s) => s === 'all' ? tasks.length : tasks.filter(t => t.status === s).length;

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.primary} />;

  const LinkChip = ({ task }) => {
    if (task.design_id && task.design_number) {
      return <View style={styles.linkChip}><Text style={styles.linkChipText}>🧵 Design {task.design_number}</Text></View>;
    }
    if (task.order_id) {
      return <View style={styles.linkChip}><Text style={styles.linkChipText}>📋 {task.order_customer || 'Order'}</Text></View>;
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' }}>
          {['pending', 'done', 'all'].map(s => {
            const active = filter === s;
            return (
              <TouchableOpacity key={s} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(s)}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} ({countFor(s)})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filteredTasks}
        keyExtractor={t => String(t.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>No tasks {filter !== 'all' ? filter : 'yet'}</Text>
            <Text style={styles.emptySubtitle}>
              {isAdmin ? 'Tap + to assign a task to your staff' : 'Tasks assigned to you will appear here'}
            </Text>
          </View>
        }
        renderItem={({ item: task }) => {
          const done = task.status === 'done';
          const di = dueInfo(task.due_date, task.status);
          return (
            <View style={styles.card}>
              <TouchableOpacity onPress={() => onCheckbox(task)} style={[styles.checkbox, done && styles.checkboxDone]}>
                {done && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.7}
                onPress={() => onBody(task)}
                onLongPress={() => isAdmin && deleteTask(task)}
              >
                <Text style={[styles.title, done && styles.titleDone]}>{task.title}</Text>
                {task.description ? (
                  <Text style={[styles.desc, done && styles.descDone]} numberOfLines={3}>{task.description}</Text>
                ) : null}

                {(di || task.design_id || task.order_id) && (
                  <View style={styles.badgeRow}>
                    {di && (
                      <View style={[styles.dueBadge, { backgroundColor: DUE_STYLES[di.kind].bg }]}>
                        <Text style={[styles.dueBadgeText, { color: DUE_STYLES[di.kind].text }]}>{di.label}</Text>
                      </View>
                    )}
                    <LinkChip task={task} />
                  </View>
                )}

                {done && task.completion_note ? (
                  <Text style={styles.proofNote} numberOfLines={2}>“{task.completion_note}”</Text>
                ) : null}

                <View style={styles.metaRow}>
                  {isAdmin && task.assigned_to_name ? (
                    <Text style={styles.assignee}>👤 {task.assigned_to_name}</Text>
                  ) : (
                    <Text style={styles.assignee}>From {task.assigned_by_name || 'admin'}</Text>
                  )}
                  <Text style={styles.date}>{done && task.completed_at ? `✓ ${fmtDateTime(task.completed_at)}` : fmtDate(task.created_at)}</Text>
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Assign / Edit modal */}
      <Modal visible={taskModal} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }} keyboardShouldPersistTaps="handled">
            <View style={modalBase.sheet}>
              <Text style={modalBase.title}>{editingTask ? 'Edit Task' : 'Assign Task'}</Text>
              <TextInput style={modalBase.input} placeholder="Task title *" placeholderTextColor={colors.textSecondary}
                value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />
              <TextInput style={[modalBase.input, { height: 72 }]} placeholder="Details (optional)" placeholderTextColor={colors.textSecondary}
                value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline textAlignVertical="top" />

              {/* Due date */}
              <Text style={styles.pickLabel}>Due date</Text>
              <View style={styles.chipsWrap}>
                {DUE_CHIPS.map(c => {
                  const on = form.dueDate === dateForDays(c.days) || (c.days == null && !form.dueDate);
                  return (
                    <TouchableOpacity key={c.key} style={[styles.pill, on && styles.pillOn]} onPress={() => setForm(f => ({ ...f, dueDate: dateForDays(c.days) }))}>
                      <Text style={[styles.pillText, on && styles.pillTextOn]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Link */}
              <Text style={styles.pickLabel}>Link to (optional)</Text>
              <View style={styles.chipsWrap}>
                {[['none', 'None'], ['design', 'Design'], ['order', 'Order']].map(([k, label]) => (
                  <TouchableOpacity key={k} style={[styles.pill, form.linkType === k && styles.pillOn]}
                    onPress={() => setForm(f => ({ ...f, linkType: k }))}>
                    <Text style={[styles.pillText, form.linkType === k && styles.pillTextOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {form.linkType === 'design' && (
                <View style={styles.pickerBox}>
                  {form.design ? (
                    <View style={styles.selectedRow}>
                      <Text style={styles.selectedText}>🧵 Design {form.design.design_number}</Text>
                      <TouchableOpacity onPress={() => setForm(f => ({ ...f, design: null }))}><Text style={styles.clearX}>✕</Text></TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <TextInput style={[modalBase.input, { marginBottom: 6 }]} placeholder="Search design no. / item / brand…"
                        placeholderTextColor={colors.textSecondary} value={designQuery} onChangeText={searchDesigns} />
                      {designResults.slice(0, 6).map(d => (
                        <TouchableOpacity key={d.id} style={styles.pickerRow} onPress={() => setForm(f => ({ ...f, design: d }))}>
                          <Text style={styles.pickerName}>Design {d.design_number}</Text>
                          <Text style={styles.pickerSub}>{d.item_name} · {d.brand_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </View>
              )}
              {form.linkType === 'order' && (
                <View style={styles.pickerBox}>
                  {form.order ? (
                    <View style={styles.selectedRow}>
                      <Text style={styles.selectedText}>📋 {form.order.customer_name || 'Order'}</Text>
                      <TouchableOpacity onPress={() => setForm(f => ({ ...f, order: null }))}><Text style={styles.clearX}>✕</Text></TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <TextInput style={[modalBase.input, { marginBottom: 6 }]} placeholder="Search customer name…"
                        placeholderTextColor={colors.textSecondary} value={orderQuery} onChangeText={setOrderQuery} />
                      {orders.filter(o => !orderQuery.trim() || (o.customer_name || '').toLowerCase().includes(orderQuery.toLowerCase()) || String(o.customer_phone || '').includes(orderQuery)).slice(0, 6).map(o => (
                        <TouchableOpacity key={o.id} style={styles.pickerRow} onPress={() => setForm(f => ({ ...f, order: o }))}>
                          <Text style={styles.pickerName}>{o.customer_name}</Text>
                          <Text style={styles.pickerSub}>{o.design_number ? `Design ${o.design_number} · ` : ''}{o.status}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </View>
              )}

              {/* Assignees */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text style={styles.pickLabel}>{editingTask ? 'Assign to' : 'Tag staff'}</Text>
                {!editingTask && assignableUsers.length > 1 && (
                  <TouchableOpacity onPress={toggleSelectAll}><Text style={styles.selectAll}>{allSelected ? 'Clear all' : 'Select all'}</Text></TouchableOpacity>
                )}
              </View>
              {assignableUsers.length === 0 ? (
                <Text style={styles.noUsers}>No staff accounts yet. Add staff in Admin Panel.</Text>
              ) : (
                <View style={styles.chipsWrap}>
                  {assignableUsers.map(u => {
                    const on = selectedIds.includes(u.id);
                    return (
                      <TouchableOpacity key={u.id} style={[styles.userChip, on && styles.userChipOn]} onPress={() => toggleAssignee(u.id)}>
                        <Text style={[styles.userChipText, on && styles.userChipTextOn]}>
                          {on ? '✓ ' : ''}{u.username}{u.role === 'staff2' ? ' (staff2)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={[modalBase.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
                {editingTask ? (
                  <TouchableOpacity onPress={() => deleteTask(editingTask)}><Text style={{ color: colors.danger, fontWeight: '700' }}>Delete</Text></TouchableOpacity>
                ) : <View />}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setTaskModal(false)}>
                    <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={modalBase.btnPrimary} onPress={saveTask} disabled={saving}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : editingTask ? 'Save' : 'Assign'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Complete modal */}
      <Modal visible={!!completeTask} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }} keyboardShouldPersistTaps="handled">
            <View style={modalBase.sheet}>
              <Text style={modalBase.title}>Complete Task</Text>
              <Text style={styles.completeTitle}>{completeTask?.title}</Text>
              <TextInput style={[modalBase.input, { height: 72 }]} placeholder="Add a note (optional)" placeholderTextColor={colors.textSecondary}
                value={completeNote} onChangeText={setCompleteNote} multiline textAlignVertical="top" />
              <View style={modalBase.row}>
                <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setCompleteTask(null)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[modalBase.btnPrimary, { backgroundColor: '#2E7D32' }]} onPress={submitComplete} disabled={completing}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{completing ? 'Saving…' : '✓ Mark Done'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Detail modal (staff viewing a done task) */}
      <Modal visible={!!detailTask} transparent animationType="slide">
        <View style={modalBase.overlay}>
          <View style={modalBase.sheet}>
            <Text style={modalBase.title}>{detailTask?.title}</Text>
            {detailTask?.description ? <Text style={styles.detailText}>{detailTask.description}</Text> : null}
            {detailTask?.completed_at ? <Text style={styles.detailMeta}>✓ Completed {fmtDateTime(detailTask.completed_at)}</Text> : null}
            {detailTask?.completion_note ? <Text style={styles.detailNote}>“{detailTask.completion_note}”</Text> : null}
            <View style={[modalBase.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
              <TouchableOpacity onPress={() => reopenTask(detailTask)}><Text style={{ color: colors.primary, fontWeight: '700' }}>↩ Reopen</Text></TouchableOpacity>
              <TouchableOpacity style={modalBase.btnSecondary} onPress={() => setDetailTask(null)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterBarWrap: { flexGrow: 0, flexShrink: 0, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 12, ...shadow.small },
  checkbox: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxDone: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  checkmark: { color: '#fff', fontSize: 17, fontWeight: '800' },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  titleDone: { textDecorationLine: 'line-through', color: colors.textSecondary },
  desc: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 19 },
  descDone: { textDecorationLine: 'line-through' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  dueBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dueBadgeText: { fontSize: 11, fontWeight: '800' },
  linkChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  linkChipText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  proofNote: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginTop: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  assignee: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  date: { fontSize: 12, color: colors.textSecondary },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: colors.primary, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', opacity: 0.82, ...shadow.medium, shadowColor: colors.primary },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 36 },
  pickLabel: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 6 },
  selectAll: { fontSize: 12, fontWeight: '700', color: colors.primary },
  noUsers: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 12 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background },
  pillOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  pillTextOn: { color: '#fff' },
  userChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background },
  userChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  userChipText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  userChipTextOn: { color: '#fff' },
  pickerBox: { backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 8, marginBottom: 8 },
  pickerRow: { paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  pickerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  selectedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  selectedText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  clearX: { color: colors.danger, fontSize: 16, fontWeight: '700', paddingHorizontal: 8 },
  completeTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 },
  detailText: { fontSize: 14, color: colors.textPrimary, marginBottom: 10, lineHeight: 20 },
  detailMeta: { fontSize: 13, color: '#2E7D32', fontWeight: '700', marginBottom: 10 },
  detailNote: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 12 },
});
