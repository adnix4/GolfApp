import { View, Text, StyleSheet } from 'react-native';

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
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  icon: { fontSize: 16, color: '#fff' },
  text: { fontSize: 13, fontWeight: '700', color: '#fff', textAlign: 'center', flex: 1 },
});
