import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, AdaptiveLogoFrame } from '@gfp/ui';
import type { SponsorCacheDto } from '@/lib/api';
import { fontSize, radius, spacing } from '@gfp/theme';

export function HoleSponsorBadge({ sponsor, logoUrl, onPress }: {
  sponsor:  SponsorCacheDto;
  logoUrl?: string | null;
  onPress:  () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.sponsorBadge,
        {
          borderColor: theme.colors.primary,
          // Light surface with primary content, never a primary fill: the
          // theming contract guarantees surface is light and primary
          // clears 4.5:1 on it, and sponsor logos assume a light ground.
          backgroundColor: pressed ? theme.colors.primary + '12' : '#f9f9f9',
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${sponsor.name} sponsor info`}
    >
      <View style={styles.sponsorContent}>
      {logoUrl ? (
        <AdaptiveLogoFrame
          uri={logoUrl}
          width={120} height={36}
          primaryColor={theme.colors.primary}
          borderColor={theme.colors.primary}
          borderRadius={8}
          padding={6}
          accessibilityLabel={`Hole sponsor: ${sponsor.name}`}
        />
      ) : (
        <Text style={[styles.sponsorName, { color: theme.colors.primary }]}>
          Sponsored by {sponsor.name}
        </Text>
      )}
      {sponsor.tagline ? (
        <Text style={[styles.sponsorTagline, { color: theme.colors.primary }]}>
          {sponsor.tagline}
        </Text>
      ) : null}
      </View>
      {/* Disclosure chevron carries the affordance now that the
          "Tap to learn more" hint is gone. */}
      <Text style={[styles.sponsorChevron, { color: theme.colors.primary }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sponsorBadge: {
    borderWidth: 2, borderRadius: radius.lg,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing[3], paddingHorizontal: spacing[3], marginBottom: spacing[3],
    gap: spacing[2],
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  sponsorContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[1] },
  sponsorName:    { fontSize: fontSize.sm, fontWeight: '700' },
  sponsorTagline: { fontSize: fontSize.xxs, fontWeight: '600', fontStyle: 'italic', textAlign: 'center' },
  sponsorChevron: { fontSize: fontSize.display, fontWeight: '400', lineHeight: 28, marginTop: -2 },
});
