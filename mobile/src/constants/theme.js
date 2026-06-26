export const colors = {
  primary: '#8B1A2B',
  primaryDark: '#6B1220',
  primaryLight: '#A52535',
  gold: '#C8952A',
  goldLight: '#F0D9A0',
  background: '#FAF7F2',
  card: '#FFFFFF',
  textPrimary: '#1A0A0D',
  textSecondary: '#7A6670',
  border: '#EDE7E2',
  danger: '#C0392B',
  whatsapp: '#25D366',
};

export const shadow = {
  small: {
    shadowColor: '#1A0A0D',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  medium: {
    shadowColor: '#1A0A0D',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
};

export const modalBase = {
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 36 },
  title: { fontSize: 20, fontWeight: '800', color: '#1A0A0D', marginBottom: 20, letterSpacing: 0.2 },
  input: { borderWidth: 1.5, borderColor: '#EDE7E2', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 14, color: '#1A0A0D', backgroundColor: '#FAF7F2' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  btnPrimary: { backgroundColor: '#8B1A2B', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  btnSecondary: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#EDE7E2' },
};
