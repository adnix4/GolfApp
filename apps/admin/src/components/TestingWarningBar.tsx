import { View, Text, StyleSheet } from 'react-native';
import { fontSize, spacing } from '@gfp/theme';

interface Props {
  totalTestRecords: number;
}

export function TestingWarningBar({ totalTestRecords }: Props) {
  return (
    <View style={styles.bar}>
      <Text style={styles.icon}>⚠</Text>
      <Text style={styles.text}>
        WARNING: Event is using test data
        {totalTestRecords > 0 ? ` (${totalTestRecords} test records)` : ''}
        {' '}— remove before going live.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#f39c12',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  icon: { fontSize: fontSize.xl, color: '#fff' },
  text: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff', textAlign: 'center', flex: 1 },
});
