import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, Image, TouchableOpacity, Modal, StyleSheet, PanResponder, ActivityIndicator,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, shadow } from '../constants/theme';

const HANDLE = 26;   // corner handle hit-size
const MIN_BOX = 48;  // smallest allowed crop box (screen px)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Where the "contain"-fitted image sits inside the measured container.
function computeLayout(img, cont) {
  if (!img.w || !img.h || !cont.w || !cont.h) return null;
  const scale = Math.min(cont.w / img.w, cont.h / img.h);
  const dispW = img.w * scale;
  const dispH = img.h * scale;
  return { scale, dispW, dispH, offX: (cont.w - dispW) / 2, offY: (cont.h - dispH) / 2 };
}

/**
 * Full-screen crop / rotate / flip editor. Works on native and the web PWA.
 * Rotate & flip are baked into a working copy immediately (so the crop box math
 * always maps against an upright image); the crop rectangle is applied on Done.
 *
 * onDone receives { uri, width, height } — the caller should still run it through
 * compressImage() before upload.
 */
export default function ImageEditorModal({ visible, imageUri, onCancel, onDone }) {
  const [workUri, setWorkUri] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState(null); // {x,y,w,h} in container coords
  const [busy, setBusy] = useState(false);

  const layout = useMemo(() => computeLayout(imgSize, container), [imgSize, container]);

  // Keep the latest box/layout reachable from the (stable) PanResponders.
  const boxRef = useRef(box);
  const layoutRef = useRef(layout);
  const startBox = useRef(null);
  useEffect(() => { boxRef.current = box; }, [box]);
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  // Reset to the fresh source whenever the modal opens with a new image.
  useEffect(() => {
    if (visible && imageUri) {
      setWorkUri(imageUri);
      setBox(null);
      setImgSize({ w: 0, h: 0 });
    }
  }, [visible, imageUri]);

  // Measure natural size of the current working image.
  useEffect(() => {
    if (!workUri) return;
    let alive = true;
    Image.getSize(workUri, (w, h) => { if (alive) setImgSize({ w, h }); }, () => {});
    return () => { alive = false; };
  }, [workUri]);

  // Default the crop box to the whole image whenever size/layout changes
  // (also after each rotate/flip, which changes imgSize).
  useEffect(() => {
    const L = computeLayout(imgSize, container);
    if (L) setBox({ x: L.offX, y: L.offY, w: L.dispW, h: L.dispH });
  }, [imgSize, container]);

  // ---- Gestures --------------------------------------------------------
  const bodyPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startBox.current = boxRef.current; },
      onPanResponderMove: (_e, g) => {
        const s = startBox.current, L = layoutRef.current;
        if (!s || !L) return;
        const nx = clamp(s.x + g.dx, L.offX, L.offX + L.dispW - s.w);
        const ny = clamp(s.y + g.dy, L.offY, L.offY + L.dispH - s.h);
        setBox({ ...s, x: nx, y: ny });
      },
    })
  ).current;

  const makeCorner = (corner) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startBox.current = boxRef.current; },
      onPanResponderMove: (_e, g) => {
        const s = startBox.current, L = layoutRef.current;
        if (!s || !L) return;
        const left = L.offX, top = L.offY, right = L.offX + L.dispW, bottom = L.offY + L.dispH;
        let { x, y, w, h } = s;
        if (corner.includes('l')) { const nx = clamp(s.x + g.dx, left, s.x + s.w - MIN_BOX); x = nx; w = s.x + s.w - nx; }
        if (corner.includes('r')) { w = clamp(s.w + g.dx, MIN_BOX, right - s.x); }
        if (corner.includes('t')) { const ny = clamp(s.y + g.dy, top, s.y + s.h - MIN_BOX); y = ny; h = s.y + s.h - ny; }
        if (corner.includes('b')) { h = clamp(s.h + g.dy, MIN_BOX, bottom - s.y); }
        setBox({ x, y, w, h });
      },
    });
  const corners = useRef({ tl: makeCorner('tl'), tr: makeCorner('tr'), bl: makeCorner('bl'), br: makeCorner('br') }).current;

  // ---- Operations ------------------------------------------------------
  const applyOp = async (action) => {
    if (!workUri || busy) return;
    setBusy(true);
    try {
      const r = await ImageManipulator.manipulateAsync(workUri, [action], {
        compress: 1, format: ImageManipulator.SaveFormat.JPEG,
      });
      setImgSize({ w: r.width, h: r.height });
      setWorkUri(r.uri);
    } catch (e) {
      // leave the working image untouched on failure
    } finally {
      setBusy(false);
    }
  };

  const rotateLeft = () => applyOp({ rotate: -90 });
  const rotateRight = () => applyOp({ rotate: 90 });
  const flipH = () => applyOp({ flip: ImageManipulator.FlipType.Horizontal });
  const resetBox = () => { if (layout) setBox({ x: layout.offX, y: layout.offY, w: layout.dispW, h: layout.dispH }); };

  const finish = async () => {
    if (busy) return;
    const L = computeLayout(imgSize, container);
    if (!L || !box) { onDone({ uri: workUri, width: imgSize.w, height: imgSize.h }); return; }
    setBusy(true);
    try {
      const cropX = clamp((box.x - L.offX) / L.scale, 0, imgSize.w);
      const cropY = clamp((box.y - L.offY) / L.scale, 0, imgSize.h);
      const cropW = clamp(box.w / L.scale, 1, imgSize.w - cropX);
      const cropH = clamp(box.h / L.scale, 1, imgSize.h - cropY);
      const isFull = cropX < 1 && cropY < 1 && cropW > imgSize.w - 2 && cropH > imgSize.h - 2;

      let out = { uri: workUri, width: imgSize.w, height: imgSize.h };
      if (!isFull) {
        const r = await ImageManipulator.manipulateAsync(
          workUri,
          [{ crop: { originX: Math.round(cropX), originY: Math.round(cropY), width: Math.round(cropW), height: Math.round(cropH) } }],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
        );
        out = { uri: r.uri, width: r.width, height: r.height };
      }
      onDone(out);
    } catch (e) {
      onDone({ uri: workUri, width: imgSize.w, height: imgSize.h });
    } finally {
      setBusy(false);
    }
  };

  // ---- Render ----------------------------------------------------------
  const dimW = container.w, dimH = container.h;
  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.topBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Edit Photo</Text>
          <TouchableOpacity onPress={finish} disabled={busy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.topBtn, styles.topDone, busy && { opacity: 0.4 }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <View
          style={styles.stage}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setContainer({ w: width, h: height });
          }}
        >
          {workUri ? (
            <Image source={{ uri: workUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          ) : null}

          {box && layout && (
            <>
              {/* Dim outside the crop box */}
              <View style={[styles.dim, { left: 0, top: 0, width: dimW, height: box.y }]} pointerEvents="none" />
              <View style={[styles.dim, { left: 0, top: box.y + box.h, width: dimW, height: Math.max(0, dimH - (box.y + box.h)) }]} pointerEvents="none" />
              <View style={[styles.dim, { left: 0, top: box.y, width: box.x, height: box.h }]} pointerEvents="none" />
              <View style={[styles.dim, { left: box.x + box.w, top: box.y, width: Math.max(0, dimW - (box.x + box.w)), height: box.h }]} pointerEvents="none" />

              {/* Crop box (drag to move) */}
              <View style={[styles.cropBox, { left: box.x, top: box.y, width: box.w, height: box.h }]} {...bodyPan.panHandlers}>
                <View style={[styles.grid, styles.gridV, { left: box.w / 3 }]} pointerEvents="none" />
                <View style={[styles.grid, styles.gridV, { left: (box.w / 3) * 2 }]} pointerEvents="none" />
                <View style={[styles.grid, styles.gridH, { top: box.h / 3 }]} pointerEvents="none" />
                <View style={[styles.grid, styles.gridH, { top: (box.h / 3) * 2 }]} pointerEvents="none" />
              </View>

              {/* Corner handles */}
              <View style={[styles.handle, { left: box.x - HANDLE / 2, top: box.y - HANDLE / 2 }]} {...corners.tl.panHandlers}><View style={[styles.knob, styles.knobTL]} /></View>
              <View style={[styles.handle, { left: box.x + box.w - HANDLE / 2, top: box.y - HANDLE / 2 }]} {...corners.tr.panHandlers}><View style={[styles.knob, styles.knobTR]} /></View>
              <View style={[styles.handle, { left: box.x - HANDLE / 2, top: box.y + box.h - HANDLE / 2 }]} {...corners.bl.panHandlers}><View style={[styles.knob, styles.knobBL]} /></View>
              <View style={[styles.handle, { left: box.x + box.w - HANDLE / 2, top: box.y + box.h - HANDLE / 2 }]} {...corners.br.panHandlers}><View style={[styles.knob, styles.knobBR]} /></View>
            </>
          )}

          {(busy || !workUri) && (
            <View style={styles.busy} pointerEvents="none">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.toolbar}>
          <ToolBtn icon="⟲" label="Rotate L" onPress={rotateLeft} disabled={busy} />
          <ToolBtn icon="⟳" label="Rotate R" onPress={rotateRight} disabled={busy} />
          <ToolBtn icon="⇋" label="Flip" onPress={flipH} disabled={busy} />
          <ToolBtn icon="⤢" label="Reset crop" onPress={resetBox} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}

function ToolBtn({ icon, label, onPress, disabled }) {
  return (
    <TouchableOpacity style={[styles.tool, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled}>
      <Text style={styles.toolIcon}>{icon}</Text>
      <Text style={styles.toolLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 14, paddingHorizontal: 20, backgroundColor: '#000',
  },
  topBtn: { color: '#fff', fontSize: 16, fontWeight: '600' },
  topDone: { color: colors.gold, fontWeight: '800' },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  stage: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  cropBox: { position: 'absolute', borderWidth: 1.5, borderColor: '#fff' },
  grid: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)' },
  gridV: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  gridH: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  handle: { position: 'absolute', width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  knob: { width: 18, height: 18, borderColor: colors.gold },
  knobTL: { borderLeftWidth: 3, borderTopWidth: 3 },
  knobTR: { borderRightWidth: 3, borderTopWidth: 3 },
  knobBL: { borderLeftWidth: 3, borderBottomWidth: 3 },
  knobBR: { borderRightWidth: 3, borderBottomWidth: 3 },
  busy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  toolbar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingVertical: 16, paddingBottom: 34, backgroundColor: '#111',
  },
  tool: { alignItems: 'center', paddingHorizontal: 8 },
  toolIcon: { color: '#fff', fontSize: 24, marginBottom: 4 },
  toolLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
});
