// Stripe settings the registration UI needs before any payment step renders.
// Kept apart from EntryFeePayment so importing them does not pull in the
// Stripe SDK — that module is loaded on demand when a card form is shown.

// The publishable key is safe to expose; when it isn't configured the payment
// step is skipped entirely and the organizer collects the fee offline.
export const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export const stripeEnabled = PUBLISHABLE_KEY !== '';

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
