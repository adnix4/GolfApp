import { Pressable, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { confirmLeaveEvent, unsyncedHoleCount } from '@/lib/confirmLeave';

/**
 * "Leave Event" for the in-event tabs, so a golfer (or a device left on a
 * stale event) can get back to Join without finishing the round. Always asks
 * first, and warns when scores haven't synced.
 */
export function LeaveEventButton() {
  const theme = useTheme();
  const { clearSession, completedHoles, syncedHoles } = useSession();

  return (
    <Pressable
      style={[styles.btn, { borderColor: theme.mutedText }]}
      onPress={() => confirmLeaveEvent(async () => {
        await clearSession();
        router.replace('/join');
      }, unsyncedHoleCount(completedHoles, syncedHoles))}
      accessibilityRole="button"
      accessibilityLabel="Leave this event"
    >
      <Text style={[styles.text, { color: theme.mutedText }]}>Leave Event</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn:  { marginTop: 24, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  text: { fontSize: 14, fontWeight: '600' },
});
