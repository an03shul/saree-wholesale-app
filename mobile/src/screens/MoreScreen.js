import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../../App';
import { colors, shadow } from '../constants/theme';
import { subscribeToPush, getNotificationPermission } from '../utils/pushSubscription';
import { authApi, setAuthToken } from '../api/client';
import { confirmAction } from '../utils/share';

const MENU_ITEMS = [
  { key: 'Scan',     label: 'Scan QR Code',   icon: '📷', desc: 'Scan a design QR to look it up' },
  { key: 'Contacts', label: 'Contacts',        icon: '👥', desc: 'Manage WhatsApp contacts & groups' },
  { key: 'Identify', label: 'Identify Piece',  icon: '🔍', desc: 'Use AI to identify a saree design' },
  { key: 'BulkImport', label: 'Bulk Add Designs', icon: '⚡', desc: 'Upload many photos — AI fills the details' },
];

const ADMIN_ITEMS = [
  { key: 'Admin',    label: 'Admin Panel',     icon: '⚙️', desc: 'Users, activity log, templates' },
];

export default function MoreScreen({ navigation, onLogout }) {
  const user = useUser();
  const isAdmin = user?.role === 'admin';
  const [notifStatus, setNotifStatus] = useState('default');

  useEffect(() => {
    if (Platform.OS === 'web') setNotifStatus(getNotificationPermission());
  }, []);

  const go = (screen) => navigation.navigate(screen);

  const logout = () => {
    confirmAction('Log Out', 'Are you sure?', async () => {
      try { await authApi.logout(); } catch {}
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('auth_user');
      setAuthToken(null);
      onLogout();
    }, 'Log Out');
  };

  const handleEnableNotifications = async () => {
    const result = await subscribeToPush();
    setNotifStatus(result === 'granted' ? 'granted' : getNotificationPermission());
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text style={styles.sectionLabel}>Tools</Text>
      {MENU_ITEMS.map(item => (
        <TouchableOpacity key={item.key} style={styles.card} onPress={() => go(item.key)} activeOpacity={0.7}>
          <View style={styles.iconBox}>
            <Text style={styles.icon}>{item.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      ))}

      {Platform.OS === 'web' && notifStatus !== 'native' && notifStatus !== 'unsupported' && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Notifications</Text>
          <TouchableOpacity
            style={[styles.card, notifStatus === 'granted' && { opacity: 0.7 }]}
            onPress={notifStatus !== 'granted' ? handleEnableNotifications : undefined}
            activeOpacity={notifStatus === 'granted' ? 1 : 0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: notifStatus === 'granted' ? '#E8F5E9' : '#FFF3E0' }]}>
              <Text style={styles.icon}>{notifStatus === 'granted' ? '🔔' : '🔕'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>
                {notifStatus === 'granted' ? 'Notifications enabled' : 'Enable order notifications'}
              </Text>
              <Text style={styles.desc}>
                {notifStatus === 'granted'
                  ? 'You\'ll be notified when customers place orders'
                  : notifStatus === 'denied'
                  ? 'Blocked — allow notifications in browser settings'
                  : 'Tap to get notified when customers place orders'}
              </Text>
            </View>
            {notifStatus !== 'granted' && notifStatus !== 'denied' && <Text style={styles.arrow}>›</Text>}
          </TouchableOpacity>
        </>
      )}

      {isAdmin && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Admin</Text>
          {ADMIN_ITEMS.map(item => (
            <TouchableOpacity key={item.key} style={styles.card} onPress={() => go(item.key)} activeOpacity={0.7}>
              <View style={[styles.iconBox, { backgroundColor: '#FDF5F6' }]}>
                <Text style={styles.icon}>{item.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{item.label}</Text>
                <Text style={styles.desc}>{item.desc}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      <TouchableOpacity style={styles.logoutCard} onPress={logout} activeOpacity={0.7}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...shadow.small,
  },
  iconBox: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 24 },
  label: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  desc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  arrow: { fontSize: 24, color: colors.gold },
  logoutCard: {
    marginTop: 24, backgroundColor: colors.card, borderRadius: 16, padding: 16,
    alignItems: 'center', borderWidth: 1.5, borderColor: colors.danger,
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: colors.danger },
});
