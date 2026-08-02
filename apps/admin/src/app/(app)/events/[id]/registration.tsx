import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { teamsApi, playersApi, eventsApi, type Team, type Player } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { confirmAction } from '@/lib/confirmAction';
import {
  isCheckedIn as statusIsCheckedIn, checkInConfirmCopy, cardlessHint,
  canCheckInWholeTeam, golfersWithoutCard,
} from '@/lib/checkIn';
import { AddCardModal, cardCaptureEnabled } from '@/components/AddCardModal';

type Filter = 'all' | 'pending' | 'checked_in';

export default function RegistrationScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const { isMobile, pagePadding } = useResponsive();

  const [teams,   setTeams]   = useState<Team[]>([]);
  const [guests,  setGuests]  = useState<Player[]>([]);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  // A free event has no fee state worth showing (D16) — without this the screen
  // offers "Mark All Paid", which records a 0 that every reader treats as
  // unpaid, so the button never resolves.
  const [entryFeeCents, setEntryFeeCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<Filter>('all');
  const [busy,       setBusy]       = useState<Record<string, boolean>>({});
  const [walkUpOpen, setWalkUpOpen] = useState(false);
  // Capturing a card at the desk is what stops a checked-in golfer bidding all
  // evening against a charge that can never land.
  const [cardFor, setCardFor] = useState<Player | null>(null);

  // Check-in is Active/Scoring only server-side; without the event status this
  // screen would render Check In buttons that 400 once the round ends.
  const checkInOpen = eventStatus === 'Active' || eventStatus === 'Scoring';

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [teamList, players, evt] = await Promise.all([
        teamsApi.list(id),
        playersApi.list(id),
        eventsApi.get(id),
      ]);
      setTeams(teamList);
      // Guests are the team-less attendees — they never appear on a roster.
      setGuests(players.filter(p => p.registrationType === 'Attendee'));
      setEventStatus(evt.status);
      // Fee lives in the raw event config — EventDetail has no typed field.
      const fee = evt.config?.entryFeeCents;
      setEntryFeeCents(typeof fee === 'number' ? fee : null);
    }
    catch (e: any) { setError(e.message ?? 'Failed to load teams.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCheckIn(teamId: string) {
    setBusy(b => ({ ...b, [teamId + '_ci']: true }));
    setError(null);
    try {
      const updated = await teamsApi.checkIn(id, teamId);
      setTeams(prev => prev.map(t => t.id === teamId ? updated : t));
    } catch (e: any) { setError(e.message ?? 'Check-in failed.'); }
    finally { setBusy(b => ({ ...b, [teamId + '_ci']: false })); }
  }

  // Guests have no team, so there is no team status to promote — just merge.
  async function checkInGuest(guest: Player) {
    setBusy(b => ({ ...b, [guest.id + '_ci']: true }));
    setError(null);
    try {
      const updated = await playersApi.checkIn(id, guest.id);
      setGuests(prev => prev.map(g => g.id === updated.id ? updated : g));
    } catch (e: any) { setError(e.message ?? 'Check-in failed.'); }
    finally { setBusy(b => ({ ...b, [guest.id + '_ci']: false })); }
  }

  // Per-golfer check-in. The server promotes the team to Complete once the last
  // golfer is in, so the team status below repaints from the merged player.
  async function checkInGolfer(player: Player) {
    setBusy(b => ({ ...b, [player.id + '_ci']: true }));
    setError(null);
    try {
      const updated = await playersApi.checkIn(id, player.id);
      setTeams(prev => prev.map(t => {
        if (t.id !== player.teamId) return t;
        const players = t.players.map(p => p.id === updated.id ? updated : p);
        return {
          ...t,
          players,
          checkInStatus: players.every(p => statusIsCheckedIn(p.checkInStatus))
            ? 'Complete'
            : t.checkInStatus,
        };
      }));
    } catch (e: any) { setError(e.message ?? 'Check-in failed.'); }
    finally { setBusy(b => ({ ...b, [player.id + '_ci']: false })); }
  }

  // Per-golfer fee (D11). This is the cash actually handed over at the desk, so
  // EventStaff can record it; the roster-wide "Mark All Paid" below stays
  // OrgAdmin. Updates the team's playersPaid count so the pill repaints.
  async function markGolferPaid(player: Player) {
    setBusy(b => ({ ...b, [player.id + '_fee']: true }));
    setError(null);
    try {
      const updated = await playersApi.markFeePaid(id, player.id);
      setTeams(prev => prev.map(t => {
        if (t.id !== player.teamId) return t;
        const players = t.players.map(p => p.id === updated.id ? updated : p);
        return {
          ...t,
          players,
          playersPaid: players.filter(p => p.entryFeePaidCents > 0).length,
        };
      }));
    } catch (e: any) { setError(e.message ?? 'Failed to record the fee.'); }
    finally { setBusy(b => ({ ...b, [player.id + '_fee']: false })); }
  }

  async function handleMarkPaid(teamId: string) {
    setBusy(b => ({ ...b, [teamId + '_fee']: true }));
    try {
      const updated = await teamsApi.markFeePaid(id, teamId);
      setTeams(prev => prev.map(t => t.id === teamId ? updated : t));
    } catch (e: any) { setError(e.message ?? 'Failed to mark fee paid.'); }
    finally { setBusy(b => ({ ...b, [teamId + '_fee']: false })); }
  }

  const filtered = teams.filter(t =>
    filter === 'all'        ? true :
    filter === 'pending'    ? !statusIsCheckedIn(t.checkInStatus) :
    /* checked_in */          statusIsCheckedIn(t.checkInStatus),
  );

  const checkedIn   = teams.filter(t => statusIsCheckedIn(t.checkInStatus)).length;
  // Fees are per golfer — count paid golfers across all rosters.
  const golfersPaid  = teams.reduce((n, t) => n + t.playersPaid, 0);
  const golfersTotal = teams.reduce((n, t) => n + t.players.length, 0);
  // Nothing to collect — hide every fee affordance rather than show a state
  // that can never resolve.
  const hasEntryFee  = (entryFeeCents ?? 0) > 0;

  return (
    <View style={styles.page}>
      {/* Walk-up modal */}
      <WalkUpModal
        visible={walkUpOpen}
        eventId={id}
        onClose={() => setWalkUpOpen(false)}
        onRegistered={team => { setTeams(prev => [...prev, team]); setWalkUpOpen(false); }}
        onGuestRegistered={guest => { setGuests(prev => [...prev, guest]); setWalkUpOpen(false); }}
      />

      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: pagePadding }]}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Registration
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setWalkUpOpen(true)}
            style={[styles.walkUpBtn, { backgroundColor: theme.colors.action }]}
          >
            <Text style={[styles.walkUpBtnText, { color: theme.ctaLabel }]}>+ Walk-Up</Text>
          </Pressable>
          <Pressable onPress={load} style={styles.refreshBtn} accessibilityLabel="Refresh">
            <Text style={[styles.refreshText, { color: theme.mutedText }]}>↻ Refresh</Text>
          </Pressable>
        </View>
      </View>

      {/* Stats strip */}
      {!loading && (
        <View style={[
          styles.statsRow,
          { backgroundColor: theme.colors.surface, paddingHorizontal: pagePadding },
          isMobile && styles.statsRowMobile,
        ]}>
          <StatChip label="Total"      value={teams.length}              color={theme.colors.primary} style={isMobile ? styles.statHalf : undefined} />
          <StatChip label="Checked In" value={checkedIn}                 color="#27ae60"              style={isMobile ? styles.statHalf : undefined} />
          {hasEntryFee && (
            <StatChip label={`Golfers Paid (of ${golfersTotal})`} value={golfersPaid} color="#2980b9"   style={isMobile ? styles.statHalf : undefined} />
          )}
          <StatChip label="Pending"    value={teams.length - checkedIn}  color="#f39c12"              style={isMobile ? styles.statHalf : undefined} />
        </View>
      )}

      {/* Filter tabs */}
      <View style={[styles.filterRow, { borderBottomColor: '#e0e0e0' }]}>
        {(['all', 'pending', 'checked_in'] as Filter[]).map(f => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterBtn, filter === f && { borderBottomColor: theme.colors.primary }]}
          >
            <Text style={[
              styles.filterText,
              { color: filter === f ? theme.colors.primary : theme.mutedText },
              filter === f && { fontWeight: '700' },
            ]}>
              {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Checked In'}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.center}>
            <Text style={[styles.emptyText, { color: theme.mutedText }]}>No teams match this filter.</Text>
          </View>
          <GuestsSection
            guests={guests} checkInOpen={checkInOpen} busy={busy}
            onCheckIn={checkInGuest} theme={theme}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            <GuestsSection
              guests={guests} checkInOpen={checkInOpen} busy={busy}
              onCheckIn={checkInGuest} theme={theme}
            />
          }
          renderItem={({ item: team }) => {
            const isCheckedIn = statusIsCheckedIn(team.checkInStatus);
            // The whole-team fast path is only offered when nobody on the roster
            // is cardless — a cardless check-in carries a collection risk the
            // organizer must accept per golfer, not in bulk.
            const cardless      = golfersWithoutCard(team.players);
            const canCheckInAll = canCheckInWholeTeam(team.players);
            return (
              <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.teamName, { color: theme.colors.primary }]}>{team.name}</Text>
                    <Text style={[styles.meta, { color: theme.mutedText }]}>
                      {team.players.length} player{team.players.length !== 1 ? 's' : ''}
                      {team.startingHole ? ` · Hole ${team.startingHole}` : ''}
                      {team.teeTime ? ` · ${new Date(team.teeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: isCheckedIn ? '#2ecc71' : '#f39c12' },
                  ]}>
                    <Text style={styles.statusText}>
                      {isCheckedIn ? 'Checked In' : 'Pending'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  {/* Fee status — per golfer; the button marks the whole roster
                      paid. Suppressed entirely on a free event (D16). */}
                  {!hasEntryFee ? null : team.entryFeePaid ? (
                    <View style={[styles.pill, { borderColor: '#27ae60' }]}>
                      <Text style={[styles.pillText, { color: '#27ae60' }]}>✓ Fees Paid</Text>
                    </View>
                  ) : (
                    <>
                      {/* Always show the count, including 0 — hiding it at zero
                          left a team with an unpaid roster looking identical to
                          one with no fee at all. */}
                      <View style={[styles.pill, { borderColor: '#f39c12' }]}>
                        <Text style={[styles.pillText, { color: '#f39c12' }]}>
                          {team.playersPaid}/{team.players.length} paid
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleMarkPaid(team.id)}
                        disabled={busy[team.id + '_fee']}
                        style={[styles.actionBtn, { borderColor: '#2980b9' }]}
                      >
                        {busy[team.id + '_fee']
                          ? <ActivityIndicator size="small" color="#2980b9" />
                          : <Text style={[styles.actionBtnText, { color: '#2980b9' }]}>Mark All Paid</Text>}
                      </Pressable>
                    </>
                  )}

                  {/* Whole-team check-in — only when no golfer is cardless */}
                  {checkInOpen && !isCheckedIn && canCheckInAll && (
                    <Pressable
                      onPress={() => handleCheckIn(team.id)}
                      disabled={busy[team.id + '_ci']}
                      style={[styles.actionBtn, { borderColor: theme.colors.action, backgroundColor: theme.colors.action }]}
                    >
                      {busy[team.id + '_ci']
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={[styles.actionBtnText, { color: theme.ctaLabel }]}>Check In Team</Text>}
                    </Pressable>
                  )}
                </View>

                {/* Why the team button is missing — otherwise the organizer just
                    sees it on some teams and not others with no explanation. */}
                {checkInOpen && !isCheckedIn && !canCheckInAll && team.players.length > 0 && (
                  <Text style={[styles.cardlessHint, { color: theme.mutedText }]}>
                    {cardlessHint(cardless.length, team.players.length)}
                  </Text>
                )}

                {/* Roster — per-golfer check-in */}
                {team.players.length > 0 && (
                  <View style={styles.roster}>
                    {team.players.map(player => {
                      const golferIn = statusIsCheckedIn(player.checkInStatus);
                      const name = `${player.firstName} ${player.lastName}`.trim();
                      return (
                        <View key={player.id} style={styles.golferRow}>
                          <Text style={[styles.golferName, { color: theme.colors.primary }]} numberOfLines={1}>
                            {name}
                          </Text>
                          {player.hasPaymentMethod ? (
                            <Text style={[styles.cardTag, { color: '#27ae60' }]}>✓ card</Text>
                          ) : cardCaptureEnabled ? (
                            // Tap the warning to key the card in at the desk.
                            <Pressable onPress={() => setCardFor(player)}>
                              <Text style={[styles.cardTag, styles.cardTagAction, { color: '#f39c12' }]}>
                                ⚠ add card
                              </Text>
                            </Pressable>
                          ) : (
                            <Text style={[styles.cardTag, { color: '#f39c12' }]}>⚠ no card</Text>
                          )}
                          {/* Cash/check taken at the desk — one golfer (D11).
                              Hidden on free events, same rule as the team row. */}
                          {hasEntryFee && (
                            player.entryFeePaidCents > 0 ? (
                              <Text style={[styles.cardTag, { color: '#27ae60' }]}>✓ paid</Text>
                            ) : (
                              <Pressable
                                onPress={() => confirmAction(
                                  'Record entry fee?',
                                  `Mark ${name} as having paid the entry fee in cash or by check. `
                                  + 'This records only this golfer, not the rest of the team.',
                                  () => markGolferPaid(player),
                                  'Record Payment',
                                )}
                                disabled={busy[player.id + '_fee']}
                                style={[styles.golferBtn, { borderColor: '#2980b9' }]}
                              >
                                {busy[player.id + '_fee']
                                  ? <ActivityIndicator size="small" color="#2980b9" />
                                  : <Text style={[styles.golferBtnText, { color: '#2980b9' }]}>Take Fee</Text>}
                              </Pressable>
                            )
                          )}
                          {golferIn ? (
                            <Text style={[styles.golferDone, { color: '#27ae60' }]}>Checked In</Text>
                          ) : !checkInOpen ? (
                            <Text style={[styles.golferDone, { color: theme.mutedText }]}>Pending</Text>
                          ) : (
                            <Pressable
                              onPress={() => {
                                const c = checkInConfirmCopy(name, player.hasPaymentMethod);
                                confirmAction(c.title, c.message, () => checkInGolfer(player), c.confirmText);
                              }}
                              disabled={busy[player.id + '_ci']}
                              style={[styles.golferBtn, { borderColor: theme.colors.action }]}
                            >
                              {busy[player.id + '_ci']
                                ? <ActivityIndicator size="small" color={theme.colors.action} />
                                : <Text style={[styles.golferBtnText, { color: theme.colors.action }]}>Check In</Text>}
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {cardFor && (
        <AddCardModal
          visible
          eventId={id}
          playerId={cardFor.id}
          playerName={`${cardFor.firstName} ${cardFor.lastName}`.trim()}
          onClose={() => setCardFor(null)}
          onSaved={load}
        />
      )}
    </View>
  );
}

// ── GUESTS ────────────────────────────────────────────────────────────────────
//
// Non-golfers registered so they can bid. They have no team, so they appear
// nowhere in the roster list above — without this section they could never be
// checked in, and check-in is precisely what lets a cardless guest bid.

interface GuestsSectionProps {
  guests:      Player[];
  checkInOpen: boolean;
  busy:        Record<string, boolean>;
  onCheckIn:   (guest: Player) => void;
  theme:       ReturnType<typeof useTheme>;
}

function GuestsSection({ guests, checkInOpen, busy, onCheckIn, theme }: GuestsSectionProps) {
  if (guests.length === 0) return null;

  return (
    <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
      <Text style={[styles.teamName, { color: theme.colors.primary }]}>
        Guests ({guests.length})
      </Text>
      <Text style={[styles.meta, { color: theme.mutedText }]}>
        Not playing — auction bidding only
      </Text>

      <View style={styles.roster}>
        {guests.map(guest => {
          const guestIn = statusIsCheckedIn(guest.checkInStatus);
          const name    = `${guest.firstName} ${guest.lastName}`.trim();
          return (
            <View key={guest.id} style={styles.golferRow}>
              <Text style={[styles.golferName, { color: theme.colors.primary }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[
                styles.cardTag,
                { color: guest.hasPaymentMethod ? '#27ae60' : '#f39c12' },
              ]}>
                {guest.hasPaymentMethod ? '✓ card' : '⚠ no card'}
              </Text>
              {guestIn ? (
                <Text style={[styles.golferDone, { color: '#27ae60' }]}>Checked In</Text>
              ) : !checkInOpen ? (
                <Text style={[styles.golferDone, { color: theme.mutedText }]}>Pending</Text>
              ) : (
                <Pressable
                  onPress={() => {
                    const c = checkInConfirmCopy(name, guest.hasPaymentMethod);
                    confirmAction(c.title, c.message, () => onCheckIn(guest), c.confirmText);
                  }}
                  disabled={busy[guest.id + '_ci']}
                  style={[styles.golferBtn, { borderColor: theme.colors.action }]}
                >
                  {busy[guest.id + '_ci']
                    ? <ActivityIndicator size="small" color={theme.colors.action} />
                    : <Text style={[styles.golferBtnText, { color: theme.colors.action }]}>Check In</Text>}
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── WALK-UP MODAL ─────────────────────────────────────────────────────────────

interface WalkUpModalProps {
  visible:          boolean;
  eventId:          string;
  onClose:          () => void;
  onRegistered:     (team: Team) => void;
  onGuestRegistered:(guest: Player) => void;
}

function WalkUpModal({ visible, eventId, onClose, onRegistered, onGuestRegistered }: WalkUpModalProps) {
  const theme = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [teamName,  setTeamName]  = useState('');
  const [handicap,  setHandicap]  = useState('');
  const [isGuest,   setIsGuest]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState<string | null>(null);

  function reset() {
    setFirstName(''); setLastName(''); setEmail('');
    setTeamName(''); setHandicap(''); setIsGuest(false); setErr(null);
  }

  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErr('First name, last name, and email are required.'); return;
    }
    setSaving(true); setErr(null);
    try {
      if (isGuest) {
        // A guest is not playing, so they get no team — which keeps them off the
        // leaderboard, out of pairings, and out of the check-in counts that gate
        // Open Scoring. They still become a player row so they can bid.
        const guest = await playersApi.add(eventId, {
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          email:     email.trim(),
          isAttendee: true,
        });
        reset();
        onGuestRegistered(guest);
        return;
      }
      const name = teamName.trim() || `${lastName.trim()} Walk-up`;
      const hcp  = handicap.trim() ? parseFloat(handicap) : undefined;
      const { team } = await teamsApi.registerTeam(eventId, {
        teamName: name,
        players:  [{ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), handicap: hcp }],
      });
      reset();
      onRegistered(team);
    } catch (e: any) {
      setErr(e.message ?? 'Registration failed.');
    } finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: '#fff' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
              {isGuest ? 'Add Guest' : 'Walk-Up Registration'}
            </Text>
            <Pressable onPress={handleClose} style={styles.modalClose}>
              <Text style={{ fontSize: 20, color: theme.mutedText }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            <Pressable
              onPress={() => setIsGuest(v => !v)}
              style={styles.guestToggleRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isGuest }}
            >
              <View style={[
                styles.guestCheckbox,
                { borderColor: theme.colors.action },
                isGuest && { backgroundColor: theme.colors.action },
              ]}>
                {isGuest && <Text style={styles.guestCheckboxTick}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.guestToggleLabel, { color: theme.colors.primary }]}>
                  Guest — not playing
                </Text>
                <Text style={[styles.guestToggleHint, { color: theme.mutedText }]}>
                  Spouse, sponsor, or banquet guest. They can bid in the auction but
                  won't join a team, appear on the leaderboard, or be charged an entry fee.
                </Text>
              </View>
            </Pressable>

            <LabeledInput label="First Name *" value={firstName} onChangeText={setFirstName} placeholder="Jane" />
            <LabeledInput label="Last Name *"  value={lastName}  onChangeText={setLastName}  placeholder="Smith" />
            <LabeledInput label="Email *"      value={email}     onChangeText={setEmail}     placeholder="jane@example.com" keyboardType="email-address" autoCapitalize="none" />
            {!isGuest && (
              <>
                <LabeledInput label="Team Name"    value={teamName}  onChangeText={setTeamName}  placeholder={lastName.trim() ? `${lastName.trim()} Walk-up` : 'Auto-filled from last name'} />
                <LabeledInput label="Handicap"     value={handicap}  onChangeText={setHandicap}  placeholder="e.g. 12" keyboardType="numeric" />
              </>
            )}
          </ScrollView>

          {err && <Text style={styles.modalErr}>{err}</Text>}

          <View style={styles.modalActions}>
            <Pressable onPress={handleClose} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: theme.mutedText }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              style={[styles.modalSubmit, { backgroundColor: theme.colors.action }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.modalSubmitText, { color: theme.ctaLabel }]}>Register</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LabeledInput({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput style={styles.textInput} placeholderTextColor="#aaa" {...props} />
    </View>
  );
}

function StatChip({ label, value, color, style }: { label: string; value: number; color: string; style?: object }) {
  return (
    <View style={[styles.statChip, style]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1, backgroundColor: '#f7f8fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, paddingBottom: 12 },
  title:  { fontSize: 22, fontWeight: '800' },
  refreshBtn:    { paddingVertical: 6, paddingHorizontal: 12 },
  refreshText:   { fontSize: 14, fontWeight: '600' },
  walkUpBtn:     { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8 },
  walkUpBtnText: { fontSize: 13, fontWeight: '700' },

  // Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:       { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, boxShadow: '0px 0px 12px rgba(0, 0, 0, 0.15)' },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:      { fontSize: 18, fontWeight: '800' },
  modalClose:      { padding: 4 },
  inputRow:        { marginBottom: 14 },
  inputLabel:      { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  textInput:       { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: '#222', backgroundColor: '#fafafa' },
  modalErr:        { color: '#c0392b', fontSize: 13, marginTop: 10, marginBottom: 4 },
  modalActions:    { flexDirection: 'row', gap: 12, marginTop: 18 },
  modalCancel:     { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '700' },
  modalSubmit:     { flex: 2, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  modalSubmitText: { fontSize: 14, fontWeight: '800' },

  statsRow:       { flexDirection: 'row', paddingVertical: 14, gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  statsRowMobile: { flexWrap: 'wrap', gap: 0 },
  statChip:       { alignItems: 'center', flex: 1 },
  statHalf:       { flex: 0, width: '50%', paddingVertical: 10, paddingHorizontal: 8 },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 },

  filterRow: { flexDirection: 'row', paddingHorizontal: 24, borderBottomWidth: 1 },
  filterBtn: { paddingVertical: 12, paddingHorizontal: 4, marginRight: 24, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  filterText: { fontSize: 14 },

  errorBox: { margin: 16, backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15 },

  list: { padding: 16, gap: 10 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  teamName: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  cardActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 13, fontWeight: '600' },
  actionBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, minWidth: 110, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '700' },

  cardlessHint: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  roster: { marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e8e8e8', gap: 6 },
  golferRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  golferName: { fontSize: 14, fontWeight: '600', flex: 1 },
  cardTag: { fontSize: 12, fontWeight: '600', minWidth: 66 },
  cardTagAction: { textDecorationLine: 'underline' },
  golferDone: { fontSize: 12, fontWeight: '700', minWidth: 96, textAlign: 'right' },
  golferBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, minWidth: 96, alignItems: 'center', justifyContent: 'center' },
  golferBtnText: { fontSize: 12, fontWeight: '700' },

  guestToggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  guestCheckbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  guestCheckboxTick: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  guestToggleLabel: { fontSize: 14, fontWeight: '700' },
  guestToggleHint:  { fontSize: 12, marginTop: 2, lineHeight: 16 },
});
