'use client';

import { useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { confirmEntryFee } from '@/lib/api';

// ── STRIPE SETUP ──────────────────────────────────────────────────────────────
// The publishable key is safe to expose; when it isn't configured the payment
// step is skipped entirely and the organizer collects the fee offline.

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export const stripeEnabled = PUBLISHABLE_KEY !== '';

const stripePromise = stripeEnabled ? loadStripe(PUBLISHABLE_KEY) : null;

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ── PAYMENT STEP ──────────────────────────────────────────────────────────────
// Rendered inside the registration modals after the register call succeeds
// with an entry-fee PaymentIntent. Confirms in the browser, then best-effort
// marks the golfers paid (the Stripe webhook is the backstop).

interface EntryFeePaymentProps {
  clientSecret: string;
  amountCents:  number;
  /** e.g. "$50.00 × 3 golfers" — shown above the card form. */
  breakdown:    string | null;
  onPaid:       () => void;
}

export default function EntryFeePayment({ clientSecret, amountCents, breakdown, onPaid }: EntryFeePaymentProps) {
  // Match Stripe's inputs to the event theme (CSS vars are set on :root by the page).
  const appearance = useMemo(() => {
    const primary = typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
      : '';
    return {
      theme: 'stripe' as const,
      variables: { ...(primary ? { colorPrimary: primary } : {}), borderRadius: '7px' },
    };
  }, []);

  if (!stripePromise) return null; // callers gate on stripeEnabled; belt and braces

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <PayForm amountCents={amountCents} breakdown={breakdown} onPaid={onPaid} />
    </Elements>
  );
}

function PayForm({ amountCents, breakdown, onPaid }: Omit<EntryFeePaymentProps, 'clientSecret'>) {
  const stripe   = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true); setErr(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      // Card payments complete in-page; redirect-based methods come back to
      // this event page and the webhook records the payment.
      confirmParams: { return_url: window.location.href },
      redirect:      'if_required',
    });

    if (error) {
      setErr(error.message ?? 'Payment failed. Please try again.');
      setPaying(false);
      return;
    }
    if (paymentIntent && ['succeeded', 'processing'].includes(paymentIntent.status)) {
      await confirmEntryFee(paymentIntent.id);
      onPaid();
      return;
    }
    setErr('Payment was not completed. Please try again.');
    setPaying(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={p.summary}>
        <span style={p.summaryLabel}>Entry fee{breakdown ? ` · ${breakdown}` : ''}</span>
        <span style={p.summaryAmount}>{formatUsd(amountCents)}</span>
      </div>
      <PaymentElement />
      {err && <p style={p.error}>⚠️ {err}</p>}
      <button type="submit" disabled={!stripe || paying} style={{ ...p.payBtn, opacity: !stripe || paying ? 0.6 : 1 }}>
        {paying ? 'Processing…' : `Pay ${formatUsd(amountCents)}`}
      </button>
      <p style={p.secureNote}>🔒 Payments are processed securely by Stripe.</p>
    </form>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const p: Record<string, React.CSSProperties> = {
  summary: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 8,
    backgroundColor: '#f6f7f6', border: '1px solid #e8e8e8',
  },
  summaryLabel:  { fontSize: '0.875rem', fontWeight: 600, color: '#4b5563' },
  summaryAmount: { fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-primary)' },
  error:         { color: '#c0392b', fontSize: '0.875rem', margin: '0.75rem 0 0' },
  payBtn: {
    width: '100%', marginTop: '1.25rem', padding: '0.85rem', borderRadius: 8, border: 'none',
    backgroundColor: 'var(--color-action)', color: 'var(--color-on-action, #fff)',
    fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
  },
  secureNote: { fontSize: '0.75rem', color: '#888', textAlign: 'center', margin: '0.75rem 0 0' },
};
