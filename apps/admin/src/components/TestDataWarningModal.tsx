import { DialogFrame } from '@gfp/ui';
import { useEventDetail } from '@/lib/eventContext';

interface Props {
  visible:     boolean;
  title:       string;
  description: string;
  confirmLabel?: string;
  loading?:    boolean;
  onConfirm:   () => void;
  onCancel:    () => void;
}

/**
 * Test-data warnings (advancing a Draft with test records, clearing test
 * data, turning test mode off) in the shared DialogFrame. These change or
 * delete data, so they always ask — no "Don't show me this warning again"
 * (see .claude/skills/popup-format/SKILL.md §3).
 */
export function TestDataWarningModal({
  visible, title, description, confirmLabel = 'Proceed', loading = false, onConfirm, onCancel,
}: Props) {
  const { event } = useEventDetail();
  if (!visible) return null;

  return (
    <DialogFrame
      headerTitle={event.name}
      kind="warning"
      title={title}
      message={description}
      buttons={[
        { text: 'Cancel', style: 'cancel' },
        { text: confirmLabel, style: 'destructive' },
      ]}
      busy={loading}
      onButton={b => (b.style === 'cancel' ? onCancel() : onConfirm())}
      onDismiss={onCancel}
    />
  );
}
