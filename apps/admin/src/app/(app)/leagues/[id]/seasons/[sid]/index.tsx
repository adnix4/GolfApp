import React, { useState } from 'react';
import {
  View, Text, Pressable,
  ActivityIndicator, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme, useClasses } from '@gfp/ui';
import { formatCentsShort, formatDateOnly, validateLeagueMember, toPlayerInput } from '@gfp/shared-types';
import {
  leagueApi, LeagueMember, LeagueRound,
  StandingRow, SkinRow, PairingGroup, HandicapHistoryRow, RoundAbsence,
} from '@/lib/api';
import {
  PairingsPreviewModal, HandicapHistoryModal, OverrideHandicapModal,
  AddMemberModal, AbsencesModal, AddSubModal, AddRoundModal,
  type AddMemberFields, type AddSubFields,
} from '@/components/seasonModals';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { validatePickerDateTime } from '@/lib/dateTime';
import { useLeagueName } from '../../_layout';
import { useQueryClient } from '@tanstack/react-query';
import { leagueKeys, useSeasonDashboard } from '@/lib/queries';
import { fontSize, radius, spacing } from '@gfp/theme';

type Tab = 'overview' | 'roster' | 'rounds' | 'handicaps' | 'standings' | 'skins';

export default function SeasonDashboardScreen() {
  const theme       = useTheme();
  const c           = useClasses();
  const router      = useRouter();
  const { id, sid } = useLocalSearchParams<{ id: string; sid: string }>();

  const [tab, setTab]             = useState<Tab>('overview');
  const queryClient   = useQueryClient();
  const dashboardData = useSeasonDashboard(id ?? '', sid ?? '');
  const dashboard     = dashboardData.data ?? null;
  const loading       = dashboardData.isPending;
  const [actionError, setError]   = useState<string | null>(null);
  const error = actionError
    ?? (dashboardData.error ? (dashboardData.error.message || 'Failed to load the season.') : null);

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
  const [memberFields, setMemberFields]   = useState<AddMemberFields>({ firstName: '', lastName: '', email: '', handicap: '' });
  const [memberErr, setMemberErr]         = useState<string | null>(null);
  const [mSaving, setMSaving]             = useState(false);

  const [showAddRound, setShowAddRound] = useState(false);
  const [rDate, setRDate]   = useState('');   // YYYY-MM-DD
  const [rDateErr, setRDateErr] = useState<string | undefined>();
  const [rNotes, setRNotes] = useState('');
  const [rSaving, setRSaving] = useState(false);

  const [showAbsenceModal, setShowAbsenceModal]       = useState(false);
  const [absenceRound, setAbsenceRound]               = useState<LeagueRound | null>(null);
  const [absences, setAbsences]                       = useState<RoundAbsence[]>([]);
  const [selAbsenceMemberId, setSelAbsenceMemberId]   = useState('');
  const [absenceLoading, setAbsenceLoading]           = useState(false);

  const [showSubModal, setShowSubModal]           = useState(false);
  const [subAbsentMemberId, setSubAbsentMemberId] = useState('');
  const [subFields, setSubFields]                 = useState<AddSubFields>({ firstName: '', lastName: '', email: '', handicap: '' });
  const [subErr, setSubErr]                       = useState<string | null>(null);
  const [subSaving, setSubSaving]                 = useState(false);

  const [syncSaving, setSyncSaving] = useState(false);

  // After a change: refetch this season behind what it shows (no spinner) and
  // mark the league's other cached screens stale, since counts move too.
  const markLeagueStale = () => queryClient.invalidateQueries({ queryKey: leagueKeys.all });

  const leagueName  = useLeagueName();
  const seasonName  = dashboard?.season.name;
  useDocumentTitle(
    seasonName
      ? (leagueName ? `${leagueName} - ${seasonName}` : `GFP ${seasonName}`)
      : 'GFP Leagues',
  );

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
    try { await leagueApi.openScoring(id, sid, round.id); await markLeagueStale(); }
    catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleCloseRound(round: LeagueRound) {
    if (!id || !sid) return;
    try { await leagueApi.closeRound(id, sid, round.id); await markLeagueStale(); }
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

  // A round must be dated inside its season; the picker is bounded to the
  // season too, but a typed-in date can still land outside it.
  function roundDateError(date: string): string | undefined {
    if (!date) return 'Pick a round date';
    return validatePickerDateTime(date, '', {
      label: 'Round', min: dashboard?.season.startDate, max: dashboard?.season.endDate, rangeName: 'the season',
    }).date;
  }

  async function handleAddRound() {
    if (!id || !sid) return;
    const err = roundDateError(rDate);
    setRDateErr(err);
    if (err) return;
    setRSaving(true);
    try {
      await leagueApi.createRound(id, sid, { roundDate: rDate, notes: rNotes || undefined });
      setShowAddRound(false); setRDate(''); setRNotes(''); setRDateErr(undefined);
      await markLeagueStale();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setRSaving(false); }
  }

  async function handleOverrideHandicap() {
    if (!id || !sid || !selMember || !overrideReason) return;
    setOverrideSaving(true);
    try {
      await leagueApi.overrideHandicap(id, sid, selMember.id, parseFloat(overrideIdx), overrideReason);
      setShowOverride(false); setOverrideIdx(''); setOverrideReason('');
      await markLeagueStale();
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

  // League play needs a real handicap: a blank used to be saved as 0 (scratch).
  async function handleAddMember() {
    if (!id || !sid) return;
    const problem = validateLeagueMember(memberFields);
    if (problem) { setMemberErr(problem); return; }
    setMemberErr(null);
    setMSaving(true);
    try {
      const p = toPlayerInput(memberFields);
      await leagueApi.addMember(id, sid, {
        firstName: p.firstName, lastName: p.lastName, email: p.email,
        handicapIndex: p.handicapIndex!,
      });
      setShowAddMember(false);
      setMemberFields({ firstName: '', lastName: '', email: '', handicap: '' });
      await markLeagueStale();
    } catch (e: unknown) { setMemberErr((e as Error).message); }
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
      await markLeagueStale();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setAbsenceLoading(false); }
  }

  async function handleAddSub() {
    if (!id || !sid || !absenceRound || !subAbsentMemberId) return;
    const problem = validateLeagueMember(subFields);
    if (problem) { setSubErr(problem); return; }
    setSubErr(null);
    setSubSaving(true);
    try {
      const p = toPlayerInput(subFields);
      await leagueApi.addSubstitute(id, sid, absenceRound.id, {
        absentMemberId: subAbsentMemberId,
        firstName: p.firstName, lastName: p.lastName, email: p.email,
        handicapIndex: p.handicapIndex!,
      });
      const updated = await leagueApi.getAbsences(id, sid, absenceRound.id);
      setAbsences(updated);
      setShowSubModal(false);
      setSubFields({ firstName: '', lastName: '', email: '', handicap: '' });
    } catch (e: unknown) { setSubErr((e as Error).message); }
    finally { setSubSaving(false); }
  }

  async function handleToggleSync() {
    if (!id || !sid || !dashboard) return;
    setSyncSaving(true);
    try {
      await leagueApi.updateSeasonSync(id, sid, !dashboard.season.syncHandicapToPlayer);
      await markLeagueStale();
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
    <View style={c.center}>
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
        <Text style={[styles.statusBadge, { color: theme.mutedText }]}>
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
            <Text style={[styles.tabLabel, { color: tab === t.key ? theme.colors.primary : theme.mutedText }]}>
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
                  <Text style={[styles.statLabel, { color: theme.mutedText }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.syncRow, { borderColor: theme.colors.accent }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.memberName, { color: theme.colors.primary }]}>Sync HC → Player Profile</Text>
                <Text style={[styles.memberMeta, { color: theme.mutedText }]}>
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
                <Text style={{ color: dashboard.season.syncHandicapToPlayer ? theme.colors.surface : theme.mutedText, fontSize: fontSize.xs, fontWeight: '600' }}>
                  {dashboard.season.syncHandicapToPlayer ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.subTitle, { color: theme.colors.primary }]}>Recent Rounds</Text>
            {dashboard.rounds.slice(0, 5).map(r => (
              <View key={r.id} style={[styles.roundRow, { borderColor: theme.colors.accent }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.roundDate, { color: theme.colors.primary }]}>{formatDateOnly(r.roundDate)}</Text>
                  <Text style={[styles.roundMeta, { color: theme.mutedText }]}>
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
                <Text style={{ color: theme.colors.surface, fontSize: fontSize.sm }}>+ Add</Text>
              </Pressable>
            </View>
            {dashboard.roster.map(m => (
              <View key={m.id} style={[styles.memberRow, { borderColor: theme.colors.accent }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: theme.colors.primary }]}>
                    {m.lastName}, {m.firstName}
                    {m.isSandbagger ? <Text style={{ color: '#f59e0b' }}> ⚠</Text> : null}
                  </Text>
                  <Text style={[styles.memberMeta, { color: theme.mutedText }]}>
                    HC {m.handicapIndex.toFixed(1)} · {m.flightName ?? 'No flight'} · {m.roundsPlayed} rounds
                    {!m.duesPaid ? <Text style={{ color: '#ef4444' }}> · Dues unpaid</Text> : null}
                  </Text>
                </View>
                <View style={styles.memberActions}>
                  <Pressable style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => openHandicapHistory(m)}>
                    <Text style={{ fontSize: fontSize.xs, color: theme.colors.action }}>HC History</Text>
                  </Pressable>
                  <Pressable style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => { setSelMember(m); setOverrideIdx(m.handicapIndex.toString()); setShowOverride(true); }}>
                    <Text style={{ fontSize: fontSize.xs, color: theme.colors.primary }}>Override</Text>
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
                <Text style={{ color: theme.colors.surface, fontSize: fontSize.sm }}>+ Round</Text>
              </Pressable>
            </View>
            {dashboard.rounds.map(r => (
              <View key={r.id} style={[styles.roundCard, { borderColor: theme.colors.accent }]}>
                <View style={styles.roundCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roundDate, { color: theme.colors.primary }]}>{formatDateOnly(r.roundDate)}</Text>
                    <Text style={[styles.roundMeta, { color: theme.mutedText }]}>
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
                        <Text style={{ color: theme.colors.primary, fontSize: fontSize.xs }}>Generate Pairings</Text>
                      </Pressable>
                    )}
                    {(r.status === 'Scheduled' || r.status === 'Open') && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#f59e0b22' }]}
                        onPress={() => handleOpenScoring(r)}>
                        <Text style={{ color: '#d97706', fontSize: fontSize.xs }}>Open Scoring</Text>
                      </Pressable>
                    )}
                    {r.status === 'Scoring' && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#16a34a22' }]}
                        onPress={() => handleCloseRound(r)}>
                        <Text style={{ color: '#16a34a', fontSize: fontSize.xs }}>Close Round</Text>
                      </Pressable>
                    )}
                    {r.status === 'Closed' && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#6366f122' }]}
                        onPress={() => handleLoadSkins(r)}>
                        <Text style={{ color: '#6366f1', fontSize: fontSize.xs }}>View Skins</Text>
                      </Pressable>
                    )}
                    {(r.status === 'Scheduled' || r.status === 'Open') && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#ef444422' }]}
                        onPress={() => handleOpenAbsences(r)}>
                        <Text style={{ color: '#ef4444', fontSize: fontSize.xs }}>
                          Absences{r.absenceCount > 0 ? ` (${r.absenceCount})` : ''}
                        </Text>
                      </Pressable>
                    )}
                    {r.pairingCount > 0 && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: '#0ea5e922' }]}
                        onPress={() => handleDownloadPairingsPdf(r)}>
                        <Text style={{ color: '#0ea5e9', fontSize: fontSize.xs }}>Print Pairings</Text>
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
                  <Text style={[styles.memberMeta, { color: theme.mutedText }]}>
                    Current HC: {m.handicapIndex.toFixed(1)} · {m.roundsPlayed} rounds
                  </Text>
                </View>
                <View style={styles.memberActions}>
                  <Pressable style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => openHandicapHistory(m)}>
                    <Text style={{ fontSize: fontSize.xs, color: theme.colors.action }}>History</Text>
                  </Pressable>
                  <Pressable style={[styles.iconBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => { setSelMember(m); setOverrideIdx(m.handicapIndex.toString()); setShowOverride(true); }}>
                    <Text style={{ fontSize: fontSize.xs, color: '#f59e0b' }}>Override</Text>
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
                  <Text style={{ color: '#fff', fontSize: fontSize.sm }}>Export PDF</Text>
                </Pressable>
              )}
            </View>
            {dashboard.standings.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.mutedText }]}>
                Standings appear after the first round closes.
              </Text>
            ) : (
              <View>
                <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: theme.colors.primary + '11' }]}>
                  {['#', 'Name', 'Flight', 'HC', 'Pts', 'Net', 'Rnds'].map(h => (
                    <Text key={h} style={[styles.tableCell, { color: theme.mutedText, fontWeight: '700', fontSize: fontSize.xxs }]}>{h}</Text>
                  ))}
                </View>
                {dashboard.standings.map((s: StandingRow) => (
                  <View key={s.memberId} style={[styles.tableRow, { borderBottomColor: theme.colors.accent }]}>
                    <Text style={[styles.tableCell, { color: theme.colors.primary, fontWeight: '700' }]}>{s.rank}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.primary, flex: 2 }]} numberOfLines={1}>{s.memberName}</Text>
                    <Text style={[styles.tableCell, { color: theme.mutedText }]} numberOfLines={1}>{s.flightName}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.primary }]}>{s.handicapIndex.toFixed(1)}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.primary, fontWeight: '600' }]}>{s.totalPoints}</Text>
                    <Text style={[styles.tableCell, { color: theme.colors.primary }]}>{s.netStrokes}</Text>
                    <Text style={[styles.tableCell, { color: theme.mutedText }]}>{s.roundsPlayed}</Text>
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
              Skins — {selRound ? formatDateOnly(selRound.roundDate) : 'Select a round'}
            </Text>
            {skins.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.mutedText }]}>
                No skins data. Close a round to calculate skins.
              </Text>
            ) : (
              skins.map((sk: SkinRow) => (
                <View key={sk.id} style={[styles.skinRow, { borderColor: theme.colors.accent }]}>
                  <Text style={[styles.skinHole, { color: theme.colors.primary }]}>Hole {sk.holeNumber}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.skinWinner, { color: sk.winnerName ? theme.colors.primary : theme.mutedText }]}>
                      {sk.winnerName ?? 'Tie (carried)'}
                    </Text>
                    {sk.carriedOverFromHole != null && (
                      <Text style={[styles.skinCarry, { color: theme.mutedText }]}>
                        Carried from hole {sk.carriedOverFromHole}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.skinPot, { color: theme.colors.primary }]}>
                    {formatCentsShort(sk.potCents)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <PairingsPreviewModal
        visible={!!selRound && pairings.length > 0 && tab === 'rounds'}
        round={selRound}
        groups={pairings}
        onDiscard={() => { setSelRound(null); setPairings([]); }}
        onLock={async () => {
          if (!id || !sid || !selRound) return;
          await leagueApi.savePairings(id, sid, selRound.id,
            pairings.map(g => ({ memberIds: g.memberIds })), true);
          setSelRound(null); setPairings([]); await markLeagueStale();
        }}
      />

      <HandicapHistoryModal
        visible={showHcModal}
        member={selMember}
        history={hcHistory}
        onClose={() => setShowHcModal(false)}
      />

      <OverrideHandicapModal
        visible={showOverride}
        member={selMember}
        overrideIdx={overrideIdx}
        overrideReason={overrideReason}
        saving={overrideSaving}
        setOverrideIdx={setOverrideIdx}
        setOverrideReason={setOverrideReason}
        onCancel={() => setShowOverride(false)}
        onSave={handleOverrideHandicap}
      />

      <AddMemberModal
        visible={showAddMember}
        fields={memberFields}
        saving={mSaving}
        error={memberErr}
        onChange={next => { setMemberFields(next); setMemberErr(null); }}
        onCancel={() => { setShowAddMember(false); setMemberErr(null); }}
        onSave={handleAddMember}
      />

      <AbsencesModal
        visible={showAbsenceModal}
        round={absenceRound}
        absences={absences}
        roster={dashboard?.roster ?? []}
        selMemberId={selAbsenceMemberId}
        saving={absenceLoading}
        onSelectMember={setSelAbsenceMemberId}
        onClose={() => { setShowAbsenceModal(false); setSelAbsenceMemberId(''); }}
        onReportAbsent={handleReportAbsence}
        onAddSub={memberId => { setSubAbsentMemberId(memberId); setShowSubModal(true); }}
      />

      <AddSubModal
        visible={showSubModal}
        fields={subFields}
        saving={subSaving}
        error={subErr}
        onChange={next => { setSubFields(next); setSubErr(null); }}
        onCancel={() => { setShowSubModal(false); setSubErr(null); }}
        onSave={handleAddSub}
      />

      <AddRoundModal
        visible={showAddRound}
        date={rDate}
        notes={rNotes}
        saving={rSaving}
        seasonStart={dashboard?.season.startDate}
        seasonEnd={dashboard?.season.endDate}
        dateError={rDateErr}
        setDate={v => { setRDate(v); if (rDateErr) setRDateErr(roundDateError(v)); }}
        setNotes={setRNotes}
        onCancel={() => { setShowAddRound(false); setRDateErr(undefined); }}
        onSave={handleAddRound}
      />
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
  header:        { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderBottomWidth: 1 },
  title:         { flex: 1, fontSize: fontSize.xl, fontWeight: '700' },
  statusBadge:   { fontSize: fontSize.xs },
  errorBanner:   { flexDirection: 'row', justifyContent: 'space-between', margin: spacing[3], padding: spacing[3], borderRadius: radius.md, backgroundColor: '#fef2f2' },
  tabBar:        { maxHeight: 44, borderBottomWidth: 1 },
  tabBtn:        { paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  tabLabel:      { fontSize: fontSize.sm, fontWeight: '600' },
  content:       { padding: spacing[4], paddingBottom: spacing[10] },
  section:       { gap: spacing[2] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[1] },
  sectionTitle:  { fontSize: fontSize.xl, fontWeight: '700' },
  subTitle:      { fontSize: fontSize.lg, fontWeight: '600', marginTop: spacing[3], marginBottom: spacing[1] },
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginBottom: spacing[3] },
  statCard:      { flex: 1, minWidth: 80, borderRadius: radius.lg, padding: spacing[3], borderWidth: 1, alignItems: 'center' },
  statVal:       { fontSize: fontSize.title, fontWeight: '700' },
  statLabel:     { fontSize: fontSize.xxs, marginTop: spacing[0.5] },
  roundRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: 1 },
  roundDate:     { fontSize: fontSize.md, fontWeight: '600' },
  roundMeta:     { fontSize: fontSize.xs },
  roundStatus:   { fontSize: fontSize.xs, fontWeight: '600' },
  roundCard:     { borderRadius: radius.lg, borderWidth: 1, padding: spacing[3], marginBottom: spacing[2] },
  roundCardTop:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing[2] },
  roundActions:  { flexDirection: 'row', gap: spacing[2] },
  actionBtn:     { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.md },
  memberRow:     { flexDirection: 'row', alignItems: 'center', padding: spacing[3], borderRadius: radius.md, borderWidth: 1, marginBottom: spacing[2] },
  memberName:    { fontSize: fontSize.md, fontWeight: '600' },
  memberMeta:    { fontSize: fontSize.xs, marginTop: spacing[0.5] },
  memberActions: { flexDirection: 'row', gap: spacing[2] },
  iconBtn:       { paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radius.sm, borderWidth: 1 },
  smallBtn:      { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.md },
  tableRow:      { flexDirection: 'row', paddingVertical: spacing[2], borderBottomWidth: 1 },
  tableHeader:   { paddingVertical: spacing[3], borderRadius: radius.sm },
  tableCell:     { flex: 1, fontSize: fontSize.sm, textAlign: 'center' },
  emptyText:     { fontSize: fontSize.md, textAlign: 'center', paddingVertical: spacing[6] },
  skinRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: 1 },
  skinHole:      { width: 60, fontSize: fontSize.md, fontWeight: '700' },
  skinWinner:    { fontSize: fontSize.md },
  skinCarry:     { fontSize: fontSize.xxs, marginTop: spacing[0.5] },
  skinPot:       { fontSize: fontSize.md, fontWeight: '700' },
  syncRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: 1, marginBottom: spacing[2] },
  syncToggle:    { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.xxl, minWidth: 48, alignItems: 'center' },
});
