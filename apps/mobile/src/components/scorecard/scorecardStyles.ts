import { Platform, StyleSheet } from 'react-native';

// Shared by the scorecard screen, its pre-scoring summary and its header.


export const screenStyles = StyleSheet.create({
  page:   { flex: 1 },
  header: {
    paddingTop:    Platform.OS === 'android' ? 12 : 0,
    paddingBottom: 12,
    paddingHorizontal: 20,
    alignItems:    'center',
  },
  scroll: { paddingBottom: 32 },
});
