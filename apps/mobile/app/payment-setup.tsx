import { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  SafeAreaView, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  StripeProvider,
  CardField,
  useStripe,
  type CardFieldInput,
} from '@stripe/stripe-react-native';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { notify } from '@/lib/notify';
import { createSetupIntent, confirmSetup } from '@/lib/api';

// Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in your .env file.
const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export default function PaymentSetupScreen() {
  return (
    <StripeProvider publishableKey={STRIPE_PK}>
      <PaymentSetupContent />
    </StripeProvider>
  );
}

function PaymentSetupContent() {
  const theme   = useTheme();
  const router  = useRouter();
  const { session, setSession } = useSession();
  const player  = session?.player;
  const { confirmSetupIntent } = useStripe();

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [cardComplete, setCardComplete]  = useState(false);
  const [loading,      setLoading]       = useState(true);
  const [saving,       setSaving]        = useState(false);
  const [initError,    setInitError]     = useState<string | null>(null);

  // Deep-linking straight here leaves no history to pop, so fall back to the
  // auction tab — the only screen that sends you to payment setup.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/auction'));

  function initSetup() {
    // No session means nothing to attach a card to — surface it instead of
    // spinning forever.
    if (!player?.id) {
      setInitError('Your session has expired. Rejoin the event to add a payment method.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setInitError(null);
    createSetupIntent(player.id, session!.sessionToken)
      .then(({ clientSecret: cs }) => setClientSecret(cs))
      .catch(e => setInitError(e instanceof Error ? e.message : 'Could not initialize payment setup.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    initSetup();
  }, [player?.id]);

  async function handleSave() {
    if (!clientSecret || !player || !cardComplete) return;
    setSaving(true);
    try {
      const { setupIntent, error } = await confirmSetupIntent(clientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) throw new Error(error.message);
      if (!setupIntent?.id) throw new Error('Setup did not complete.');

      await confirmSetup(player.id, setupIntent.id, session!.sessionToken);

      if (session) {
        await setSession({
          ...session,
          player: { ...session.player, hasPaymentMethod: true },
        });
      }

      notify('Payment Method Saved', 'Your card has been saved for auction bids.', [
        { text: 'OK', onPress: goBack },
      ]);
    } catch (e: unknown) {
      notify('Could Not Save Card', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const isConfigured = !!STRIPE_PK;

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
        {!isConfigured ? (
          <View style={styles.errorCard}>
            <Ionicons name="warning-outline" size={32} color="#e67e22" />
            <Text style={styles.errorTitle}>Payment Not Configured</Text>
            <Text style={styles.errorMsg}>
              The Stripe publishable key is not set. Please contact the event organizer.
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
        ) : loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 48 }} />
        ) : initError ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={32} color="#e74c3c" />
            <Text style={styles.errorTitle}>Setup Failed</Text>
            <Text style={styles.errorMsg}>{initError}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
              ]}
              onPress={initSetup}
              accessibilityRole="button"
            >
              <Text style={[styles.actionBtnText, { color: theme.buttonLabel }]}>Try Again</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={goBack} accessibilityRole="button">
              <Text style={[styles.secondaryBtnText, { color: theme.mutedText }]}>Back to Auction</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.primary} style={{ marginBottom: 6 }} />
              <Text style={[styles.infoText, { color: theme.colors.primary }]}>
                Your card is saved securely via Stripe and is only charged if you win an auction item.
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>Card Details</Text>
            <CardField
              postalCodeEnabled={false}
              placeholders={{ number: '4242 4242 4242 4242' }}
              cardStyle={{
                backgroundColor: '#fff',
                textColor: '#1a1a1a',
                borderColor: '#d0d0d0',
                borderWidth: 1.5,
                borderRadius: 10,
              }}
              style={styles.cardField}
              onCardChange={(details: CardFieldInput.Details) => setCardComplete(details.complete)}
            />

            <Pressable
              style={[
                styles.saveBtn,
                { backgroundColor: cardComplete && !saving ? theme.colors.primary : '#aaa' },
              ]}
              onPress={handleSave}
              disabled={!cardComplete || saving}
              accessibilityRole="button"
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save Card</Text>}
            </Pressable>

            <Text style={styles.secureNote}>
              Secured by Stripe · Card details never touch our servers
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn:     { width: 44, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  body: { padding: 20, paddingBottom: 48, gap: 16 },

  infoCard: {
    borderRadius: 12, padding: 16, alignItems: 'center',
    boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.05)', elevation: 2,
  },
  infoText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  cardField: { width: '100%', height: 50 },

  saveBtn: {
    borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  secureNote: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 4 },

  actionBtn: {
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28,
    alignItems: 'center', marginTop: 8, minWidth: 200,
  },
  actionBtnText:    { fontWeight: '700', fontSize: 16 },
  secondaryBtn:     { paddingVertical: 10, paddingHorizontal: 16 },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },

  errorCard: { alignItems: 'center', padding: 32, gap: 12 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  errorMsg:   { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
});
