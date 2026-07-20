'use client';

import { useState } from 'react';
import {
  registerTeam,
  joinTeam,
  registerFreeAgent,
  submitDonation,
  type RegisterTeamPayload,
  type JoinTeamPayload,
  type RegisterFreeAgentPayload,
  type DonatePayload,
  type RegistrationResult,
} from '@/lib/api';
import EntryFeePayment, { stripeEnabled, formatUsd } from './EntryFeePayment';

// ── TYPES ─────────────────────────────────────────────────────────────────────

type RegistrationMode = 'team' | 'join' | 'freeagent' | null;

interface RegistrationSectionProps {
  eventId:          string;
  orgName:          string;
  freeAgentEnabled: boolean;
  /** Per-golfer entry fee in cents; null when the event is free. */
  entryFeeCents:    number | null;
}

interface DonateWidgetProps {
  eventCode: string;
  orgName:   string;
  is501c3:   boolean;
}

// ── REGISTRATION SECTION ──────────────────────────────────────────────────────

export default function EventRegistrationSection({
  eventId,
  orgName,
  freeAgentEnabled,
  entryFeeCents,
}: RegistrationSectionProps) {
  const [mode, setMode] = useState<RegistrationMode>(null);

  return (
    <section style={s.card} id="register">
      <h2 style={s.cardTitle}>Join the Tournament</h2>
      {entryFeeCents ? (
        <p style={s.feeNote}>
          Entry fee: <strong>{formatUsd(entryFeeCents)}</strong> per golfer
          {stripeEnabled ? ' — pay online when you register.' : '.'}
        </p>
      ) : null}
      <div style={s.ctaRow}>
        <button onClick={() => setMode('team')}  style={{ ...s.ctaBtn, ...s.ctaBtnPrimary }}>Register a Team</button>
        <button onClick={() => setMode('join')}  style={{ ...s.ctaBtn, ...s.ctaBtnOutline }}>Join a Team</button>
        {freeAgentEnabled && (
          <button onClick={() => setMode('freeagent')} style={{ ...s.ctaBtn, ...s.ctaBtnOutline }}>I Need a Team</button>
        )}
      </div>
      <p style={s.ctaNote}>Contact {orgName} for more information.</p>

      {mode === 'team'      && <RegisterTeamModal eventId={eventId} perGolferCents={entryFeeCents} onClose={() => setMode(null)} />}
      {mode === 'join'      && <JoinTeamModal     eventId={eventId} perGolferCents={entryFeeCents} onClose={() => setMode(null)} />}
      {mode === 'freeagent' && <FreeAgentModal    eventId={eventId} perGolferCents={entryFeeCents} onClose={() => setMode(null)} />}
    </section>
  );
}

// ── DONATE WIDGET ─────────────────────────────────────────────────────────────

