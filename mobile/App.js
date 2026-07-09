import React, { useEffect, useState, createContext, useContext } from 'react';
export const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, ActivityIndicator, View, Image, TouchableOpacity } from 'react-native';
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
import CreateFormScreen from './src/screens/CreateFormScreen';
import TasksScreen from './src/screens/TasksScreen';
import RatesScreen from './src/screens/RatesScreen';
import FilesScreen from './src/screens/FilesScreen';
import { DispatchScreen, StockScreen, SalesScreen } from './src/screens/ManufacturerScreens';
import { authApi, setAuthToken, loadStoredToken, tasksApi } from './src/api/client';
import { subscribeToPush } from './src/utils/pushSubscription';
import { confirmAction } from './src/utils/share';

// Shares the count of pending tasks (for the tab badge) and a refresh() the
// Tasks screen calls after any change. Polls every 30s so a newly assigned task
// shows up without reopening the app.
const TasksBadgeContext = createContext({ pending: 0, refresh: () => {} });
export const useTasksBadge = () => useContext(TasksBadgeContext);

function TasksBadgeProvider({ children }) {
  const [pending, setPending] = useState(0);
  const refresh = React.useCallback(async () => {
    try {
      const { data } = await tasksApi.getAll();
      setPending(data.filter(t => t.status === 'pending').length);
    } catch {}
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);
  return <TasksBadgeContext.Provider value={{ pending, refresh }}>{children}</TasksBadgeContext.Provider>;
}

// Shared logout flow (used by the header button for staff2, who have no More tab).
async function doLogout(onLogout) {
  try { await authApi.logout(); } catch {}
  await AsyncStorage.removeItem('auth_token');
  await AsyncStorage.removeItem('auth_user');
  setAuthToken(null);
  onLogout();
}

function HeaderLogoutButton({ onLogout }) {
  return (
    <TouchableOpacity
      onPress={() => confirmAction('Log Out', 'Are you sure?', () => doLogout(onLogout), 'Log Out')}
      style={{ marginRight: 14, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.18)' }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Log Out</Text>
    </TouchableOpacity>
  );
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
      <Stack.Screen name="MoreMenu" options={{ title: 'More' }}>
        {(props) => <MoreScreen {...props} onLogout={onLogout} />}
      </Stack.Screen>
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan QR' }} />
      <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Contacts' }} />
      <Stack.Screen name="Identify" component={IdentifyScreen} options={{ title: 'Identify Piece' }} />
      <Stack.Screen name="BulkImport" component={BulkImportScreen} options={{ title: 'Bulk Add Designs' }} />
      <Stack.Screen name="CreateForm" component={CreateFormScreen} options={{ title: 'Create Order Form' }} />
      <Stack.Screen name="Documents" options={{ title: 'Documents' }}>
        {() => <FilesScreen types={['invoice', 'orderform', 'discount']} emptyText="Invoices, order forms & discounts appear here" />}
      </Stack.Screen>
      <Stack.Screen name="Admin" options={{ headerShown: false }}>
        {() => <AdminScreen user={user} onLogout={onLogout} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function MainApp({ user, onLogout }) {
  const icons = { Catalog: '🧵', Orders: '📋', Tasks: '✅', Send: '📤', More: '☰' };
  const { pending } = useTasksBadge();
  const taskBadge = pending > 0 ? pending : undefined;
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
          <Tab.Screen name="Tasks" component={TasksScreen} options={{ headerShown: true, headerStyle, headerTintColor, headerTitleStyle, title: user.role === 'admin' ? 'Tasks' : 'My Tasks', tabBarBadge: taskBadge }} />
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

// Limited navigator for the 'staff2' role — rates (search only), tasks and
// order inquiries. No catalog browsing, sending, or admin tools. A header
// Log Out button replaces the More tab.
function Staff2App({ user, onLogout }) {
  const icons = { Rates: '🏷️', Tasks: '✅', Orders: '📋' };
  const headerRight = () => <HeaderLogoutButton onLogout={onLogout} />;
  const baseOpts = { headerShown: true, headerStyle, headerTintColor, headerTitleStyle, headerRight };
  const { pending } = useTasksBadge();
  const taskBadge = pending > 0 ? pending : undefined;
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
          <Tab.Screen name="Rates" component={RatesScreen} options={{ ...baseOpts, title: 'Rates' }} />
          <Tab.Screen name="Tasks" component={TasksScreen} options={{ ...baseOpts, title: 'My Tasks', tabBarBadge: taskBadge }} />
          <Tab.Screen name="Orders" component={OrdersScreen} options={{ ...baseOpts, title: 'Order Inquiries' }} />
        </Tab.Navigator>
      </NavigationContainer>
      <BrandFooter />
    </View>
  );
}

// Limited navigator for the 'accountant' role — edit design rates and upload
// discount docs. No catalog, orders, tasks, or admin.
function AccountantApp({ user, onLogout }) {
  const icons = { Rates: '🏷️', Discounts: '🧾', Invoices: '📄' };
  const headerRight = () => <HeaderLogoutButton onLogout={onLogout} />;
  const baseOpts = { headerShown: true, headerStyle, headerTintColor, headerTitleStyle, headerRight };
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
          <Tab.Screen name="Rates" component={RatesScreen} options={{ ...baseOpts, title: 'Edit Rates' }} />
          <Tab.Screen name="Discounts" options={{ ...baseOpts, title: 'Discounts' }}>
            {() => <FilesScreen types={['discount']} canUpload uploadType="discount" allowBrandTag emptyText="Upload a discount doc from a manufacturer" />}
          </Tab.Screen>
          <Tab.Screen name="Invoices" options={{ ...baseOpts, title: 'Invoices' }}>
            {() => <FilesScreen types={['invoice', 'orderform']} emptyText="Manufacturer invoices & order forms appear here" />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
      <BrandFooter />
    </View>
  );
}

// Limited navigator for the 'manufacturer' (Surat) role — upload dispatch photos
// + invoices/order-forms for their brand, and see its stock & sales. Read-only otherwise.
function ManufacturerApp({ user, onLogout }) {
  const icons = { Dispatch: '📷', Invoices: '📄', Stock: '📦', Sales: '🧾' };
  const headerRight = () => <HeaderLogoutButton onLogout={onLogout} />;
  const baseOpts = { headerShown: true, headerStyle, headerTintColor, headerTitleStyle, headerRight };
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
          <Tab.Screen name="Dispatch" component={DispatchScreen} options={{ ...baseOpts, title: 'Dispatch Photo' }} />
          <Tab.Screen name="Invoices" options={{ ...baseOpts, title: 'Invoices' }}>
            {() => <FilesScreen types={['invoice', 'orderform']} canUpload uploadTypes={['invoice', 'orderform']} emptyText="Upload your invoices & order forms" />}
          </Tab.Screen>
          <Tab.Screen name="Stock" component={StockScreen} options={{ ...baseOpts, title: 'My Stock' }} />
          <Tab.Screen name="Sales" component={SalesScreen} options={{ ...baseOpts, title: 'My Sales' }} />
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
      <TasksBadgeProvider>
        {user.role === 'staff2'
          ? <Staff2App user={user} onLogout={handleLogout} />
          : user.role === 'accountant'
          ? <AccountantApp user={user} onLogout={handleLogout} />
          : user.role === 'manufacturer'
          ? <ManufacturerApp user={user} onLogout={handleLogout} />
          : <MainApp user={user} onLogout={handleLogout} />}
      </TasksBadgeProvider>
    </UserContext.Provider>
  );
}
