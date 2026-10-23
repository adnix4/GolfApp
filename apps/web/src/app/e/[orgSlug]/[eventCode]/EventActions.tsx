'use client';

import { useEffect, useState } from 'react';
import {
  registerTeam,
  joinTeam,
  registerFreeAgent,
  submitDonation,
  createDonationIntent,
  fetchInvitePreview,
  type RegisterTeamPayload,
  type JoinTeamPayload,
  type RegisterFreeAgentPayload,
  type DonatePayload,
  type RegistrationResult,
  type InvitePreview,
} from '@/lib/api';
import {
  formatMoneyInput, dollarsToCents,
  digitsOnly, fmtPhoneInput,
  validateGolfer, validateRoster, toPlayerInput, parseInviteToken,
  SKILL_LEVEL_OPTIONS, AGE_GROUP_OPTIONS, PAIRING_NOTE_MAX,
  type GolferFields, type SkillLevel, type AgeGroup,
} from '@gfp/shared-types';
import EntryFeePayment, { DonationPayment, stripeEnabled, formatUsd } from './EntryFeePayment';

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
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  // A captain's invite link arrives as ?invite=… (via /join). Open "Join a
  // Team" for that team straight away. Read client-side so the page stays static.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite');
    if (token) {
      setInviteToken(token);
      setMode('join');
    }
  }, []);

  function closeModal() {
    setMode(null);
    setInviteToken(null);
  }

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

      {mode === 'team'      && <RegisterTeamModal eventId={eventId} perGolferCents={entryFeeCents} onClose={closeModal} />}
      {mode === 'join'      && <JoinTeamModal     eventId={eventId} perGolferCents={entryFeeCents} onClose={closeModal} inviteToken={inviteToken} />}
      {mode === 'freeagent' && <FreeAgentModal    eventId={eventId} perGolferCents={entryFeeCents} onClose={closeModal} />}
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
        {result.inviteUrl && <InviteShare url={result.inviteUrl} expiresAt={result.inviteExpiresAt ?? null} />}
        <AppPromo />
        <button onClick={onClose} style={s.submitBtn}>Close</button>
      </div>
    </Modal>
  );
}

/** "Mar 14, 2027" — rendered only after a submit, so there is nothing to hydrate. */
function fmtInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function InviteShare({ url, expiresAt }: { url: string; expiresAt: string | null }) {
  const [copied, setCopied] = useState(false);
  // The OS share sheet (phones, most tablets) is how a captain actually sends
  // this — into a group text. Desktop browsers without it keep Copy.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  function share() {
    navigator.share({
      title: 'Join my golf team',
      text:  'Join my team for the tournament — sign up here:',
      url,
    }).catch(() => { /* dismissed the share sheet */ });
  }

  return (
    <div style={s.inviteBox}>
      <p style={s.inviteLabel}>Invite your teammates — send them this link so they can join (and pay) themselves:</p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input readOnly value={url} style={{ ...s.input, fontSize: '0.8rem' }} onFocus={e => e.target.select()} />
        {canShare && (
          <button type="button" style={s.copyBtn} onClick={share}>Share…</button>
        )}
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
      {expiresAt && (
        <p style={s.inviteNote}>The link works until the tournament starts ({fmtInviteDate(expiresAt)}) or your team fills up.</p>
      )}
    </div>
  );
}

/**
 * Picks the store listing for the browsing device. Runs only from a click
 * handler, so `navigator` is always defined and there is nothing to hydrate.
 * Returns '' on desktop, or when that platform's listing is not published yet.
 */
function storeUrlForDevice(): string {
  const ua = navigator.userAgent;
  // iPadOS 13+ masquerades as macOS but is still a touch device.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return IOS_STORE_URL;
  if (/Android/i.test(ua)) return ANDROID_STORE_URL;
  return '';
}

