import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';

export default function PaymentSetupScreen() {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.pageBackground }]}>
      <Text style={[styles.title, { color: theme.colors.primary }]}>Not Available on Web</Text>
      <Text style={[styles.body, { color: theme.colors.primary }]}>
        Card payment setup is only available in the mobile app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title:     { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  body:      { fontSize: 15, textAlign: 'center', lineHeight: 22, color: '#666' },
});
