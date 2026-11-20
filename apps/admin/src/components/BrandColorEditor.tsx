/**
 * BrandColorEditor — the five brand color tokens plus the accessibility check,
 * shared by Organization Settings and Event Settings (AX4).
 *
 * The organizer's colors are never changed behind their back. The check below
 * the inputs (auditTheme, packages/theme brand.ts) sorts every problem into:
 *
 *   ✓ paired    the brand color stays; text that would be drawn in it uses a
 *               readable shade of the same hue, shown here with its ratio.
 *   ✕ blocking  Primary text on Surface, or a dark Surface. Save is refused;
 *               each issue offers one-tap fixes that keep the hue.
 *   ⚠ accepted  the organizer turned on "Prioritize my brand colors" (after a
 *               warning popup): the palette saves as entered and the paired
 *               shades are dropped too.
 *
 * A live preview shows the result with the colors the apps will really use.
 */
import {
  View, Text, TextInput, Pressable, StyleSheet, Platform, Switch,
} from 'react-native';
import {
  ECO_GREEN_DEFAULT, auditTheme, brandTextColors, isHexColor, readableTextOn,
  type BrandIssue, type GFPTheme, fontSize, radius, spacing, status,
} from '@gfp/theme';
import { useTheme } from '@gfp/ui';
import { confirmAction } from '@/lib/confirmAction';

export const TOKEN_META: { key: Exclude<keyof GFPTheme, 'brandPriority'>; label: string; desc: string }[] = [
  { key: 'primary',   label: 'Primary',   desc: 'Nav, headings, primary buttons' },
  { key: 'action',    label: 'Action',    desc: 'Call-to-action buttons, links, active tabs' },
  { key: 'accent',    label: 'Accent',    desc: 'Hover states, badges, sponsor strip (never text)' },
  { key: 'highlight', label: 'Highlight', desc: 'Selected states, callout banners, header text' },
  { key: 'surface',   label: 'Surface',   desc: 'Page background behind the white cards' },
];

/** A saved theme JSON (or null) as an editable palette, defaults filled in. */
export function parseTheme(json: string | null | undefined): GFPTheme {
  if (!json) return { ...ECO_GREEN_DEFAULT };
  try { return { ...ECO_GREEN_DEFAULT, ...JSON.parse(json) }; }
  catch { return { ...ECO_GREEN_DEFAULT }; }
}

/** Every token is a complete #rrggbb (the save gate for typing mistakes). */
export function allColorsValid(colors: GFPTheme): boolean {
  return TOKEN_META.every(m => isHexColor(colors[m.key]));
}

export const BLOCKED_SAVE_MESSAGE =
  'Some brand colors are hard to read together. Choose one of the suggested fixes under Brand Colors, '
  + 'or turn on "Prioritize my brand colors".';

// Opens the browser's native color picker via a programmatically-created input
function openColorPicker(current: string, onChange: (v: string) => void) {
  if (Platform.OS !== 'web') return;
  const input = (globalThis as any).document?.createElement('input');
  if (!input) return;
  input.type  = 'color';
  input.value = isHexColor(current) ? current : '#000000';
  input.style.position = 'fixed';
  input.style.opacity  = '0';
  input.style.pointerEvents = 'none';
  (globalThis as any).document.body.appendChild(input);
  input.oninput  = () => onChange(input.value);
  input.onchange = () => {
    onChange(input.value);
    (globalThis as any).document.body.removeChild(input);
  };
  input.click();
}

