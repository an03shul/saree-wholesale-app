import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

const BASE_URL = API_BASE_URL;

const api = axios.create({ baseURL: BASE_URL, timeout: 10000 });

// Set token directly on the axios instance — no async interceptor
export async function loadStoredToken() {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) setAuthToken(token);
  } catch {}
}

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

export const authApi = {
  login: (username, pin) => api.post('/api/auth/login', { username, pin }),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
  changePin: (current_pin, new_pin) => api.post('/api/auth/change-pin', { current_pin, new_pin }),
};

export const adminApi = {
  getUsers: () => api.get('/api/admin/users'),
  addUser: (data) => api.post('/api/admin/users', data),
  deleteUser: (id) => api.delete(`/api/admin/users/${id}`),
  resetPin: (id, new_pin) => api.post(`/api/admin/users/${id}/reset-pin`, { new_pin }),
  getActivity: (limit = 50) => api.get('/api/admin/activity', { params: { limit } }),
  getStaffActivity: () => api.get('/api/admin/staff-activity'),
  getStaffFeed: (userId) => api.get(`/api/admin/staff-activity/${userId}`),
};

export const fabricsApi = {
  getAll: () => api.get('/api/fabrics'),
  create: (name) => api.post('/api/fabrics', { name }),
};

export const workCategoriesApi = {
  getAll: () => api.get('/api/work-categories'),
  create: (name) => api.post('/api/work-categories', { name }),
};

export const brandsApi = {
  getAll: () => api.get('/api/brands'),
  getOne: (id) => api.get(`/api/brands/${id}`),
  create: (data) => api.post('/api/brands', data),
  update: (id, data) => api.put(`/api/brands/${id}`, data),
  delete: (id, pin) => api.delete(`/api/brands/${id}`, { data: { pin } }),
};

export const itemsApi = {
  getAll: (brand_id) => api.get('/api/items', { params: brand_id ? { brand_id } : {} }),
  getOne: (id) => api.get(`/api/items/${id}`),
  create: (data) => api.post('/api/items', data),
  update: (id, data) => api.put(`/api/items/${id}`, data),
  delete: (id) => api.delete(`/api/items/${id}`),
  toggleStock: (id) => api.patch(`/api/items/${id}/stock`),
};

export const designsApi = {
  getForItem: (itemId) => api.get(`/api/designs/item/${itemId}`),
  search: (q) => api.get('/api/designs/search', { params: { q } }),
  getOne: (id) => api.get(`/api/designs/${id}`),
  getByIds: (ids) => api.get('/api/designs/batch', { params: { ids: (ids || []).join(',') } }),
  create: (itemId, formData) => api.post(`/api/designs/item/${itemId}`, formData, { timeout: 30000 }),
  update: (id, formData) => api.put(`/api/designs/${id}`, formData, { timeout: 30000 }),
  delete: (id) => api.delete(`/api/designs/${id}`),
  toggleStock: (id) => api.patch(`/api/designs/${id}/stock`),
  updateRate: (id, rate) => api.patch(`/api/designs/${id}/rate`, { rate }),
};

export const filesApi = {
  list: (params) => api.get('/api/files', { params }),
  upload: (formData) => api.post('/api/files', formData, { timeout: 30000 }),
  rename: (id, label) => api.patch(`/api/files/${id}`, { label }),
  delete: (id) => api.delete(`/api/files/${id}`),
};

export const manufacturerApi = {
  dispatchPhoto: (formData) => api.post('/api/manufacturer/dispatch-photo', formData, { timeout: 30000 }),
  stock: () => api.get('/api/manufacturer/stock'),
};
// Download URL carries the token as a query param (requireAuth honors ?token),
// so a plain new-tab/Linking open works without an auth header.
export const getFileDownloadUrl = (id) =>
  `${BASE_URL}/api/files/${id}/download?token=${api.defaults.headers.common['Authorization']?.replace('Bearer ', '') || ''}`;

