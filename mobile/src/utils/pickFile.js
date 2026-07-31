import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// Pick a document (PDF or image) for upload. Returns a value ready to append to
// FormData under 'file', plus a display name — or null if cancelled.
//   web:    { file: File, name }          (native File from <input>)
//   native: { file: {uri,name,type}, name } (image only — the shop uses the web PWA)
// ponytail: web-first via a plain <input type=file>; no expo-document-picker dep.
//
// `accept` maps to the <input accept>. Default is image-first (good for photo
// capture). Pass '*/*' for document uploads (invoices/order-forms): an
// image-restricted input on an iOS installed-PWA only offers Photo Library /
// Take Photo and hides the Files picker where PDFs live, so PDFs become
// unselectable — a permissive accept restores the "Choose File" option.
export async function pickFile(accept = 'image/*,application/pdf') {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = () => {
        const f = input.files && input.files[0];
        resolve(f ? { file: f, name: f.name } : null);
      };
      input.click();
    });
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') return null;
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
  if (r.canceled) return null;
  const a = r.assets[0];
  return { file: { uri: a.uri, name: a.fileName || 'upload.jpg', type: 'image/jpeg' }, name: a.fileName || 'photo' };
}
