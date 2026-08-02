/**
 * Saves a card for a golfer who cannot (or will not) use the app — keyed in by
 * staff at the registration desk or the auction checkout desk, with the
 * cardholder standing there.
 *
 * The card number is typed into a Stripe-hosted iframe and goes straight to
 * Stripe: it never reaches our API or this bundle, which keeps the admin app out
 * of PCI scope. We only ever see the resulting SetupIntent id.
 *
 * Why this matters here: check-in waives the saved-card requirement for bidding
 * (AuctionBidRules.NeedsPaymentMethod), so a checked-in golfer can win a lot with
 * no card at all and be impossible to charge. Capturing one at the desk closes
 * that hole; doing it at checkout also means the charge is on-session, so a 3DS
 * challenge can actually be answered instead of failing.
 *
 * These are DOM-only libraries. The admin app is web-only (Metro `expo export
 * --platform web`), which is what makes that acceptable — keep the coupling in
 * this file.
 */

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useTheme } from '@gfp/ui';
import { paymentMethodApi } from '@/lib/api';

// The publishable key is safe to expose. With none configured the card button is
// hidden entirely and the desk falls back to cash or check.
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export const cardCaptureEnabled = PUBLISHABLE_KEY !== '';

const stripePromise = cardCaptureEnabled ? loadStripe(PUBLISHABLE_KEY) : null;

interface Props {
  visible:    boolean;
  eventId:    string;
  playerId:   string;
  playerName: string;
  onClose:    () => void;
  /** Fired once the card is saved, so the caller can refresh its own state. */
  onSaved:    () => void;
}

export function AddCardModal({ visible, eventId, playerId, playerName, onClose, onSaved }: Props) {
  const theme = useTheme();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError,    setLoadError]    = useState<string | null>(null);

  // One SetupIntent per opening. Re-opening for a different golfer must not
  // reuse the previous intent, or the card lands on the wrong account.
  useEffect(() => {
    if (!visible || !cardCaptureEnabled) return;
    let cancelled = false;
    setClientSecret(null); setLoadError(null);
    paymentMethodApi.createSetupIntent(eventId, playerId)
      .then(r => { if (!cancelled) setClientSecret(r.clientSecret); })
      .catch((e: any) => { if (!cancelled) setLoadError(e.message ?? 'Could not start card entry.'); });
    return () => { cancelled = true; };
  }, [visible, eventId, playerId]);

  const appearance = useMemo(() => ({
    theme: 'stripe' as const,
    variables: { colorPrimary: theme.colors.primary, borderRadius: '8px' },
  }), [theme.colors.primary]);

  if (!cardCaptureEnabled) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={[styles.title, { color: theme.colors.primary }]}>Add a card for {playerName}</Text>
          <Text style={[styles.sub, { color: theme.mutedText }]}>
            Enter the card with the golfer present. It is stored by Stripe and can
            then be charged at checkout.
          </Text>

          {loadError && <Text style={styles.error}>⚠️ {loadError}</Text>}

          {!clientSecret && !loadError && (
            <ActivityIndicator style={{ marginVertical: 24 }} color={theme.colors.primary} />
          )}

          {clientSecret && stripePromise && (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
              <CardForm
                eventId={eventId}
                playerId={playerId}
                onSaved={() => { onSaved(); onClose(); }}
              />
            </Elements>
          )}

          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: theme.mutedText }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CardForm({ eventId, playerId, onSaved }: {
  eventId: string; playerId: string; onSaved: () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const theme    = useTheme();
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  async function handleSubmit() {
    if (!stripe || !elements) return;
    setSaving(true); setErr(null);

    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (error) {
      setErr(error.message ?? 'Could not save that card.');
      setSaving(false);
      return;
    }

    if (setupIntent?.status === 'succeeded') {
      try {
        // Tell our side so has_payment_method flips and the desk sees the card.
        await paymentMethodApi.confirmSetup(eventId, playerId, setupIntent.id);
        onSaved();
      } catch (e: any) {
        setErr(e.message ?? 'Card was saved with Stripe but we could not record it.');
        setSaving(false);
      }
      return;
    }

    setErr('Card entry was not completed.');
    setSaving(false);
  }

  return (
    <View style={{ marginTop: 8 }}>
      <PaymentElement />
      {err && <Text style={styles.error}>⚠️ {err}</Text>}
      <Pressable
        style={[styles.saveBtn, { backgroundColor: theme.colors.primary }, (!stripe || saving) && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={!stripe || saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.saveText}>Save card</Text>}
      </Pressable>
      <Text style={[styles.secure, { color: theme.mutedText }]}>
        🔒 Card details go straight to Stripe — they never reach this app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet:    { width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 14, padding: 22 },
  title:    { fontSize: 17, fontWeight: '800' },
  sub:      { fontSize: 13, marginTop: 4, marginBottom: 12, lineHeight: 18 },
  error:    { color: '#c0392b', fontSize: 13, marginTop: 10 },
  saveBtn:  { marginTop: 16, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secure:   { fontSize: 11, textAlign: 'center', marginTop: 10 },
  cancelBtn:  { marginTop: 14, alignItems: 'center' },
  cancelText: { fontSize: 14 },
});
