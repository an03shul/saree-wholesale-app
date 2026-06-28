import { Platform } from 'react-native';
import { API_BASE_URL } from '../config';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function subscribeToPush() {
  if (Platform.OS !== 'web') return 'native';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'no-vapid-key';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  try {
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
    return 'granted';
  } catch (e) {
    console.warn('Push subscription error:', e.message);
    return 'error';
  }
}

export function getNotificationPermission() {
  if (Platform.OS !== 'web') return 'native';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}
