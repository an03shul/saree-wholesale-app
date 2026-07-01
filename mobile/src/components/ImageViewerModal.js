import React, { useRef, useState, useEffect } from 'react';
import { Modal, View, Image, TouchableOpacity, Text, StyleSheet, PanResponder } from 'react-native';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_TAP_SCALE = 2.5;

const clamp = (val, lo, hi) => Math.max(lo, Math.min(hi, val));

function touchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

// Full-screen pinch-to-zoom / pan / double-tap image viewer.
// Built on core RN Modal + PanResponder (no gesture-handler/reanimated
// dependency) so it behaves the same on iOS, Android and the web PWA build.
export default function ImageViewerModal({ visible, uri, onClose }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const gesture = useRef({
    initialDistance: null,
    initialScale: 1,
    initialTranslate: { x: 0, y: 0 },
    lastTapTime: 0,
  }).current;

  useEffect(() => {
    if (visible) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length > 1,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length > 1,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          gesture.initialDistance = touchDistance(touches);
          gesture.initialScale = scale;
        } else {
          gesture.initialTranslate = { ...translate };
          const now = Date.now();
          if (now - gesture.lastTapTime < 300) {
            if (scale > 1) {
              setScale(1);
              setTranslate({ x: 0, y: 0 });
            } else {
              setScale(ZOOM_TAP_SCALE);
            }
          }
          gesture.lastTapTime = now;
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          if (!gesture.initialDistance) {
            gesture.initialDistance = touchDistance(touches);
            gesture.initialScale = scale;
          }
          const newDistance = touchDistance(touches);
          const newScale = clamp(gesture.initialScale * (newDistance / gesture.initialDistance), MIN_SCALE, MAX_SCALE);
          setScale(newScale);
        } else if (touches.length === 1 && scale > 1) {
          setTranslate({
            x: gesture.initialTranslate.x + gestureState.dx,
            y: gesture.initialTranslate.y + gestureState.dy,
          });
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        gesture.initialDistance = null;
        const wasTap = Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5;
        if (wasTap && scale === 1) onClose();
        if (scale < MIN_SCALE) {
          setScale(MIN_SCALE);
          setTranslate({ x: 0, y: 0 });
        }
      },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 16, left: 16, right: 16, bottom: 16 }}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.imageWrap} {...panResponder.panHandlers}>
          {uri ? (
            <Image
              source={{ uri }}
              style={[styles.image, { transform: [{ translateX: translate.x }, { translateY: translate.y }, { scale }] }]}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  closeBtn: {
    position: 'absolute', top: 44, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
});