function ColorRow({ meta, value, onChange, disabled }: {
  meta: (typeof TOKEN_META)[number];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const valid = isHexColor(value);
  return (
    <View style={s.row}>
      <Pressable accessibilityRole="button"
        style={[s.swatch, { backgroundColor: valid ? value : '#cccccc' }]}
        onPress={() => !disabled && openColorPicker(value, onChange)}
        accessibilityLabel={`Pick color for ${meta.label}`}
      />
      <View style={s.info}>
        <Text style={s.tokenLabel}>{meta.label}</Text>
        <Text style={[s.tokenDesc, { color: theme.mutedText }]}>{meta.desc}</Text>
      </View>
      <TextInput
        style={[s.hexInput, !valid && s.hexInputError]}
        value={value}
        onChangeText={onChange}
        placeholder="#rrggbb"
        placeholderTextColor={theme.mutedText}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        editable={!disabled}
        accessibilityLabel={`${meta.label} color hex code`}
      />
    </View>
  );
}

const TONE = {
  blocking: { bg: status.dangerBg, border: status.danger,  fg: status.dangerText,  icon: '✕' },
  accepted: { bg: '#fff7e6',       border: status.warning, fg: status.warningText, icon: '⚠' },
  paired:   { bg: '#f0fdf4',       border: status.success, fg: status.successText, icon: '✓' },
} as const;

const ratio = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}:1`;

function IssueBox({ issue, colors, onChange, disabled }: {
  issue: BrandIssue; colors: GFPTheme; onChange: (next: GFPTheme) => void; disabled: boolean;
}) {
  const tone = TONE[issue.kind];
  return (
    <View style={[s.box, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[s.boxHead, { color: tone.fg }]}>{tone.icon} {issue.title}</Text>
      <Text style={s.boxBody}>{issue.detail}</Text>
      {issue.companion && (
        <View style={s.companion}>
          <View style={[s.chip, { backgroundColor: issue.companion.color }]} aria-hidden />
          <Text style={s.boxBody}>Text color {issue.companion.color} · {ratio(issue.companion.ratio)}</Text>
        </View>
      )}
      {issue.fixes.length > 0 && (
        <View style={s.fixRow}>
          {issue.fixes.map(fix => {
            const changes = Object.entries(fix.patch) as [keyof GFPTheme, string][];
            return (
              <Pressable
                key={fix.label}
                accessibilityRole="button"
                accessibilityLabel={`${fix.label}: ${changes.map(([k, v]) => `${k} ${v}`).join(', ')}`}
                disabled={disabled}
                onPress={() => onChange({ ...colors, ...fix.patch })}
                style={[s.fixBtn, { borderColor: tone.border }]}
              >
                {changes.map(([k, v]) => <View key={k} style={[s.chip, { backgroundColor: v }]} aria-hidden />)}
                <Text style={[s.fixText, { color: tone.fg }]}>{fix.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** What the apps will draw with these colors: header, card, link, buttons. */
function Preview({ colors }: { colors: GFPTheme }) {
  if (!TOKEN_META.every(m => isHexColor(colors[m.key]))) return null;
  const text = brandTextColors(colors);
  return (
    <View style={[s.preview, { backgroundColor: colors.surface }]} accessibilityLabel="Preview of the brand colors">
      <View style={[s.previewHeader, { backgroundColor: colors.primary }]}>
        <Text style={[s.previewHeaderText, { color: text.highlightText }]}>Spring Scramble</Text>
        <Text style={[s.previewSmall, { color: readableTextOn(colors.primary) }]}>Hole 4 · Par 3</Text>
      </View>
      <View style={s.previewCard}>
        <Text style={[s.previewCardHead, { color: colors.primary }]}>Leaderboard</Text>
        <Text style={[s.previewSmall, { color: text.actionText, textDecorationLine: 'underline' }]}>View full standings</Text>
        <View style={s.previewBtns}>
          <View style={[s.previewBtn, { backgroundColor: colors.action }]}>
            <Text style={[s.previewSmall, { color: readableTextOn(colors.action), fontWeight: '700' }]}>Place Bid</Text>
          </View>
          <View style={[s.previewBtn, { backgroundColor: colors.highlight }]}>
            <Text style={[s.previewSmall, { color: readableTextOn(colors.highlight), fontWeight: '700' }]}>Selected</Text>
          </View>
          <View style={[s.previewBtn, { backgroundColor: colors.accent }]} />
        </View>
      </View>
    </View>
  );
}

export function BrandColorEditor({ colors, onChange, disabled }: {
  colors: GFPTheme;
  onChange: (next: GFPTheme) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const issues = auditTheme(colors);
  const priority = !!colors.brandPriority;

  function setPriority(on: boolean) {
    if (!on) {
      const { brandPriority: _, ...rest } = colors;
      onChange(rest);
      return;
    }
    // Ask first: this is the organizer choosing to ship text some golfers can't read.
    const hard = issues.filter(i => i.kind === 'blocking').map(i => i.title.toLowerCase());
    confirmAction(
      'Use your brand colors as entered?',
      (hard.length
        ? `These colors will save even though ${hard.join(' and ')}. `
        : 'Text will use your exact brand colors instead of the readable shades shown above. ')
        + 'Golfers with low vision, and anyone reading a phone in sunlight, may find some text hard to read. '
        + 'You can turn this off at any time.',
      () => onChange({ ...colors, brandPriority: true }),
      'Use My Colors',
      { kind: 'warning' },
    );
  }

  return (
    <View>
      {TOKEN_META.map(meta => (
        <ColorRow
          key={meta.key}
          meta={meta}
          value={colors[meta.key]}
          onChange={v => onChange({ ...colors, [meta.key]: v })}
          disabled={disabled}
        />
      ))}

      {/* Re-announced as the colors change, so a screen-reader user hears the verdict. */}
      <View aria-live="polite" style={s.checks}>
        {allColorsValid(colors) && issues.length === 0 && (
          <View style={[s.box, { backgroundColor: TONE.paired.bg, borderColor: TONE.paired.border }]}>
            <Text style={[s.boxHead, { color: TONE.paired.fg }]}>✓ Every color pairing is easy to read</Text>
            <Text style={s.boxBody}>All text meets the 4.5:1 contrast minimum.</Text>
          </View>
        )}
        {issues.map(issue => (
          <IssueBox key={issue.id} issue={issue} colors={colors} onChange={onChange} disabled={disabled} />
        ))}
      </View>

      {(issues.length > 0 || priority) && (
        <View style={s.priorityRow}>
          <View style={s.info}>
            <Text style={s.tokenLabel}>Prioritize my brand colors</Text>
            <Text style={[s.tokenDesc, { color: theme.mutedText }]}>
              Save and use these colors exactly as entered, even where text falls below the contrast minimum.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Prioritize my brand colors"
            value={priority}
            onValueChange={setPriority}
            trackColor={{ true: status.warning }}
            disabled={disabled}
          />
        </View>
      )}

      <Preview colors={colors} />
    </View>
  );
}

const s = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], gap: spacing[3], borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  swatch:        { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: '#ddd', flexShrink: 0 },
  info:          { flex: 1 },
  tokenLabel:    { fontSize: fontSize.md, fontWeight: '700', color: '#333' },
  tokenDesc:     { fontSize: fontSize.xs, marginTop: 1 },
  hexInput:      { borderWidth: 1, borderColor: '#ccc', borderRadius: radius.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[2], fontSize: fontSize.md, width: 90, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  hexInputError: { borderColor: status.danger },

  checks:    { gap: spacing[2], marginTop: spacing[4] },
  box:       { borderRadius: radius.md, borderWidth: 1, padding: spacing[3], gap: spacing[1] },
  boxHead:   { fontSize: fontSize.sm, fontWeight: '700' },
  boxBody:   { fontSize: fontSize.sm, color: '#333', lineHeight: 19 },
  companion: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[1] },
  chip:      { width: 18, height: 18, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)' },
  fixRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] },
  fixBtn:    { flexDirection: 'row', alignItems: 'center', gap: spacing[1], borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2], backgroundColor: '#fff' },
  fixText:   { fontSize: fontSize.sm, fontWeight: '700' },

  priorityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[4] },

  preview:           { marginTop: spacing[4], borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e5e5' },
  previewHeader:     { paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  previewHeaderText: { fontSize: fontSize.lg, fontWeight: '800' },
  previewSmall:      { fontSize: fontSize.sm },
  previewCard:       { backgroundColor: '#fff', margin: spacing[3], borderRadius: radius.md, padding: spacing[3], gap: spacing[2] },
  previewCardHead:   { fontSize: fontSize.md, fontWeight: '800' },
  previewBtns:       { flexDirection: 'row', gap: spacing[2], alignItems: 'center' },
  previewBtn:        { borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2], minWidth: 36, minHeight: 32, justifyContent: 'center' },
});
