import { Platform, Alert } from 'react-native';
import { getWmUrl } from '../api/client';

// Web-safe alert. React Native's Alert.alert is a no-op on web, which was
// silently swallowing share failures on mobile devices — the user saw "nothing happen".
export const notify = (title, msg) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
};

// Web-safe confirmation. Alert.alert with a button array is a no-op on
// react-native-web, so confirm dialogs (delete, logout, etc.) silently did
// nothing on the PWA. Use window.confirm on web, Alert.alert on native.
export const confirmAction = (title, msg, onConfirm, confirmLabel = 'OK') => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${msg}`)) onConfirm();
  } else {
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
};

// Fetch a watermarked image blob and optionally bake brand/item header + rate footer card.
export const buildShareCard = (blob, info = {}) => new Promise((resolve) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return resolve(blob);
  }
  const objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    try {
      URL.revokeObjectURL(objectUrl);
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const HEAD = Math.round(H * 0.09); // header ~9%
      const FOOT = Math.round(H * 0.18); // footer ~18% (two lines)
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H + HEAD + FOOT;
      const ctx = canvas.getContext('2d');

      // Header band
      ctx.fillStyle = '#1A0F0A';
      ctx.fillRect(0, 0, W, HEAD);
      // Image
      ctx.drawImage(img, 0, HEAD, W, H);
      // Footer band
      ctx.fillStyle = '#1A0F0A';
      ctx.fillRect(0, HEAD + H, W, FOOT);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Header: brand · item
      const brandText = info.brandName || '';
      const itemText = info.itemName || '';
      const headerTitle = [brandText, itemText].filter(Boolean).join('  ·  ');
      if (headerTitle) {
        const hfs = Math.max(18, Math.round(HEAD * 0.42));
        ctx.fillStyle = '#E8D5C0';
        ctx.font = `600 ${hfs}px sans-serif`;
        ctx.fillText(headerTitle, W / 2, HEAD / 2);
      }

      // Footer line 1: #DesignNo · ₹Rate
      const dNum = info.designNumber ? `#${info.designNumber}` : '';
      const dRate = info.rate !== undefined && info.rate !== null ? `₹${info.rate}` : '';
      const f1Title = [dNum, dRate].filter(Boolean).join('  ·  ');
      if (f1Title) {
        const f1fs = Math.max(28, Math.round(FOOT * 0.40));
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `800 ${f1fs}px sans-serif`;
        ctx.fillText(f1Title, W / 2, HEAD + H + FOOT * 0.33);
      }

      // Footer line 2: pcs · fabric · colors
      const meta = [
        info.pcsPerSet ? `${info.pcsPerSet} pcs` : null,
        info.fabricType || null,
        info.colors || null,
      ].filter(Boolean).join('  ·  ');
      if (meta) {
        const f2fs = Math.max(18, Math.round(FOOT * 0.28));
        ctx.fillStyle = '#C0A898';
        ctx.font = `500 ${f2fs}px sans-serif`;
        ctx.fillText(meta, W / 2, HEAD + H + FOOT * 0.72);
      }

      canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', 0.88);
    } catch (e) {
      resolve(blob);
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(blob);
  };
  img.src = objectUrl;
});

// Build a File object for a given design photo path
export const buildShareFile = async (photoPath, info = {}) => {
  const url = getWmUrl(photoPath);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Image failed to load (${resp.status})`);
  const rawBlob = await resp.blob();
  const cardBlob = await buildShareCard(rawBlob, info);
  const fileName = info.designNumber ? `Design-${info.designNumber}.jpg` : 'Design-photo.jpg';
  if (typeof File !== 'undefined') {
    return new File([cardBlob], fileName, { type: 'image/jpeg' });
  }
  cardBlob.name = fileName;
  return cardBlob;
};

// Try opening the native share sheet
export const tryNativeShare = async (files, text) => {
  if (typeof navigator === 'undefined' || !navigator.canShare?.({ files })) return false;
  try {
    await navigator.share(text ? { files, text } : { files });
    return true;
  } catch (e) {
    if (e?.name === 'AbortError') return true; // User dismissed share sheet
    return false;
  }
};

// Fallback: trigger file downloads on Web
export const downloadFiles = (files) => {
  if (typeof document === 'undefined') return;
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name || 'saree-design.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
};

// Main function to share a list of designs via native share sheet
export const shareDesignsList = async ({ designs, brandName, defaultItemName, caption }) => {
  const validDesigns = (designs || []).filter(d => d && d.photo_path);
  if (validDesigns.length === 0) {
    notify('No photos', 'None of the selected designs have photos to share.');
    return false;
  }

  try {
    const files = await Promise.all(
      validDesigns.map((d) =>
        buildShareFile(d.photo_path, {
          brandName: brandName || d.brand_name || '',
          itemName: d.item_name || defaultItemName || '',
          designNumber: d.design_number,
          rate: d.rate,
          pcsPerSet: d.pcs_per_set,
          fabricType: d.fabric_type || d.work_category,
          colors: d.colors,
        })
      )
    );

    const shared = await tryNativeShare(files, caption);
    if (!shared && Platform.OS === 'web') {
      downloadFiles(files);
      notify(
        'Images saved',
        'Direct sharing sheet isn’t supported on this browser version, so the pictures were saved to your device. Attach them in WhatsApp to share.'
      );
    }
    return true;
  } catch (e) {
    notify('Could not share', `Please check your connection and try again.\n(${e.message})`);
    return false;
  }
};
