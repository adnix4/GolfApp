import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme, FormModal } from '@gfp/ui';
import type { Team } from '@/lib/api';
import { fontSize, spacing } from '@gfp/theme';

// ── Confirm Remove Team Modal ─────────────────────────────────────────────────

interface ConfirmRemoveTeamModalProps {
  visible:   boolean;
  eventName: string;
  team:      Team | null;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmRemoveTeamModal({ visible, eventName, team, onClose, onConfirm }: ConfirmRemoveTeamModalProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormModal
      visible={visible}
      title={eventName}
      onClose={onClose}
      onSubmit={handleConfirm}
      submitLabel="Remove"
      loading={loading}
      destructive
      maxWidth={420}
    >
      <Text style={[styles.confirmModalMessage, { color: theme.colors.primary }]}>
        Warning removing team "{team?.name}" can not be undone.
      </Text>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  confirmModalMessage: { fontSize: fontSize.xl, fontWeight: '600', lineHeight: 24, marginBottom: spacing[1] },
});
