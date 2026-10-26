import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@gfp/ui';
import { fontSize, radius, spacing } from '@gfp/theme';

export default function PaymentSetupScreen() {
  const theme  = useTheme();
  const router = useRouter();

  // Deep-linking straight here leaves no history to pop, so fall back to the
  // auction tab — the only screen that sends you to payment setup.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/auction'));

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: '#e0e0e0' }]}>
        <Pressable onPress={goBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.primary }]}>Payment Method</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.errorCard}>
          <Ionicons name="phone-portrait-outline" size={32} color="#e67e22" />
          <Text style={styles.errorTitle}>Not Available on Web</Text>
          <Text style={styles.errorMsg}>
            Card payment setup is only available in the mobile app. Open this event on your
            phone to save a card for auction bids.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
            ]}
            onPress={goBack}
            accessibilityRole="button"
          >
            <Text style={[styles.actionBtnText, { color: theme.buttonLabel }]}>Back to Auction</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing[2], paddingVertical: spacing[3], borderBottomWidth: 1,
  },
  backBtn:     { width: 44, alignItems: 'center' },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700' },

  body: { padding: spacing[5], paddingBottom: spacing[12] },

  errorCard:  { alignItems: 'center', padding: spacing[8], gap: spacing[3] },
  errorTitle: { fontSize: fontSize.xl, fontWeight: '700', color: '#333' },
  errorMsg:   { fontSize: fontSize.md, color: '#666', textAlign: 'center', lineHeight: 20 },

  actionBtn: {
    borderRadius: radius.lg, paddingVertical: spacing[4], paddingHorizontal: spacing[8],
    alignItems: 'center', marginTop: spacing[2], minWidth: 200,
  },
  actionBtnText: { fontWeight: '700', fontSize: fontSize.xl },
});
