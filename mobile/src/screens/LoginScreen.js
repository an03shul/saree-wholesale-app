import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, setAuthToken } from '../api/client';
import { colors, shadow } from '../constants/theme';

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = async () => {
    if (!username.trim() || !pin.trim()) { setError('Enter your username and PIN'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await authApi.login(username.trim().toLowerCase(), pin.trim());
      await AsyncStorage.setItem('auth_token', data.token);
      await AsyncStorage.setItem('auth_user', JSON.stringify(data.user));
      setAuthToken(data.token);
      onLogin(data.user);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />

        <View style={styles.divider} />

        <Text style={styles.welcomeText}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to manage your catalog</Text>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. admin"
            placeholderTextColor={colors.textSecondary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your PIN"
            placeholderTextColor={colors.textSecondary}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.btn} onPress={login} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Sign In</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...shadow.medium,
  },
  logo: { width: 200, height: 200, marginBottom: 4 },
  divider: { width: 40, height: 3, backgroundColor: colors.gold, borderRadius: 2, marginBottom: 20 },
  welcomeText: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 4, letterSpacing: 0.3 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 28 },
  inputWrapper: { width: '100%', marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  error: { color: colors.danger, marginBottom: 12, fontSize: 14, textAlign: 'center' },
  btn: {
    backgroundColor: colors.primary,
    width: '100%',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    ...shadow.small,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
});