export const itemsApi_stock = {
  toggleStock: (id) => api.patch(`/api/items/${id}/stock`),
};

export const ordersApi = {
  getAll: () => api.get('/api/orders'),
  create: (data) => api.post('/api/orders', data),
  updateStatus: (id, status) => api.patch(`/api/orders/${id}/status`, { status }),
  delete: (id) => api.delete(`/api/orders/${id}`),
};

export const tasksApi = {
  getAll: () => api.get('/api/tasks'),
  create: (data) => api.post('/api/tasks', data),
  update: (id, data) => api.put(`/api/tasks/${id}`, data),
  // mark done with an optional { completion_note }
  complete: (id, payload) => api.post(`/api/tasks/${id}/complete`, payload),
  reopen: (id) => api.patch(`/api/tasks/${id}/reopen`),
  delete: (id) => api.delete(`/api/tasks/${id}`),
};

export const contactsApi = {
  getAll: () => api.get('/api/contacts'),
  create: (data) => api.post('/api/contacts', data),
  update: (id, data) => api.put(`/api/contacts/${id}`, data),
  delete: (id) => api.delete(`/api/contacts/${id}`),
  import: (contacts) => api.post('/api/contacts/import', { contacts }),
};

export const sendApi = {
  preview: (itemId) => api.get(`/api/send/preview/${itemId}`),
  send: (item_id, recipient) => api.post('/api/send', { item_id, recipient }),
  sendSelected: (design_ids, recipient) => api.post('/api/send/selected', { design_ids, recipient }),
  filterBrand: (brandId, params) => api.get(`/api/send/filter/${brandId}`, { params }),
};

export const statsApi = {
  get: () => api.get('/api/stats'),
};

export const settingsApi = {
  getAll: () => api.get('/api/settings'),
  set: (key, value) => api.put(`/api/settings/${key}`, { value }),
};

export const tallyApi = {
  getCustomers: () => api.get('/api/tally/customers'),
  getStatus: () => api.get('/api/tally/status'),
  // Returns an EventSource for real-time stock streaming
  stockStream: (itemId) => new EventSource(`${BASE_URL}/api/tally/stock-stream?item_id=${itemId}&token=${api.defaults.headers.common['Authorization']?.replace('Bearer ', '')}`),
};

export const identifyApi = {
  identify: (formData) => api.post('/api/identify', formData, { timeout: 60000 }),
};

export const importApi = {
  // formData with multiple 'photos' files → returns { drafts: [...] }
  analyze: (formData) => api.post('/api/import/analyze', formData, { timeout: 180000 }),
  save: (item_id, designs) => api.post('/api/import/save', { item_id, designs }),
};

export const getCatalogUrl = (brandId, params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return `${BASE_URL}/catalog/${brandId}${q ? `?${q}` : ''}`;
};
export const getCustomCatalogUrl = (ids = []) => {
  return `${BASE_URL}/catalog/custom?ids=${ids.join(',')}`;
};
// Build a free WhatsApp deep link (wa.me). Pass a phone to target a contact, or
// omit it to let the user pick the recipient in WhatsApp.
export const whatsappLink = (message, phone) => {
  const text = encodeURIComponent(message || '');
  const num = (phone || '').replace(/[^0-9]/g, '');
  return num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`;
};
export const getPdfUrl = (brandId, params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return `${BASE_URL}/api/pdf/${brandId}${q ? `?${q}` : ''}`;
};
export const getImageUrl = (photoPath) => `${BASE_URL}/uploads/${photoPath}`;
// Small resized thumbnail for fast in-app lists/grids (full image stays at getImageUrl)
export const getThumbUrl = (photoPath) => `${BASE_URL}/thumb/${photoPath}`;
// Watermarked full-size image (used when sharing externally)
export const getWmUrl = (photoPath) => `${BASE_URL}/uploads/wm/${photoPath}`;
