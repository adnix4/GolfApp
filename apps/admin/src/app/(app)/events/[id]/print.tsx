import { useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import {
  eventsApi, teamsApi, scoresApi, sponsorsApi,
  type EventDetail, type Team, type LeaderboardEntry, type Sponsor,
} from '@/lib/api';

type PrintMode = 'scorecards' | 'leaderboard' | 'sponsors';

export default function PrintKitScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [loading,  setLoading]  = useState<PrintMode | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  function openWindow(html: string) {
    if (Platform.OS !== 'web') return;
    const w = (window as any).open('', '_blank');
    if (!w) { setError('Pop-up blocked — allow pop-ups for this site and try again.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  const printScorecards = useCallback(async () => {
    setLoading('scorecards'); setError(null);
    try {
      const [event, teams] = await Promise.all([eventsApi.get(id), teamsApi.list(id)]);
      openWindow(buildScorecardHtml(event, teams));
    } catch (e: any) { setError(e.message ?? 'Failed to generate scorecards.'); }
    finally { setLoading(null); }
  }, [id]);

  const printLeaderboard = useCallback(async () => {
    setLoading('leaderboard'); setError(null);
    try {
      const [event, entries] = await Promise.all([eventsApi.get(id), eventsApi.getLeaderboard(id)]);
      openWindow(buildLeaderboardHtml(event, entries));
    } catch (e: any) { setError(e.message ?? 'Failed to generate leaderboard.'); }
    finally { setLoading(null); }
  }, [id]);

  const printSponsors = useCallback(async () => {
    setLoading('sponsors'); setError(null);
    try {
      const [event, sponsors] = await Promise.all([eventsApi.get(id), sponsorsApi.list(id)]);
      openWindow(buildSponsorHtml(event, sponsors));
    } catch (e: any) { setError(e.message ?? 'Failed to generate sponsor sheet.'); }
    finally { setLoading(null); }
  }, [id]);

  const isWeb = Platform.OS === 'web';

  return (
    <View style={styles.page}>
      <Text style={[styles.title, { color: theme.colors.primary }]}>Print Kit</Text>
      <Text style={[styles.subtitle, { color: theme.colors.accent }]}>
        Opens a print-ready page in a new tab.
        {!isWeb && ' (Only available on the web version of the admin.)'}
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.cards}>
        <PrintCard
          icon="📋"
          title="Team Scorecards"
          description="One scorecard per team with hole numbers, par, and blank score fields. Ideal for players to carry during the round."
          onPress={printScorecards}
          loading={loading === 'scorecards'}
          disabled={!isWeb || loading !== null}
          color={theme.colors.primary}
        />
        <PrintCard
          icon="🏆"
          title="Leaderboard"
          description="Current standings sorted by score. Print at end of round for trophy presentation."
          onPress={printLeaderboard}
          loading={loading === 'leaderboard'}
          disabled={!isWeb || loading !== null}
          color="#27ae60"
        />
        <PrintCard
          icon="🤝"
          title="Sponsor Sheet"
          description="All event sponsors grouped by tier, with logos and taglines. Use at registration tables."
          onPress={printSponsors}
          loading={loading === 'sponsors'}
          disabled={!isWeb || loading !== null}
          color="#8e44ad"
        />
      </View>
    </View>
  );
}

// ── Print Card ────────────────────────────────────────────────────────────────

function PrintCard({
  icon, title, description, onPress, loading, disabled, color,
}: {
  icon: string; title: string; description: string;
  onPress: () => void; loading: boolean; disabled: boolean; color: string;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <Text style={styles.cardIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color }]}>{title}</Text>
        <Text style={styles.cardDesc}>{description}</Text>
      </View>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.printBtn, { backgroundColor: color }, disabled && { opacity: 0.4 }]}
        accessibilityRole="button"
      >
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.printBtnText}>🖨 Print</Text>}
      </Pressable>
    </View>
  );
}

// ── HTML Builders ─────────────────────────────────────────────────────────────

