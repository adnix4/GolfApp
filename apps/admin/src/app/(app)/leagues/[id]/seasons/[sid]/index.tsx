import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput, Modal,
  ActivityIndicator, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import {
  leagueApi, SeasonDashboard, LeagueMember, LeagueRound,
  StandingRow, SkinRow, PairingGroup, HandicapHistoryRow, RoundAbsence,
} from '@/lib/api';

type Tab = 'overview' | 'roster' | 'rounds' | 'handicaps' | 'standings' | 'skins';

export default function SeasonDashboardScreen() {
  const theme       = useTheme();
  const router      = useRouter();
  const { id, sid } = useLocalSearchParams<{ id: string; sid: string }>();

  const [tab, setTab]             = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<SeasonDashboard | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [selRound, setSelRound]     = useState<LeagueRound | null>(null);
  const [pairings, setPairings]     = useState<PairingGroup[]>([]);
  const [skins, setSkins]           = useState<SkinRow[]>([]);
  const [pairLoading, setPairLoading] = useState(false);

  const [selMember, setSelMember]       = useState<LeagueMember | null>(null);
  const [hcHistory, setHcHistory]       = useState<HandicapHistoryRow[]>([]);
  const [showHcModal, setShowHcModal]   = useState(false);

  const [overrideIdx, setOverrideIdx]       = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride]     = useState(false);
  const [overrideSaving, setOverrideSaving] = useState(false);

  const [showAddMember, setShowAddMember] = useState(false);
  const [mFirst, setMFirst] = useState('');
  const [mLast, setMLast]   = useState('');
  const [mEmail, setMEmail] = useState('');
  const [mHC, setMHC]       = useState('0');
  const [mSaving, setMSaving] = useState(false);

  const [showAddRound, setShowAddRound] = useState(false);
  const [rDate, setRDate]   = useState('');
  const [rNotes, setRNotes] = useState('');
  const [rSaving, setRSaving] = useState(false);

  const [showAbsenceModal, setShowAbsenceModal]       = useState(false);
  const [absenceRound, setAbsenceRound]               = useState<LeagueRound | null>(null);
  const [absences, setAbsences]                       = useState<RoundAbsence[]>([]);
  const [selAbsenceMemberId, setSelAbsenceMemberId]   = useState('');
  const [absenceLoading, setAbsenceLoading]           = useState(false);

  const [showSubModal, setShowSubModal]     = useState(false);
  const [subAbsentMemberId, setSubAbsentMemberId] = useState('');
  const [subFirst, setSubFirst]             = useState('');
  const [subLast, setSubLast]               = useState('');
  const [subEmail, setSubEmail]             = useState('');
  const [subHC, setSubHC]                   = useState('0');
  const [subSaving, setSubSaving]           = useState(false);

  const [syncSaving, setSyncSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id || !sid) return;
    try {
      setLoading(true);
      setError(null);
      setDashboard(await leagueApi.getDashboard(id, sid));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, sid]);

  useEffect(() => { load(); }, [load]);

  async function handleGeneratePairings(round: LeagueRound) {
    if (!id || !sid) return;
    setPairLoading(true);
    try {
      const result = await leagueApi.generatePairings(id, sid, round.id);
      setPairings(result);
      setSelRound(round);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setPairLoading(false);
    }
  }

  async function handleOpenScoring(round: LeagueRound) {
    if (!id || !sid) return;
    try { await leagueApi.openScoring(id, sid, round.id); await load(); }
    catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleCloseRound(round: LeagueRound) {
    if (!id || !sid) return;
    try { await leagueApi.closeRound(id, sid, round.id); await load(); }
    catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleLoadSkins(round: LeagueRound) {
    if (!id || !sid) return;
    try {
      const result = await leagueApi.getSkins(id, sid, round.id);
      setSkins(result);
      setSelRound(round);
      setTab('skins');
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleAddRound() {
    if (!id || !sid || !rDate) return;
    setRSaving(true);
    try {
      await leagueApi.createRound(id, sid, { roundDate: rDate, notes: rNotes || undefined });
      setShowAddRound(false); setRDate(''); setRNotes('');
      await load();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setRSaving(false); }
  }

  async function handleOverrideHandicap() {
    if (!id || !sid || !selMember || !overrideReason) return;
    setOverrideSaving(true);
    try {
      await leagueApi.overrideHandicap(id, sid, selMember.id, parseFloat(overrideIdx), overrideReason);
      setShowOverride(false); setOverrideIdx(''); setOverrideReason('');
      await load();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setOverrideSaving(false); }
  }

  async function openHandicapHistory(member: LeagueMember) {
    if (!id || !sid) return;
    setSelMember(member);
    const hist = await leagueApi.getHandicapHistory(id, sid, member.id);
    setHcHistory(hist);
    setShowHcModal(true);
  }

  async function handleAddMember() {
    if (!id || !sid || !mFirst || !mLast || !mEmail) return;
    setMSaving(true);
    try {
      await leagueApi.addMember(id, sid, {
        firstName: mFirst, lastName: mLast, email: mEmail,
        handicapIndex: parseFloat(mHC) || 0,
      });
      setShowAddMember(false);
      setMFirst(''); setMLast(''); setMEmail(''); setMHC('0');
      await load();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setMSaving(false); }
  }

  async function handleOpenAbsences(round: LeagueRound) {
    if (!id || !sid) return;
    setAbsenceRound(round);
    setAbsenceLoading(true);
    try {
      const list = await leagueApi.getAbsences(id, sid, round.id);
      setAbsences(list);
      setShowAbsenceModal(true);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setAbsenceLoading(false); }
  }

  async function handleReportAbsence() {
    if (!id || !sid || !absenceRound || !selAbsenceMemberId) return;
    setAbsenceLoading(true);
    try {
      const a = await leagueApi.reportAbsence(id, sid, absenceRound.id, selAbsenceMemberId);
      setAbsences(prev => [...prev, a]);
      setSelAbsenceMemberId('');
      await load();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setAbsenceLoading(false); }
  }

  async function handleAddSub() {
    if (!id || !sid || !absenceRound || !subAbsentMemberId || !subFirst || !subLast || !subEmail) return;
    setSubSaving(true);
    try {
      await leagueApi.addSubstitute(id, sid, absenceRound.id, {
        absentMemberId: subAbsentMemberId,
        firstName: subFirst, lastName: subLast, email: subEmail,
        handicapIndex: parseFloat(subHC) || 0,
      });
      const updated = await leagueApi.getAbsences(id, sid, absenceRound.id);
      setAbsences(updated);
      setShowSubModal(false);
      setSubFirst(''); setSubLast(''); setSubEmail(''); setSubHC('0');
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSubSaving(false); }
  }

  async function handleToggleSync() {
    if (!id || !sid || !dashboard) return;
    setSyncSaving(true);
    try {
      await leagueApi.updateSeasonSync(id, sid, !dashboard.season.syncHandicapToPlayer);
      await load();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSyncSaving(false); }
  }

  async function handleDownloadPairingsPdf(round: LeagueRound) {
    if (!id || !sid) return;
    try {
      await leagueApi.downloadPdf(
        leagueApi.getPairingsPdfPath(id, sid, round.id),
        `pairings-${round.roundDate}.pdf`,
      );
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleDownloadStandingsPdf() {
    if (!id || !sid) return;
    try {
      await leagueApi.downloadPdf(
        leagueApi.getStandingsPdfPath(id, sid),
        `standings-${sid}.pdf`,
      );
    } catch (e: unknown) { setError((e as Error).message); }
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'roster',   label: 'Roster'   },
    { key: 'rounds',   label: 'Rounds'   },
    { key: 'handicaps', label: 'Handicaps' },
    { key: 'standings', label: 'Standings' },
    { key: 'skins',    label: 'Skins'    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.accent }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: theme.colors.action }}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.primary }]} numberOfLines={1}>
          {dashboard?.season.name ?? 'Season'}
        </Text>
        <Text style={[styles.statusBadge, { color: theme.colors.accent }]}>
          {dashboard?.season.status}
        </Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={{ color: '#dc2626' }}>{error}</Text>
          <Pressable onPress={() => setError(null)}><Text style={{ color: '#dc2626' }}>✕</Text></Pressable>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { borderBottomColor: theme.colors.accent }]}>
        {tabs.map(t => (
          <Pressable
            key={t.key}
            style={[styles.tabBtn, tab === t.key && { borderBottomColor: theme.colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabLabel, { color: tab === t.key ? theme.colors.primary : theme.colors.accent }]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>

        {/* OVERVIEW */}
        {tab === 'overview' && dashboard && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Season Overview</Text>
            <View style={styles.statsGrid}>
              {[
                { label: 'Members', value: String(dashboard.season.memberCount) },
                { label: 'Rounds',  value: `${dashboard.season.roundCount}/${dashboard.season.totalRounds}` },
                { label: 'Flights', value: String(dashboard.flights.length) },
              ].map(s => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: theme.colors.highlight, borderColor: theme.colors.accent }]}>
                  <Text style={[styles.statVal, { color: theme.colors.primary }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: theme.colors.accent }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.syncRow, { borderColor: theme.colors.accent }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.memberName, { color: theme.colors.primary }]}>Sync HC → Player Profile</Text>
                <Text style={[styles.memberMeta, { color: theme.colors.accent }]}>
                  When on, handicap updates write back to the player's event record.
                </Text>
              </View>
              <Pressable
                style={[styles.syncToggle, {
                  backgroundColor: dashboard.season.syncHandicapToPlayer
                    ? theme.colors.primary : theme.colors.accent + '33',
                  opacity: syncSaving ? 0.5 : 1,
                }]}
                onPress={handleToggleSync}
                disabled={syncSaving}
              >
                <Text style={{ color: dashboard.season.syncHandicapToPlayer ? theme.colors.surface : theme.colors.accent, fontSize: 12, fontWeight: '600' }}>
                  {dashboard.season.syncHandicapToPlayer ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.subTitle, { color: theme.colors.primary }]}>Recent Rounds</Text>
            {dashboard.rounds.slice(0, 5).map(r => (
              <View key={r.id} style={[styles.roundRow, { borderColor: theme.colors.accent }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.roundDate, { color: theme.colors.primary }]}>{r.roundDate}</Text>
                  <Text style={[styles.roundMeta, { color: theme.colors.accent }]}>
                    {r.courseName ?? 'No course'} · {r.scoredCount} scored
                  </Text>
                </View>
                <Text style={[styles.roundStatus, { color: roundStatusColor(r.status) }]}>{r.status}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ROSTER */}
        {tab === 'roster' && dashboard && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                Roster ({dashboard.roster.length})
              </Text>
              <Pressable style={[styles.smallBtn, { backgroundColor: theme.colors.primary }]}
                onPress={() => setShowAddMember(true)}>
                <Text style={{ color: theme.colors.surface, fontSize: 13 }}>+ Add</Text>
              </Pressable>
            </View>
            {dashboard.roster.map(m => (
              <View key={m.id} style={[styles.memberRow, { borderColor: theme.colors.accent }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: theme.colors.primary }]}>
                    {m.lastName}, {m.firstName}
                    {m.isSandbagger ? <Text style={{ color: '#f59e0b' }}> ⚠</Text> : null}
                  </Text>
                  <Text style={[styles.memberMeta, { color: theme.colors.accent }]}>
                    HC {m.handicapIndex.toFixed(1)} · {m.flightName ?? 'No flight'} · {m.roundsPlayed} rounds
                    {!m.duesPaid ? <Text style={{ color: '#ef4444' }}> · Dues unpaid</Text> : null}
                  </Text>
                </View>
                <View style={styles.memberActions}>
                  <Pressable style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => openHandicapHistory(m)}>
                    <Text style={{ fontSize: 12, color: theme.colors.action }}>HC History</Text>
                  </Pressable>
                  <Pressable style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => { setSelMember(m); setOverrideIdx(m.handicapIndex.toString()); setShowOverride(true); }}>
                    <Text style={{ fontSize: 12, color: theme.colors.primary }}>Override</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ROUNDS */}
        {tab === 'rounds' && dashboard && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Round Manager</Text>
              <Pressable style={[styles.smallBtn, { backgroundColor: theme.colors.primary }]}
                onPress={() => setShowAddRound(true)}>
                <Text style={{ color: theme.colors.surface, fontSize: 13 }}>+ Round</Text>
              </Pressable>
            </View>
            {dashboard.rounds.map(r => (
              <View key={r.id} style={[styles.roundCard, { borderColor: theme.colors.accent }]}>
                <View style={styles.roundCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roundDate, { color: theme.colors.primary }]}>{r.roundDate}</Text>
                    <Text style={[styles.roundMeta, { color: theme.colors.accent }]}>
                      {r.courseName ?? 'No course'} · {r.pairingCount} groups · {r.scoredCount} scored
                      {r.absenceCount > 0 ? ` · ${r.absenceCount} absent` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.roundStatus, { color: roundStatusColor(r.status) }]}>{r.status}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.roundActions}>
                    {r.status === 'Scheduled' && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: theme.colors.primary + '22' }]}
                        onPress={() => handleGeneratePairings(r)} disabled={pairLoading}>
                        <Text style={{ color: theme.colors.primary, fontSize: 12 }}>Generate Pairings</Text>
                      </Pressable>
                    )}
                    {(r.status === 'Scheduled' || r.status === 'Open') && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#f59e0b22' }]}
                        onPress={() => handleOpenScoring(r)}>
                        <Text style={{ color: '#d97706', fontSize: 12 }}>Open Scoring</Text>
                      </Pressable>
                    )}
                    {r.status === 'Scoring' && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#16a34a22' }]}
                        onPress={() => handleCloseRound(r)}>
                        <Text style={{ color: '#16a34a', fontSize: 12 }}>Close Round</Text>
                      </Pressable>
                    )}
                    {r.status === 'Closed' && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#6366f122' }]}
                        onPress={() => handleLoadSkins(r)}>
                        <Text style={{ color: '#6366f1', fontSize: 12 }}>View Skins</Text>
                      </Pressable>
                    )}
                    {(r.status === 'Scheduled' || r.status === 'Open') && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#ef444422' }]}
                        onPress={() => handleOpenAbsences(r)}>
                        <Text style={{ color: '#ef4444', fontSize: 12 }}>
                          Absences{r.absenceCount > 0 ? ` (${r.absenceCount})` : ''}
                        </Text>
                      </Pressable>
                    )}
                    {r.pairingCount > 0 && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#0ea5e922' }]}
                        onPress={() => handleDownloadPairingsPdf(r)}>
                        <Text style={{ color: '#0ea5e9', fontSize: 12 }}>Print Pairings</Text>
                      </Pressable>
                    )}
                  </View>
                </ScrollView>
              </View>
            ))}
          </View>
        )}

        {/* HANDICAPS */}
        {tab === 'handicaps' && dashboard && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Handicap Manager</Text>
            {dashboard.roster.sort((a, b) => a.lastName.localeCompare(b.lastName)).map(m => (
              <View key={m.id} style={[styles.memberRow, { borderColor: theme.colors.accent }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: theme.colors.primary }]}>
                    {m.lastName}, {m.firstName}
                    {m.isSandbagger ? <Text style={{ color: '#f59e0b' }}> ⚠</Text> : null}
                  </Text>
                  <Text style={[styles.memberMeta, { color: theme.colors.accent }]}>
                    Current HC: {m.handicapIndex.toFixed(1)} · {m.roundsPlayed} rounds
                  </Text>
                </View>
                <View style={styles.memberActions}>
                  <Pressable style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => openHandicapHistory(m)}>
                    <Text style={{ fontSize: 12, color: theme.colors.action }}>History</Text>
                  </Pressable>
                  <Pressable style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => { setSelMember(m); setOverrideIdx(m.handicapIndex.toString()); setShowOverride(true); }}>
                    <Text style={{ fontSize: 12, color: '#f59e0b' }}>Override</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* STANDINGS */}
        {tab === 'standings' && dashboard && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Standings Board</Text>
              {dashboard.standings.length > 0 && (
                <Pressable style={[styles.smallBtn, { backgroundColor: '#0ea5e9' }]}
                  onPress={handleDownloadStandingsPdf}>
                  <Text style={{ color: '#fff', fontSize: 13 }}>Export PDF</Text>
                </Pressable>
              )}
            </View>
            {dashboard.standings.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
                Standings appear after the first round closes.
              </Text>
            ) : (
              <View>
                <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: theme.colors.primary + '11' }]}>
                  {['#', 'Name', 'Flight', 'HC', 'Pts', 'Net', 'Rnds'].map(h => (
                    <Text key={h} style={[styles.tableCell, { color: theme.colors.accent, fontWeight: '700', fontSize: 11 }]}>{h}</Text>
                  ))}
                </View>
                {dashboard.standings.map((s: StandingRow) => (
                  <View key={s.memberId} style={[styles.tableRow, { borderBottomColor: theme.colors.accent }]}>
                    <Text style={[styles.tableCell, { color: theme.colors.primary, fontWeight: '700' }]}>{s.rank}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.primary, flex: 2 }]} numberOfLines={1}>{s.memberName}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.accent }]} numberOfLines={1}>{s.flightName}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.primary }]}>{s.handicapIndex.toFixed(1)}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.primary, fontWeight: '600' }]}>{s.totalPoints}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.primary }]}>{s.netStrokes}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.accent }]}>{s.roundsPlayed}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* SKINS */}
        {tab === 'skins' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
              Skins — {selRound?.roundDate ?? 'Select a round'}
            </Text>
            {skins.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
                No skins data. Close a round to calculate skins.
              </Text>
            ) : (
              skins.map((sk: SkinRow) => (
                <View key={sk.id} style={[styles.skinRow, { borderColor: theme.colors.accent }]}>
                  <Text style={[styles.skinHole, { color: theme.colors.primary }]}>Hole {sk.holeNumber}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.skinWinner, { color: sk.winnerName ? theme.colors.primary : theme.colors.accent }]}>
                      {sk.winnerName ?? 'Tie (carried)'}
                    </Text>
                    {sk.carriedOverFromHole != null && (
                      <Text style={[styles.skinCarry, { color: theme.colors.accent }]}>
                        Carried from hole {sk.carriedOverFromHole}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.skinPot, { color: theme.colors.primary }]}>
                    ${(sk.potCents / 100).toFixed(2)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Pairing preview modal */}
      <Modal visible={!!selRound && pairings.length > 0 && tab === 'rounds'} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface, maxHeight: '80%' as unknown as number }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
              Proposed Pairings — {selRound?.roundDate}
            </Text>
            <ScrollView>
              {pairings.map((g: PairingGroup) => (
                <View key={g.id} style={[styles.pairingGroup, { borderColor: theme.colors.accent }]}>
                  <Text style={[styles.groupLabel, { color: theme.colors.primary }]}>Group {g.groupNumber}</Text>
                  {g.memberNames.map((n, i) => (
                    <Text key={i} style={[styles.groupMember, { color: theme.colors.primary }]}>· {n}</Text>
                  ))}
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => { setSelRound(null); setPairings([]); }}>
                <Text style={{ color: theme.colors.accent }}>Discard</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: theme.colors.primary }]}
                onPress={async () => {
                  if (!id || !sid || !selRound) return;
                  await leagueApi.savePairings(id, sid, selRound.id,
                    pairings.map(g => ({ memberIds: g.memberIds })), true);
                  setSelRound(null); setPairings([]); await load();
                }}>
                <Text style={{ color: theme.colors.surface }}>Lock Pairings</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Handicap History Modal */}
      <Modal visible={showHcModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface, maxHeight: '70%' as unknown as number }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
              HC History — {selMember?.firstName} {selMember?.lastName}
            </Text>
            <ScrollView>
              {hcHistory.length === 0
                ? <Text style={{ color: theme.colors.accent }}>No history yet.</Text>
                : hcHistory.map((h: HandicapHistoryRow) => (
                  <View key={h.id} style={[styles.histRow, { borderColor: theme.colors.accent }]}>
                    <Text style={[styles.histDate, { color: theme.colors.accent }]}>
                      {h.roundDate ?? h.createdAt.slice(0, 10)}{h.adminOverride ? ' (Admin)' : ''}
                    </Text>
                    <Text style={[styles.histChg, { color: theme.colors.primary }]}>
                      {h.oldIndex.toFixed(1)} → {h.newIndex.toFixed(1)}
                    </Text>
                    <Text style={[styles.histDiff, { color: theme.colors.accent }]}>
                      diff {h.differential.toFixed(1)}
                    </Text>
                  </View>
                ))
              }
            </ScrollView>
            <Pressable style={[styles.btn, { backgroundColor: theme.colors.primary, marginTop: 12, alignSelf: 'flex-end' }]}
              onPress={() => setShowHcModal(false)}>
              <Text style={{ color: theme.colors.surface }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Override Handicap Modal */}
      <Modal visible={showOverride} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
              Override HC — {selMember?.firstName} {selMember?.lastName}
            </Text>
            <Text style={[styles.label, { color: theme.colors.accent }]}>New Handicap Index</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={overrideIdx} onChangeText={setOverrideIdx} keyboardType="numeric"
              placeholderTextColor={theme.colors.accent}
            />
            <Text style={[styles.label, { color: theme.colors.accent }]}>Reason (required)</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={overrideReason} onChangeText={setOverrideReason}
              placeholder="e.g. Course adjustment" placeholderTextColor={theme.colors.accent}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowOverride(false)}>
                <Text style={{ color: theme.colors.accent }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: '#f59e0b', opacity: overrideSaving ? 0.6 : 1 }]}
                onPress={handleOverrideHandicap} disabled={overrideSaving}>
                <Text style={{ color: '#fff' }}>{overrideSaving ? 'Saving…' : 'Override'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Member Modal */}
      <Modal visible={showAddMember} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Add Member</Text>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>First Name</Text>
                <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={mFirst} onChangeText={setMFirst} placeholderTextColor={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>Last Name</Text>
                <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={mLast} onChangeText={setMLast} placeholderTextColor={theme.colors.accent} />
              </View>
            </View>
            <Text style={[styles.label, { color: theme.colors.accent }]}>Email</Text>
            <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={mEmail} onChangeText={setMEmail} keyboardType="email-address"
              placeholderTextColor={theme.colors.accent} />
            <Text style={[styles.label, { color: theme.colors.accent }]}>Starting Handicap</Text>
            <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={mHC} onChangeText={setMHC} keyboardType="numeric" placeholder="0"
              placeholderTextColor={theme.colors.accent} />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowAddMember(false)}>
                <Text style={{ color: theme.colors.accent }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: theme.colors.primary, opacity: mSaving ? 0.6 : 1 }]}
                onPress={handleAddMember} disabled={mSaving}>
                <Text style={{ color: theme.colors.surface }}>{mSaving ? 'Adding…' : 'Add Member'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Absences Modal */}
      <Modal visible={showAbsenceModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface, maxHeight: '80%' as unknown as number }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
              Absences — {absenceRound?.roundDate}
            </Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {absences.length === 0
                ? <Text style={{ color: theme.colors.accent, fontSize: 13 }}>No absences reported yet.</Text>
                : absences.map(a => (
                  <View key={a.id} style={[styles.absenceRow, { borderColor: theme.colors.accent }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '600' }}>{a.memberName}</Text>
                      {a.subMemberName
                        ? <Text style={{ color: '#16a34a', fontSize: 12 }}>Sub: {a.subMemberName}</Text>
                        : <Text style={{ color: theme.colors.accent, fontSize: 12 }}>No sub assigned</Text>}
                    </View>
                    {!a.subMemberId && (
                      <Pressable style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                        onPress={() => { setSubAbsentMemberId(a.memberId); setShowSubModal(true); }}>
                        <Text style={{ fontSize: 12, color: theme.colors.action }}>Add Sub</Text>
                      </Pressable>
                    )}
                  </View>
                ))
              }
            </ScrollView>
            <Text style={[styles.label, { color: theme.colors.accent }]}>Report New Absence</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.accent, fontSize: 11, marginBottom: 4 }}>Select Member</Text>
                <ScrollView style={{ maxHeight: 100, borderWidth: 1, borderColor: theme.colors.accent, borderRadius: 8 }}>
                  {(dashboard?.roster ?? []).filter(m => m.status === 'Active').map(m => (
                    <Pressable key={m.id}
                      style={{ padding: 8, backgroundColor: selAbsenceMemberId === m.id ? theme.colors.primary + '22' : 'transparent' }}
                      onPress={() => setSelAbsenceMemberId(m.id)}>
                      <Text style={{ color: theme.colors.primary, fontSize: 12 }}>
                        {m.lastName}, {m.firstName}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => { setShowAbsenceModal(false); setSelAbsenceMemberId(''); }}>
                <Text style={{ color: theme.colors.accent }}>Close</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { backgroundColor: '#ef4444', opacity: (!selAbsenceMemberId || absenceLoading) ? 0.5 : 1 }]}
                onPress={handleReportAbsence}
                disabled={!selAbsenceMemberId || absenceLoading}>
                <Text style={{ color: '#fff' }}>{absenceLoading ? 'Saving…' : 'Report Absent'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Sub Modal */}
      <Modal visible={showSubModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Add Substitute</Text>
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>First Name</Text>
                <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={subFirst} onChangeText={setSubFirst} placeholderTextColor={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>Last Name</Text>
                <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={subLast} onChangeText={setSubLast} placeholderTextColor={theme.colors.accent} />
              </View>
            </View>
            <Text style={[styles.label, { color: theme.colors.accent }]}>Email</Text>
            <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={subEmail} onChangeText={setSubEmail} keyboardType="email-address"
              placeholderTextColor={theme.colors.accent} />
            <Text style={[styles.label, { color: theme.colors.accent }]}>Handicap Index</Text>
            <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={subHC} onChangeText={setSubHC} keyboardType="numeric" placeholder="0"
              placeholderTextColor={theme.colors.accent} />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowSubModal(false)}>
                <Text style={{ color: theme.colors.accent }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: theme.colors.primary, opacity: subSaving ? 0.6 : 1 }]}
                onPress={handleAddSub} disabled={subSaving}>
                <Text style={{ color: theme.colors.surface }}>{subSaving ? 'Adding…' : 'Add Sub'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Round Modal */}
      <Modal visible={showAddRound} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Add Round</Text>
            <Text style={[styles.label, { color: theme.colors.accent }]}>Round Date (YYYY-MM-DD)</Text>
            <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={rDate} onChangeText={setRDate} placeholder="2026-06-15"
              placeholderTextColor={theme.colors.accent} />
            <Text style={[styles.label, { color: theme.colors.accent }]}>Notes (optional)</Text>
            <TextInput style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={rNotes} onChangeText={setRNotes} placeholder="Rain makeup round"
              placeholderTextColor={theme.colors.accent} />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowAddRound(false)}>
                <Text style={{ color: theme.colors.accent }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: theme.colors.primary, opacity: rSaving ? 0.6 : 1 }]}
                onPress={handleAddRound} disabled={rSaving}>
                <Text style={{ color: theme.colors.surface }}>{rSaving ? 'Adding…' : 'Add Round'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function roundStatusColor(s: string) {
  if (s === 'Closed')  return '#16a34a';
  if (s === 'Scoring') return '#f59e0b';
  if (s === 'Open')    return '#3b82f6';
  return '#9ca3af';
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1 },
  title:         { flex: 1, fontSize: 18, fontWeight: '700' },
  statusBadge:   { fontSize: 12 },
  errorBanner:   { flexDirection: 'row', justifyContent: 'space-between', margin: 12, padding: 10, borderRadius: 8, backgroundColor: '#fef2f2' },
  tabBar:        { maxHeight: 44, borderBottomWidth: 1 },
  tabBtn:        { paddingHorizontal: 16, paddingVertical: 12 },
  tabLabel:      { fontSize: 13, fontWeight: '600' },
  content:       { padding: 16, paddingBottom: 40 },
  section:       { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle:  { fontSize: 17, fontWeight: '700' },
  subTitle:      { fontSize: 15, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCard:      { flex: 1, minWidth: 80, borderRadius: 10, padding: 12, borderWidth: 1, alignItems: 'center' },
  statVal:       { fontSize: 22, fontWeight: '700' },
  statLabel:     { fontSize: 11, marginTop: 2 },
  roundRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  roundDate:     { fontSize: 14, fontWeight: '600' },
  roundMeta:     { fontSize: 12 },
  roundStatus:   { fontSize: 12, fontWeight: '600' },
  roundCard:     { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  roundCardTop:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  roundActions:  { flexDirection: 'row', gap: 8 },
  actionBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  memberRow:     { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  memberName:    { fontSize: 14, fontWeight: '600' },
  memberMeta:    { fontSize: 12, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 6 },
  iconBtn:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  smallBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  tableRow:      { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1 },
  tableHeader:   { paddingVertical: 10, borderRadius: 6 },
  tableCell:     { flex: 1, fontSize: 13, textAlign: 'center' },
  emptyText:     { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  skinRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  skinHole:      { width: 60, fontSize: 14, fontWeight: '700' },
  skinWinner:    { fontSize: 14 },
  skinCarry:     { fontSize: 11, marginTop: 2 },
  skinPot:       { fontSize: 14, fontWeight: '700' },
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modal:         { width: '92%', maxWidth: 500, borderRadius: 16, padding: 24 },
  modalTitle:    { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  label:         { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input:         { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  row:           { flexDirection: 'row' },
  modalActions:  { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  cancelBtn:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  btn:           { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  pairingGroup:  { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  groupLabel:    { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  groupMember:   { fontSize: 13, paddingLeft: 4 },
  histRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, gap: 8 },
  histDate:      { fontSize: 12, flex: 1 },
  histChg:       { fontSize: 14, fontWeight: '600' },
  histDiff:      { fontSize: 12, width: 60, textAlign: 'right' },
  syncRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, marginBottom: 8 },
  syncToggle:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, minWidth: 48, alignItems: 'center' },
  absenceRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
});
