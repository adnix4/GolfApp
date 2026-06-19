import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput,
  ActivityIndicator, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { formatCentsShort } from '@gfp/shared-types';
import {
  leagueApi, SeasonDashboard, LeagueMember, LeagueRound,
  StandingRow, SkinRow, PairingGroup, HandicapHistoryRow, RoundAbsence,
} from '@/lib/api';
import {
  PairingsPreviewModal, HandicapHistoryModal, OverrideHandicapModal,
  AddMemberModal, AbsencesModal, AddSubModal, AddRoundModal,
  type AddMemberFields, type AddSubFields,
} from '@/components/seasonModals';

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
  const [memberFields, setMemberFields]   = useState<AddMemberFields>({ firstName: '', lastName: '', email: '', handicap: '0' });
  const [mSaving, setMSaving]             = useState(false);

  const [showAddRound, setShowAddRound] = useState(false);
  const [rDate, setRDate]   = useState('');
  const [rNotes, setRNotes] = useState('');
  const [rSaving, setRSaving] = useState(false);

  const [showAbsenceModal, setShowAbsenceModal]       = useState(false);
  const [absenceRound, setAbsenceRound]               = useState<LeagueRound | null>(null);
  const [absences, setAbsences]                       = useState<RoundAbsence[]>([]);
  const [selAbsenceMemberId, setSelAbsenceMemberId]   = useState('');
  const [absenceLoading, setAbsenceLoading]           = useState(false);

  const [showSubModal, setShowSubModal]           = useState(false);
  const [subAbsentMemberId, setSubAbsentMemberId] = useState('');
  const [subFields, setSubFields]                 = useState<AddSubFields>({ firstName: '', lastName: '', email: '', handicap: '0' });
  const [subSaving, setSubSaving]                 = useState(false);

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
    if (!id || !sid || !memberFields.firstName || !memberFields.lastName || !memberFields.email) return;
    setMSaving(true);
    try {
      await leagueApi.addMember(id, sid, {
        firstName: memberFields.firstName,
        lastName:  memberFields.lastName,
        email:     memberFields.email,
        handicapIndex: parseFloat(memberFields.handicap) || 0,
      });
      setShowAddMember(false);
      setMemberFields({ firstName: '', lastName: '', email: '', handicap: '0' });
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
    if (!id || !sid || !absenceRound || !subAbsentMemberId) return;
    if (!subFields.firstName || !subFields.lastName || !subFields.email) return;
    setSubSaving(true);
    try {
      await leagueApi.addSubstitute(id, sid, absenceRound.id, {
        absentMemberId: subAbsentMemberId,
        firstName: subFields.firstName,
        lastName:  subFields.lastName,
        email:     subFields.email,
        handicapIndex: parseFloat(subFields.handicap) || 0,
      });
      const updated = await leagueApi.getAbsences(id, sid, absenceRound.id);
      setAbsences(updated);
      setShowSubModal(false);
      setSubFields({ firstName: '', lastName: '', email: '', handicap: '0' });
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
          setSelRound(null); setPairings([]); await load();
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
        onChange={setMemberFields}
        onCancel={() => setShowAddMember(false)}
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
        onChange={setSubFields}
        onCancel={() => setShowSubModal(false)}
        onSave={handleAddSub}
      />

      <AddRoundModal
        visible={showAddRound}
        date={rDate}
        notes={rNotes}
        saving={rSaving}
        setDate={setRDate}
        setNotes={setRNotes}
        onCancel={() => setShowAddRound(false)}
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
  syncRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, marginBottom: 8 },
  syncToggle:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, minWidth: 48, alignItems: 'center' },
});
