import { Platform, StyleSheet } from 'react-native';
import { spacing } from '@gfp/theme';

// Shared by the scorecard screen, its pre-scoring summary and its header.


export const screenStyles = StyleSheet.create({
  page:   { flex: 1 },
  header: {
    paddingTop:    Platform.OS === 'android' ? 12 : 0,
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[5],
    alignItems:    'center',
  },
  scroll: { paddingBottom: spacing[8] },
});