/** Post-registration nudge toward the scorer app — the golfer now has a reason to install it. */
function AppPromo() {
  const [showStores, setShowStores] = useState(false);

  const anyStoreLive = !!(IOS_STORE_URL || ANDROID_STORE_URL);

  function handleGetApp() {
    // On a phone with that platform's listing live, go straight to the store.
    const direct = storeUrlForDevice();
    if (direct) {
      window.open(direct, '_blank', 'noopener,noreferrer');
      return;
    }
    // Otherwise fall back to the dialog: a store chooser on desktop, or the
    // coming-soon notice while the app is still unpublished.
    setShowStores(true);
  }

  return (
    <div style={s.appPromo}>
      <p style={s.appPromoText}>
        📱 On event day, keep score with the <strong>GFP Scorer</strong> app — it works even
        without a signal and feeds the live leaderboard.
      </p>

      <button type="button" onClick={handleGetApp} style={s.getAppBtn}>
        Get the App
      </button>

      {showStores && <StoreDialog onClose={() => setShowStores(false)} live={anyStoreLive} />}
    </div>
  );
}

/**
 * Nested inside the registration-success modal, so it needs a higher z-index
 * than the modal it sits on top of.
 */
function StoreDialog({ live, onClose }: { live: boolean; onClose: () => void }) {
  return (
    <div style={{ ...s.overlay, zIndex: 1100 }} onClick={onClose}>
      <div style={{ ...s.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>{live ? 'Get the GFP Scorer App' : 'Coming Soon'}</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {live ? (
          <>
            <p style={s.appPromoText}>Choose your device to install the app:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '1rem 0' }}>
              {IOS_STORE_URL && (
                <a href={IOS_STORE_URL} target="_blank" rel="noopener noreferrer" style={s.storeBtn}>
                   Download on the App Store
                </a>
              )}
              {ANDROID_STORE_URL && (
                <a href={ANDROID_STORE_URL} target="_blank" rel="noopener noreferrer" style={s.storeBtn}>
                  ▶ Get it on Google Play
                </a>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Explicit {' '} — the surrounding text node carries an HTML entity,
                and the literal space after </strong> gets trimmed without it. */}
            <p style={{ ...s.appPromoText, fontSize: '0.95rem' }}>
              🚧 The <strong>GFP Scorer</strong>{' '}
              app is not in the app stores just yet — we&apos;re putting the finishing touches on it.
            </p>
            <p style={{ ...s.appPromoText, marginTop: '0.75rem' }}>
              You&apos;re already registered, so nothing else is needed right now. Your organizer
              will send install instructions before event day, and you can always follow the live
              leaderboard right here in your browser.
            </p>
          </>
        )}

        {/* submitBtn has no alignment of its own — it is centered by the
            success wrapper elsewhere, so center it explicitly here. */}
        <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
          <button onClick={onClose} style={s.submitBtn}>Got It</button>
        </div>
      </div>
    </div>
  );
}

// ── GOLFER FIELDS ─────────────────────────────────────────────────────────────
// The same fields in every registration form, on every app — see
// packages/shared-types/src/registration.ts for what each is for and the rules.

const blankGolfer = (): GolferFields => ({ firstName: '', lastName: '', email: '', phone: '', handicap: '' });

function isBlankGolfer(g: GolferFields): boolean {
  return !g.firstName.trim() && !g.lastName.trim() && !g.email.trim()
    && !digitsOnly(g.phone ?? '') && !(g.handicap ?? '').trim();
}

function GolferInputs({ golfer, onChange, phoneRequired, required = true }: {
  golfer:        GolferFields;
  onChange:      (next: GolferFields) => void;
  phoneRequired: boolean;
  /** Teammate rows the captain may leave empty don't mark the name/email required. */
  required?:     boolean;
}) {
  const set = (field: keyof GolferFields, value: string) => onChange({ ...golfer, [field]: value });
  return (
    <div style={s.playerGrid}>
      <Input value={golfer.firstName} onChange={e => set('firstName', e.target.value)} placeholder={`First name${required ? ' *' : ''}`} required={required} autoComplete="given-name" />
      <Input value={golfer.lastName}  onChange={e => set('lastName',  e.target.value)} placeholder={`Last name${required ? ' *' : ''}`}  required={required} autoComplete="family-name" />
      <Input value={golfer.email}     onChange={e => set('email',     e.target.value)} placeholder={`Email${required ? ' *' : ''}`}      required={required} type="email" autoComplete="email" style={{ ...s.input, gridColumn: '1 / -1' }} />
      <Input
        value={golfer.phone ?? ''}
        onChange={e => set('phone', fmtPhoneInput(digitsOnly(e.target.value)))}
        placeholder={phoneRequired ? 'Phone *' : 'Phone (optional)'}
        required={phoneRequired}
        type="tel" inputMode="tel" autoComplete="tel"
      />
      <Input
        value={golfer.handicap ?? ''}
        onChange={e => set('handicap', e.target.value)}
        placeholder="Handicap (optional)"
        inputMode="decimal"
        title="Your handicap index, 0–54. Leave blank if you don't have one."
      />
    </div>
  );
}

// ── REGISTER TEAM MODAL ───────────────────────────────────────────────────────

interface RegistrationModalProps {
  eventId:        string;
  perGolferCents: number | null;
  onClose:        () => void;
}

const TEAM_ROWS = 4;

function RegisterTeamModal({ eventId, perGolferCents, onClose }: RegistrationModalProps) {
  const [teamName, setTeamName] = useState('');
  const [players,  setPlayers]  = useState<GolferFields[]>(() => Array.from({ length: TEAM_ROWS }, blankGolfer));
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState<RegistrationResult | null>(null);
  const [err,    setErr]    = useState<string | null>(null);

  function updatePlayer(i: number, next: GolferFields) {
    setPlayers(prev => prev.map((p, idx) => idx === i ? next : p));
    setErr(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) { setErr('Team name is required.'); return; }
    // Player 1 (you) always counts; empty teammate rows are skipped, and a
    // half-filled one is reported rather than silently dropped.
    const roster = players.filter((p, i) => i === 0 || !isBlankGolfer(p));
    const problem = validateRoster(roster, {
      first:      { phoneRequired: true, label: 'You' },
      otherLabel: i => `Player ${players.indexOf(roster[i]) + 1}`,
    });
    if (problem) { setErr(problem); return; }

    setSaving(true); setErr(null);
    const payload: RegisterTeamPayload = {
      teamName: teamName.trim(),
      players:  roster.map(toPlayerInput),
    };
    const result = await registerTeam(eventId, payload);
    setSaving(false);
    if (result.ok) setDone(result);
    else setErr(result.message);
  }

  if (done) return <PostRegistration result={done} perGolferCents={perGolferCents} onClose={onClose} />;

  return (
    <Modal title="Register a Team" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <FieldRow label="Team Name *">
          <Input value={teamName} onChange={e => { setTeamName(e.target.value); setErr(null); }} placeholder="The Eagles" required maxLength={200} />
        </FieldRow>

        <p style={s.sectionLabel}>Players</p>
        <p style={s.hint}>
          You&apos;re the captain. Add teammates now, or leave rows empty — after you register you&apos;ll
          get a link to send them so they can sign themselves up.
        </p>
        {players.map((p, i) => (
          <div key={i} style={s.playerBlock}>
            <p style={s.playerNum}>{i === 0 ? 'Player 1 — you (captain) *' : `Player ${i + 1}`}</p>
            <GolferInputs golfer={p} onChange={next => updatePlayer(i, next)} phoneRequired={i === 0} required={i === 0} />
          </div>
        ))}

        {err && <ErrorMsg msg={err} />}
        <SubmitRow saving={saving} label="Register Team" onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ── JOIN TEAM MODAL ───────────────────────────────────────────────────────────
// Opened by a captain's invite link (inviteToken set: the team is shown and no
// code is asked for) or by the "Join a Team" button (paste the code).

function JoinTeamModal({ eventId, perGolferCents, onClose, inviteToken }: RegistrationModalProps & {
  inviteToken: string | null;
}) {
  const [token,   setToken]   = useState(inviteToken ?? '');
  const [golfer,  setGolfer]  = useState<GolferFields>(blankGolfer);
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState<RegistrationResult | null>(null);
  const [err,     setErr]     = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    let live = true;
    fetchInvitePreview(eventId, inviteToken).then(r => {
      if (!live) return;
      if (r.ok) setPreview(r.preview);
      else setLinkErr(r.message);
    });
    return () => { live = false; };
  }, [eventId, inviteToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) { setErr('Paste the invite link or code from your team captain.'); return; }
    // Golfers paste the captain's whole link as often as the bare code.
    const inviteCode = parseInviteToken(token);
    if (!inviteCode) { setErr('That doesn’t look like an invite. Paste the whole link from your team captain.'); return; }
    const problem = validateGolfer(golfer, { phoneRequired: true });
    if (problem) { setErr(problem); return; }

    setSaving(true); setErr(null);
    const payload: JoinTeamPayload = { inviteToken: inviteCode, player: toPlayerInput(golfer) };
    const result = await joinTeam(eventId, payload);
    setSaving(false);
    if (result.ok) setDone(result);
    else setErr(result.message);
  }

  if (done) return <PostRegistration result={done} perGolferCents={perGolferCents} onClose={onClose} />;

  const full = preview?.isFull ?? false;
  const title = preview ? `Join ${preview.teamName}` : 'Join a Team';

  return (
    <Modal title={title} onClose={onClose}>
      {inviteToken && linkErr && (
        <>
          <ErrorMsg msg={linkErr} />
          <p style={s.hint}>Ask your team captain to send you a new link, or register on your own.</p>
          <div style={s.submitRow}>
            <button type="button" onClick={onClose} style={s.cancelBtn}>Close</button>
          </div>
        </>
      )}

      {inviteToken && !linkErr && !preview && <p style={s.hint}>Checking your invite…</p>}

      {preview && (
        <div style={s.previewBox}>
          <p style={s.previewTeam}>{preview.teamName}</p>
          <p style={s.previewMeta}>
            {preview.playerNames.length > 0 ? `With ${preview.playerNames.join(', ')}` : 'No players yet'}
            {' · '}
            {full ? 'Team is full' : `${preview.spotsRemaining} spot${preview.spotsRemaining === 1 ? '' : 's'} left`}
          </p>
        </div>
      )}

      {full && (
        <div style={s.submitRow}>
          <button type="button" onClick={onClose} style={s.cancelBtn}>Close</button>
        </div>
      )}

      {(!inviteToken || (preview && !full)) && (
        <form onSubmit={handleSubmit} noValidate>
          {!inviteToken && (
            <>
              <p style={s.hint}>Your team captain has an invite link for you — open it to join their team, or paste the link or code here.</p>
              <FieldRow label="Invite Link or Code *">
                <Input value={token} onChange={e => { setToken(e.target.value); setErr(null); }} placeholder="Paste your invite link or code" required />
              </FieldRow>
            </>
          )}
          <p style={s.sectionLabel}>Your details</p>
          <GolferInputs golfer={golfer} onChange={next => { setGolfer(next); setErr(null); }} phoneRequired />
          {err && <ErrorMsg msg={err} />}
          <SubmitRow saving={saving} label="Join Team" onCancel={onClose} />
        </form>
      )}
    </Modal>
  );
}

// ── FREE AGENT MODAL ──────────────────────────────────────────────────────────

function ChoiceChips<T extends string>({ options, value, onChange }: {
  options:  { value: T; label: string }[];
  value:    T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div style={s.chipRow}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
          style={{ ...s.chip, ...(value === o.value ? s.chipOn : {}) }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FreeAgentModal({ eventId, perGolferCents, onClose }: RegistrationModalProps) {
  const [golfer,      setGolfer]      = useState<GolferFields>(blankGolfer);
  const [skillLevel,  setSkillLevel]  = useState<SkillLevel | null>(null);
  const [ageGroup,    setAgeGroup]    = useState<AgeGroup | null>(null);
  const [pairingNote, setPairingNote] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [done,        setDone]        = useState<RegistrationResult | null>(null);
  const [err,         setErr]         = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateGolfer(golfer, { phoneRequired: true });
    if (problem) { setErr(problem); return; }

    setSaving(true); setErr(null);
    const payload: RegisterFreeAgentPayload = {
      player: toPlayerInput(golfer),
      ...(skillLevel ? { skillLevel } : {}),
      ...(ageGroup   ? { ageGroup }   : {}),
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
      <form onSubmit={handleSubmit} noValidate>
        <p style={s.sectionLabel}>Your details</p>
        <GolferInputs golfer={golfer} onChange={next => { setGolfer(next); setErr(null); }} phoneRequired />

        <p style={s.sectionLabel}>Pairing preferences (optional)</p>
        <FieldRow label="Skill Level">
          <ChoiceChips options={SKILL_LEVEL_OPTIONS} value={skillLevel} onChange={setSkillLevel} />
        </FieldRow>
        <FieldRow label="Age Group">
          <ChoiceChips options={AGE_GROUP_OPTIONS} value={ageGroup} onChange={setAgeGroup} />
        </FieldRow>
        <FieldRow label="Note to the Organizer">
          <textarea
            value={pairingNote}
            onChange={e => setPairingNote(e.target.value)}
            maxLength={PAIRING_NOTE_MAX}
            placeholder="e.g. I know the Johnson family — please pair me with them if possible."
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

  // Set once the PaymentIntent exists — switches the modal to the card step.
  const [pay, setPay] = useState<{ clientSecret: string; amountCents: number } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = dollarsToCents(dollars);
    if (!name.trim() || !email.trim() || amountCents < 100) {
      setErr('Name, email, and a donation amount of at least $1.00 are required.'); return;
    }
    setSaving(true); setErr(null);
    const payload: DonatePayload = {
      donorName:   name.trim(),
      donorEmail:  email.trim(),
      amountCents,
    };

    // With Stripe configured the donor pays by card now; otherwise fall back to
    // recording an offline pledge for the organizer to collect.
    if (stripeEnabled) {
      const intent = await createDonationIntent(eventCode, payload);
      setSaving(false);
      if (intent.ok && intent.clientSecret) {
        setPay({ clientSecret: intent.clientSecret, amountCents: intent.amountCents ?? amountCents });
      } else {
        setErr(intent.message);
      }
      return;
    }

    const result = await submitDonation(eventCode, payload);
    setSaving(false);
    if (result.ok) setDone(result.message);
    else setErr(result.message);
  }

  if (done) return <Modal title="Thank You!" onClose={onClose}><Success message={done} onClose={onClose} /></Modal>;

  if (pay) return (
    <Modal title={`Donate to ${orgName}`} onClose={onClose}>
      <DonationPayment
        clientSecret={pay.clientSecret}
        amountCents={pay.amountCents}
        orgName={orgName}
        onPaid={() => setDone(
          `Thank you, ${name.trim()}! Your donation of ${formatUsd(pay.amountCents)} has been received.`,
        )}
      />
    </Modal>
  );

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
          <Input
            value={dollars}
            onChange={e => setDollars(formatMoneyInput(e.target.value))}
            required
            type="text"
            inputMode="numeric"
            placeholder="$25.00"
          />
        </FieldRow>
        {err && <ErrorMsg msg={err} />}
        <SubmitRow
          saving={saving}
          label={stripeEnabled ? 'Continue to Payment' : 'Submit Donation'}
          onCancel={onClose}
        />
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
  inviteNote:  { fontSize: '0.75rem', color: '#6b7280', margin: '0.4rem 0 0' },
  previewBox:  { backgroundColor: '#f6f7f6', border: '1px solid #e8e8e8', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' },
  previewTeam: { fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', margin: '0 0 0.25rem' },
  previewMeta: { fontSize: '0.85rem', color: '#4b5563', margin: 0, lineHeight: 1.5 },
  chipRow:     { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
  chip:        { padding: '0.35rem 0.8rem', borderRadius: 999, border: '1.5px solid #ddd', background: 'none', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: '#4b5563' },
  chipOn:      { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)' },
  copyBtn:     { padding: '0.5rem 0.9rem', borderRadius: 7, border: '1.5px solid var(--color-primary)', backgroundColor: 'transparent', color: 'var(--color-primary)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  appPromo:     { textAlign: 'left', backgroundColor: '#f6f7f6', border: '1px solid #e8e8e8', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem' },
  appPromoText: { fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5, margin: 0 },

  // Outlined so the promo never competes with the modal's primary action.
  getAppBtn: {
    width: '100%', marginTop: '0.75rem', padding: '0.6rem 0.9rem', borderRadius: 7,
    border: '1.5px solid var(--color-primary)', backgroundColor: 'transparent',
    color: 'var(--color-primary)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
  },
  storeBtn: {
    display: 'block', width: '100%', padding: '0.7rem 0.9rem', borderRadius: 7,
    backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)',
    fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none', textAlign: 'center',
  },

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
