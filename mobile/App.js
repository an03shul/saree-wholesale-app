import React, { useEffect, useState, createContext, useContext } from 'react';
export const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, ActivityIndicator, View, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BrandsScreen from './src/screens/BrandsScreen';
import ItemsScreen from './src/screens/ItemsScreen';
import DesignsScreen from './src/screens/DesignsScreen';
import SendScreen from './src/screens/SendScreen';
import ContactsScreen from './src/screens/ContactsScreen';
import IdentifyScreen from './src/screens/IdentifyScreen';
import ScanScreen from './src/screens/ScanScreen';
import LoginScreen from './src/screens/LoginScreen';
import AdminScreen from './src/screens/AdminScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import MoreScreen from './src/screens/MoreScreen';
import BulkImportScreen from './src/screens/BulkImportScreen';
import { authApi, setAuthToken, loadStoredToken } from './src/api/client';
import { Platform } from 'react-native';
import { API_BASE_URL } from './src/config';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeToPush() {
  if (Platform.OS !== 'web') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!VAPID_PUBLIC_KEY) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await fetch(`${API_BASE_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch (e) {
    console.warn('Push subscription failed:', e.message);
  }
}

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const headerStyle = { backgroundColor: '#8B1A2B' };
const headerTintColor = '#fff';
const headerTitleStyle = { fontWeight: '800', fontSize: 17, letterSpacing: 0.3 };
const HeaderLogo = () => (
  <Image
    source={require('./assets/logo.png')}
    style={{ width: 40, height: 40, borderRadius: 20, marginRight: 8, opacity: 0.92 }}
    resizeMode="contain"
  />
);

function CatalogStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle, headerTintColor, headerTitleStyle }}>
      <Stack.Screen name="Brands" component={BrandsScreen} options={{
        title: 'Gopiram Saree',
        headerLeft: () => (
          <Image source={require('./assets/logo.png')} style={{ width: 60, height: 60, marginLeft: 12 }} resizeMode="contain" />
        ),
      }} />
      <Stack.Screen name="Items" component={ItemsScreen} />
      <Stack.Screen name="Designs" component={DesignsScreen} />
    </Stack.Navigator>
  );
}

function MoreStack({ user, onLogout }) {
  return (
    <Stack.Navigator screenOptions={{ headerStyle, headerTintColor, headerTitleStyle }}>
      <Stack.Screen name="MoreMenu" component={MoreScreen} options={{ title: 'More' }} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan QR' }} />
      <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Contacts' }} />
      <Stack.Screen name="Identify" component={IdentifyScreen} options={{ title: 'Identify Piece' }} />
      <Stack.Screen name="BulkImport" component={BulkImportScreen} options={{ title: 'Bulk Add Designs' }} />
      <Stack.Screen name="Admin" options={{ headerShown: false }}>
        {() => <AdminScreen user={user} onLogout={onLogout} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function MainApp({ user, onLogout }) {
  const icons = { Catalog: '🧵', Orders: '📋', Send: '📤', More: '☰' };
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: () => <Text style={{ fontSize: 20 }}>{icons[route.name]}</Text>,
            tabBarActiveTintColor: '#8B1A2B',
            tabBarInactiveTintColor: '#B0A0A5',
            tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#EDE7E2' },
            headerShown: false,
          })}
        >
          <Tab.Screen name="Catalog" component={CatalogStack} />
          <Tab.Screen name="Orders" component={OrdersScreen} options={{ headerShown: true, headerStyle, headerTintColor, headerTitleStyle, title: 'Orders & Inquiries' }} />
          <Tab.Screen name="Send" component={SendScreen} options={{ headerShown: true, headerStyle, headerTintColor, headerTitleStyle, title: 'Send Updates' }} />
          <Tab.Screen name="More">
            {() => <MoreStack user={user} onLogout={onLogout} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
      <BrandFooter />
    </View>
  );
}

function BrandFooter() {
  return (
    <View style={{ backgroundColor: '#8B1A2B', paddingVertical: 4, alignItems: 'center' }}>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>
        Powered by Nayvert AI
      </Text>
    </View>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await loadStoredToken(); // sets token on axios before any request
        const { data } = await authApi.me();
        setUser(data.user);
        subscribeToPush();
      } catch {
        await AsyncStorage.removeItem('auth_token');
        await AsyncStorage.removeItem('auth_user');
        setAuthToken(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const handleLogin = (u) => { setUser(u); subscribeToPush(); };
  const handleLogout = () => setUser(null);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF7F2' }}>
        <ActivityIndicator size="large" color="#8B1A2B" />
      </View>
    );
  }

  if (!user) return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}><LoginScreen onLogin={handleLogin} /></View>
      <BrandFooter />
    </View>
  );
  return (
    <UserContext.Provider value={user}>
      <MainApp user={user} onLogout={handleLogout} />
    </UserContext.Provider>
  );
}