const PRINT_BASE = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111; }
    @media print {
      @page { margin: 1.5cm; }
      .no-print { display: none; }
      .page-break { page-break-after: always; }
    }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-bottom: 10px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #1a1a2e; color: #fff; padding: 8px 10px; text-align: left; font-size: 12px; text-transform: uppercase; }
    td { padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 14px; }
    tr:nth-child(even) td { background: #f5f5f5; }
  </style>
`;

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function buildScorecardHtml(event: EventDetail, teams: Team[]): string {
  const holeRows = Array.from(
    { length: event.holes },
    (_, i) => {
      const h = event.course?.holes.find(hh => hh.holeNumber === i + 1);
      return `<tr>
        <td style="font-weight:700">${i + 1}</td>
        <td>${h?.par ?? '—'}</td>
        <td>${h?.handicapIndex ?? '—'}</td>
        <td style="height:32px"></td>
        <td></td>
      </tr>`;
    }
  ).join('');

  const cards = teams.map(team => `
    <div class="page-break" style="padding: 16px 0">
      <h1>${team.name}</h1>
      <h2>${event.name} &nbsp;·&nbsp; ${fmt(event.format)}</h2>
      <p style="font-size:12px; color:#888; margin-bottom:8px">
        ${team.startingHole ? `Starting Hole: ${team.startingHole}` : ''}
        ${team.teeTime ? ` &nbsp;·&nbsp; Tee Time: ${new Date(team.teeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
      </p>
      <p style="font-size:12px; color:#888; margin-bottom:4px">Players: ${team.players.map(p => `${p.firstName} ${p.lastName}`).join(', ')}</p>
      <table>
        <thead><tr><th>Hole</th><th>Par</th><th>HCP</th><th>Score</th><th>Putts</th></tr></thead>
        <tbody>${holeRows}</tbody>
        <tfoot>
          <tr style="font-weight:700">
            <td colspan="3">TOTAL</td>
            <td style="height:36px"></td><td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head><title>Scorecards — ${event.name}</title>${PRINT_BASE}</head>
  <body>
    <div class="no-print" style="padding:16px; background:#1a1a2e; color:#fff; font-family:Arial">
      <strong>Golf Fundraiser Pro — Scorecards</strong>
      &nbsp;&nbsp;
      <button onclick="window.print()" style="padding:8px 20px; background:#27ae60; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:700">🖨 Print All</button>
    </div>
    ${cards}
  </body></html>`;
}

function buildLeaderboardHtml(event: EventDetail, entries: LeaderboardEntry[]): string {
  const rows = entries.map((e, i) => {
    const toPar = e.toPar === 0 ? 'E' : e.toPar > 0 ? `+${e.toPar}` : `${e.toPar}`;
    const color = e.toPar < 0 ? '#27ae60' : e.toPar > 0 ? '#e74c3c' : '#111';
    return `<tr>
      <td style="font-weight:700;text-align:center">${e.rank}</td>
      <td style="font-weight:700">${e.teamName}</td>
      <td style="text-align:right; font-weight:900; font-size:16px; color:${color}">${toPar}</td>
      <td style="text-align:right">${e.grossTotal}</td>
      <td style="text-align:right">${e.isComplete ? 'F' : e.holesComplete}</td>
    </tr>`;
  }).join('');

  const dateStr = event.startAt
    ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return `<!DOCTYPE html><html><head><title>Leaderboard — ${event.name}</title>${PRINT_BASE}</head>
  <body>
    <div class="no-print" style="padding:16px; background:#1a1a2e; color:#fff; font-family:Arial">
      <strong>Golf Fundraiser Pro — Leaderboard</strong>
      &nbsp;&nbsp;
      <button onclick="window.print()" style="padding:8px 20px; background:#27ae60; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:700">🖨 Print</button>
    </div>
    <div style="padding:24px">
      <h1>${event.name}</h1>
      <h2>${fmt(event.format)}${dateStr ? ' &nbsp;·&nbsp; ' + dateStr : ''}</h2>
      <p style="font-size:12px; color:#888; margin-top:4px">Printed ${new Date().toLocaleString()}</p>
      <table>
        <thead><tr>
          <th style="width:48px;text-align:center">#</th>
          <th>Team</th>
          <th style="text-align:right">To Par</th>
          <th style="text-align:right">Gross</th>
          <th style="text-align:right">Thru</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </body></html>`;
}

function buildSponsorHtml(event: EventDetail, sponsors: Sponsor[]): string {
  const tierOrder = ['title', 'gold', 'hole', 'silver', 'bronze'];
  const tierColors: Record<string, string> = {
    title: '#8e44ad', gold: '#d4a017', hole: '#16a085', silver: '#7f8c8d', bronze: '#d35400',
  };
  const sorted = [...sponsors].sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));

  const rows = sorted.map(s => `
    <tr>
      <td>${s.logoUrl ? `<img src="${s.logoUrl}" style="height:36px; max-width:80px; object-fit:contain" />` : ''}</td>
      <td style="font-weight:700">${s.name}</td>
      <td>${s.tagline ?? ''}</td>
      <td><span style="background:${tierColors[s.tier] ?? '#999'}; color:#fff; padding:3px 10px; border-radius:8px; font-size:12px; font-weight:700; text-transform:capitalize">${s.tier}</span></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><title>Sponsors — ${event.name}</title>${PRINT_BASE}</head>
  <body>
    <div class="no-print" style="padding:16px; background:#1a1a2e; color:#fff; font-family:Arial">
      <strong>Golf Fundraiser Pro — Sponsor Sheet</strong>
      &nbsp;&nbsp;
      <button onclick="window.print()" style="padding:8px 20px; background:#27ae60; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:700">🖨 Print</button>
    </div>
    <div style="padding:24px">
      <h1>Our Sponsors</h1>
      <h2>${event.name}</h2>
      <table>
        <thead><tr><th style="width:100px">Logo</th><th>Name</th><th>Tagline</th><th style="width:100px">Tier</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </body></html>`;
}

const styles = StyleSheet.create({
  page:     { flex: 1, padding: 28, backgroundColor: '#f7f8fa' },
  title:    { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  errorBox: { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c', marginBottom: 16 },
  errorText:{ color: '#c0392b', fontSize: 14 },

  cards: { gap: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#fff', borderRadius: 12, padding: 18,
    borderLeftWidth: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardIcon:  { fontSize: 32 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  cardDesc:  { fontSize: 13, color: '#666', lineHeight: 18 },
  printBtn:  { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 9, minWidth: 90, alignItems: 'center' },
  printBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
