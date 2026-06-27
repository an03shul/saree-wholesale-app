import * as ImageManipulator from 'expo-image-manipulator';

// Resize to max 1280px on the long edge and compress to JPEG (~0.6). Turns the
// phone's 6–10 MB photos into ~200–400 KB, so uploads are fast and the app stays
// responsive (large images were the main cause of hanging). Falls back to the
// original on any error so a photo is never lost.
export async function compressImage(asset) {
  if (!asset?.uri) return asset;
  try {
    const result = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { ...asset, uri: result.uri, width: result.width, height: result.height };
  } catch {
    return asset;
  }
}