export function DonateWidget({ eventCode, orgName, is501c3 }: DonateWidgetProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} style={s.donateBtn}>
        ❤️ Make a Donation
      </button>
      {open && (
        <DonateModal
          eventCode={eventCode}
          orgName={orgName}
          is501c3={is501c3}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── MODAL SHELL ───────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>{title}</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.fieldRow}>
      <label style={s.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input style={s.input} {...props} />;
}

function SubmitRow({ saving, label, onCancel }: { saving: boolean; label: string; onCancel: () => void }) {
  return (
    <div style={s.submitRow}>
      <button type="button" onClick={onCancel} style={s.cancelBtn}>Cancel</button>
      <button type="submit" disabled={saving} style={s.submitBtn}>
        {saving ? 'Submitting…' : label}
      </button>
    </div>
  );
}

function Success({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={s.success}>
      <p style={s.successText}>✅ {message}</p>
      <button onClick={onClose} style={s.submitBtn}>Close</button>
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return <p style={s.errorMsg}>⚠️ {msg}</p>;
}

// ── POST-REGISTRATION (payment step → confirmation) ──────────────────────────
// Shared by all three registration modals. When the API returned an entry-fee
// PaymentIntent and Stripe is configured, collect the fee in-browser first;
// otherwise (free event, or fee collected offline) go straight to confirmation.

const IOS_STORE_URL     = process.env.NEXT_PUBLIC_IOS_APP_URL     ?? '';
const ANDROID_STORE_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL ?? '';

function PostRegistration({ result, perGolferCents, onClose }: {
  result:         RegistrationResult;
  perGolferCents: number | null;
  onClose:        () => void;
}) {
  const [paid, setPaid] = useState(false);

  const total    = result.entryFeeCents ?? 0;
  const payNow   = !paid && total > 0 && !!result.entryFeeClientSecret && stripeEnabled;
  // Fee exists but can't be collected online (Stripe not configured / intent
  // creation failed) — registration stands; the organizer collects offline.
  const feeDue   = !paid && total > 0 && !payNow;
  const golfers  = perGolferCents ? Math.round(total / perGolferCents) : 1;

  if (payNow) {
    return (
      <Modal title="Entry Fee" onClose={onClose}>
        <p style={s.hint}>You&apos;re registered! Complete your entry fee payment to lock in your spot.</p>
        <EntryFeePayment
          clientSecret={result.entryFeeClientSecret!}
          amountCents={total}
          breakdown={perGolferCents && golfers > 1 ? `${formatUsd(perGolferCents)} × ${golfers} golfers` : null}
          onPaid={() => setPaid(true)}
        />
      </Modal>
    );
  }

  return (
    <Modal title={paid ? 'Payment Received!' : 'Registered!'} onClose={onClose}>
      <div style={s.success}>
        <p style={s.successText}>✅ {paid ? "Payment received — you're all set! Check your email for next steps." : result.message}</p>
        {feeDue && (
          <p style={s.feeDueNote}>
            Your entry fee of {formatUsd(total)} is due — the organizer will collect it before the event.
          </p>
        )}
        {result.inviteUrl && <InviteShare url={result.inviteUrl} />}
        <AppPromo />
        <button onClick={onClose} style={s.submitBtn}>Close</button>
      </div>
    </Modal>
  );
}

function InviteShare({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={s.inviteBox}>
      <p style={s.inviteLabel}>Share this link so teammates can join (and pay) themselves:</p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input readOnly value={url} style={{ ...s.input, fontSize: '0.8rem' }} onFocus={e => e.target.select()} />
        <button
          type="button"
          style={s.copyBtn}
          onClick={() => {
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/** Post-registration nudge toward the scorer app — the golfer now has a reason to install it. */
function AppPromo() {
  return (
    <div style={s.appPromo}>
      <p style={s.appPromoText}>
        📱 On event day, keep score with the <strong>GFP Scorer</strong> app — it works even
        without a signal and feeds the live leaderboard.
      </p>
      {(IOS_STORE_URL || ANDROID_STORE_URL) && (
        <p style={{ margin: '0.5rem 0 0' }}>
          {IOS_STORE_URL     && <a href={IOS_STORE_URL}     style={s.storeLink}>App Store</a>}
          {IOS_STORE_URL && ANDROID_STORE_URL && <span style={{ color: '#bbb' }}> · </span>}
          {ANDROID_STORE_URL && <a href={ANDROID_STORE_URL} style={s.storeLink}>Google Play</a>}
        </p>
      )}
    </div>
  );
}

// ── REGISTER TEAM MODAL ───────────────────────────────────────────────────────

interface RegistrationModalProps {
  eventId:        string;
  perGolferCents: number | null;
  onClose:        () => void;
}

function RegisterTeamModal({ eventId, perGolferCents, onClose }: RegistrationModalProps) {
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState([
    { firstName: '', lastName: '', email: '', handicap: '' },
    { firstName: '', lastName: '', email: '', handicap: '' },
    { firstName: '', lastName: '', email: '', handicap: '' },
    { firstName: '', lastName: '', email: '', handicap: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState<RegistrationResult | null>(null);
  const [err,    setErr]    = useState<string | null>(null);

  function updatePlayer(i: number, field: string, val: string) {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const activePlayers = players.filter(p => p.firstName.trim() && p.lastName.trim() && p.email.trim());
    if (!teamName.trim() || activePlayers.length === 0) {
      setErr('Team name and at least one player (first, last, email) are required.'); return;
    }
    setSaving(true); setErr(null);
    const payload: RegisterTeamPayload = {
      teamName: teamName.trim(),
      players:  activePlayers.map(p => ({
        firstName: p.firstName.trim(),
        lastName:  p.lastName.trim(),
        email:     p.email.trim(),
        ...(p.handicap.trim() ? { handicap: parseFloat(p.handicap) } : {}),
      })),
    };
    const result = await registerTeam(eventId, payload);
    setSaving(false);
    if (result.ok) setDone(result);
    else setErr(result.message);
  }

  if (done) return <PostRegistration result={done} perGolferCents={perGolferCents} onClose={onClose} />;

  return (
    <Modal title="Register a Team" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FieldRow label="Team Name *">
          <Input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="The Eagles" required />
        </FieldRow>

        <p style={s.sectionLabel}>Players (fill in the ones joining your team)</p>
        {players.map((p, i) => (
          <div key={i} style={s.playerBlock}>
            <p style={s.playerNum}>Player {i + 1}{i === 0 ? ' *' : ''}</p>
            <div style={s.playerGrid}>
              <Input value={p.firstName} onChange={e => updatePlayer(i, 'firstName', e.target.value)} placeholder="First name" required={i === 0} />
              <Input value={p.lastName}  onChange={e => updatePlayer(i, 'lastName',  e.target.value)} placeholder="Last name"  required={i === 0} />
              <Input value={p.email}     onChange={e => updatePlayer(i, 'email',     e.target.value)} placeholder="Email"      required={i === 0} type="email" style={{ ...s.input, gridColumn: '1 / -1' }} />
              <Input value={p.handicap}  onChange={e => updatePlayer(i, 'handicap',  e.target.value)} placeholder="Handicap (opt)" type="number" />
            </div>
          </div>
        ))}

        {err && <ErrorMsg msg={err} />}
        <SubmitRow saving={saving} label="Register Team" onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ── JOIN TEAM MODAL ───────────────────────────────────────────────────────────

function JoinTeamModal({ eventId, perGolferCents, onClose }: RegistrationModalProps) {
  const [token,     setToken]     = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [handicap,  setHandicap]  = useState('');
  const [saving,    setSaving]    = useState(false);
  const [done,      setDone]      = useState<RegistrationResult | null>(null);
  const [err,       setErr]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    const payload: JoinTeamPayload = {
      inviteToken: token.trim(),
      player: {
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim(),
        ...(handicap.trim() ? { handicap: parseFloat(handicap) } : {}),
      },
    };
    const result = await joinTeam(eventId, payload);
    setSaving(false);
    if (result.ok) setDone(result);
    else setErr(result.message);
  }

  if (done) return <PostRegistration result={done} perGolferCents={perGolferCents} onClose={onClose} />;

  return (
    <Modal title="Join a Team" onClose={onClose}>
      <p style={s.hint}>Your team captain will have an invite link or code — paste the code here.</p>
      <form onSubmit={handleSubmit}>
        <FieldRow label="Invite Code *">
          <Input value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your invite code" required />
        </FieldRow>
        <FieldRow label="First Name *"><Input value={firstName} onChange={e => setFirstName(e.target.value)} required /></FieldRow>
        <FieldRow label="Last Name *"> <Input value={lastName}  onChange={e => setLastName(e.target.value)}  required /></FieldRow>
        <FieldRow label="Email *">     <Input value={email}     onChange={e => setEmail(e.target.value)}     required type="email" /></FieldRow>
        <FieldRow label="Handicap">    <Input value={handicap}  onChange={e => setHandicap(e.target.value)}  type="number" placeholder="Optional" /></FieldRow>
        {err && <ErrorMsg msg={err} />}
        <SubmitRow saving={saving} label="Join Team" onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ── FREE AGENT MODAL ──────────────────────────────────────────────────────────

function FreeAgentModal({ eventId, perGolferCents, onClose }: RegistrationModalProps) {
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [handicap,    setHandicap]    = useState('');
  const [pairingNote, setPairingNote] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [done,        setDone]        = useState<RegistrationResult | null>(null);
  const [err,         setErr]         = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    const payload: RegisterFreeAgentPayload = {
      player: {
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim(),
        ...(handicap.trim() ? { handicap: parseFloat(handicap) } : {}),
      },
      ...(pairingNote.trim() ? { pairingNote: pairingNote.trim() } : {}),
    };
    const result = await registerFreeAgent(eventId, payload);
    setSaving(false);
    if (result.ok) setDone(result);
    else setErr(result.message);
  }

  if (done) return <PostRegistration result={done} perGolferCents={perGolferCents} onClose={onClose} />;

  return (
    <Modal title="I Need a Team" onClose={onClose}>
      <p style={s.hint}>Add yourself to the free agent list and the organizer will place you on a team.</p>
      <form onSubmit={handleSubmit}>
        <FieldRow label="First Name *"><Input value={firstName}   onChange={e => setFirstName(e.target.value)}   required /></FieldRow>
        <FieldRow label="Last Name *"> <Input value={lastName}    onChange={e => setLastName(e.target.value)}    required /></FieldRow>
        <FieldRow label="Email *">     <Input value={email}       onChange={e => setEmail(e.target.value)}       required type="email" /></FieldRow>
        <FieldRow label="Handicap">    <Input value={handicap}    onChange={e => setHandicap(e.target.value)}    type="number" placeholder="Optional" /></FieldRow>
        <FieldRow label="Notes">
          <textarea
            value={pairingNote}
            onChange={e => setPairingNote(e.target.value)}
            placeholder="Any scheduling constraints or pairing preferences…"
            style={{ ...s.input, height: 72, resize: 'vertical' } as React.CSSProperties}
          />
        </FieldRow>
        {err && <ErrorMsg msg={err} />}
        <SubmitRow saving={saving} label="Add Me to the List" onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ── DONATE MODAL ──────────────────────────────────────────────────────────────

function DonateModal({ eventCode, orgName, is501c3, onClose }: {
  eventCode: string; orgName: string; is501c3: boolean; onClose: () => void;
}) {
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [dollars, setDollars] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState<string | null>(null);
  const [err,     setErr]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(dollars);
    if (!name.trim() || !email.trim() || isNaN(amt) || amt < 1) {
      setErr('Name, email, and a donation amount of at least $1.00 are required.'); return;
    }
    setSaving(true); setErr(null);
    const payload: DonatePayload = {
      donorName:   name.trim(),
      donorEmail:  email.trim(),
      amountCents: Math.round(amt * 100),
    };
    const result = await submitDonation(eventCode, payload);
    setSaving(false);
    if (result.ok) setDone(result.message);
    else setErr(result.message);
  }

  if (done) return <Modal title="Thank You!" onClose={onClose}><Success message={done} onClose={onClose} /></Modal>;

  return (
    <Modal title={`Donate to ${orgName}`} onClose={onClose}>
      {is501c3 && (
        <p style={s.hint}>
          {orgName} is a 501(c)(3) organization. Donations may be tax-deductible — consult your tax advisor.
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <FieldRow label="Your Name *">  <Input value={name}    onChange={e => setName(e.target.value)}    required /></FieldRow>
        <FieldRow label="Email *">      <Input value={email}   onChange={e => setEmail(e.target.value)}   required type="email" /></FieldRow>
        <FieldRow label="Amount (USD) *">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={s.currencyPrefix}>$</span>
            <Input
              value={dollars}
              onChange={e => setDollars(e.target.value)}
              required
              type="number"
              min="1"
              step="0.01"
              placeholder="25.00"
              style={{ ...s.input, paddingLeft: 28 }}
            />
          </div>
        </FieldRow>
        {err && <ErrorMsg msg={err} />}
        <SubmitRow saving={saving} label="Submit Donation" onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  card:          { backgroundColor: '#fff', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  cardTitle:     { fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '1rem' },
  ctaRow:        { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' },
  ctaBtn:        { display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', transition: 'opacity 0.15s', border: '2px solid var(--color-primary)', textDecoration: 'none' },
  ctaBtnPrimary: { backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)' },
  ctaBtnOutline: { backgroundColor: 'transparent', color: 'var(--color-primary)' },
  ctaNote:       { fontSize: '0.875rem', color: '#4b5563', margin: 0 },
  feeNote:       { fontSize: '0.9rem', color: '#4b5563', margin: '0 0 1rem' },

  feeDueNote: { fontSize: '0.875rem', color: '#8a6d1a', backgroundColor: '#fdf6e3', border: '1px solid #f0e2b6', borderRadius: 8, padding: '0.6rem 0.85rem', marginBottom: '1rem', textAlign: 'left' },
  inviteBox:   { textAlign: 'left', marginBottom: '1.25rem' },
  inviteLabel: { fontSize: '0.8rem', fontWeight: 600, color: '#555', margin: '0 0 0.4rem' },
  copyBtn:     { padding: '0.5rem 0.9rem', borderRadius: 7, border: '1.5px solid var(--color-primary)', backgroundColor: 'transparent', color: 'var(--color-primary)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  appPromo:     { textAlign: 'left', backgroundColor: '#f6f7f6', border: '1px solid #e8e8e8', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem' },
  appPromoText: { fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5, margin: 0 },
  storeLink:    { fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none' },

  donateBtn: { width: '100%', padding: '0.75rem', borderRadius: 8, backgroundColor: 'var(--color-action)', color: 'var(--color-on-action, #fff)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', border: 'none', marginTop: '0.75rem' },

  overlay:     { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { backgroundColor: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  modalTitle:  { fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-primary)', margin: 0 },
  closeBtn:    { background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#888', padding: '4px 6px' },
  hint:        { fontSize: '0.875rem', color: '#4b5563', marginBottom: '1rem', marginTop: 0 },

  fieldRow:   { marginBottom: '1rem' },
  fieldLabel: { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: '0.375rem' },
  input:      { width: '100%', padding: '0.6rem 0.75rem', borderRadius: 7, border: '1.5px solid #ddd', fontSize: '0.95rem', color: '#222', boxSizing: 'border-box', outline: 'none' },

  sectionLabel: { fontSize: '0.8rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, margin: '1rem 0 0.5rem' },
  playerBlock:  { borderTop: '1px solid #f0f0f0', paddingTop: '0.75rem', marginBottom: '0.5rem' },
  playerNum:    { fontSize: '0.8rem', fontWeight: 700, color: '#4b5563', marginBottom: '0.5rem' },
  playerGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },

  errorMsg:  { color: '#c0392b', fontSize: '0.875rem', marginBottom: '0.75rem' },
  submitRow: { display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.6rem 1.25rem', borderRadius: 8, border: '1.5px solid #ddd', background: 'none', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', color: '#555' },
  submitBtn: { padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none', backgroundColor: 'var(--color-action)', color: 'var(--color-on-action, #fff)', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' },

  success:     { textAlign: 'center', padding: '1.5rem 0.5rem' },
  successText: { fontSize: '1rem', color: 'var(--color-primary)', marginBottom: '1.25rem', lineHeight: 1.5 },

  currencyPrefix: { position: 'absolute', left: 10, color: '#555', fontWeight: 600, pointerEvents: 'none' },
};
