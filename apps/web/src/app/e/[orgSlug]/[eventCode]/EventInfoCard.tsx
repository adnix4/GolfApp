import { s } from './eventPageStyles';
import type { PublicEventData } from '@/lib/api';
import type { ReactNode } from 'react';
import LocalDate from './LocalDate';

/**
 * The date / format / course / team-spots quick-facts card.
 * Each row is rendered as an InfoItem so the icons and labels stay
 * vertically aligned without per-row style duplication.
 */
export default function EventInfoCard({ event }: { event: PublicEventData }) {
  return (
    <section style={s.card}>
      <div style={s.infoGrid}>
        {event.startAt && (
          <InfoItem
            icon="📅"
            label="Date"
            value={<LocalDate iso={event.startAt} options={{ weekday: 'long', month: 'long' }} />}
          />
        )}
        <InfoItem icon="⛳" label="Format" value={titleCase(event.format)} />
        {event.course && (
          <InfoItem
            icon="📍"
            label="Course"
            value={`${event.course.name} — ${event.course.city}, ${event.course.state}`}
          />
        )}
        {event.entryFeeCents != null && (
          <InfoItem icon="💵" label="Entry Fee" value={`${formatDollars(event.entryFeeCents)} per golfer`} />
        )}
        {event.spotsRemaining != null && (
          <InfoItem
            icon="👥"
            label="Team Spots"
            value={event.spotsRemaining === 0
              ? 'Event full'
              : `${event.spotsRemaining} spot${event.spotsRemaining !== 1 ? 's' : ''} remaining`}
          />
        )}
      </div>
    </section>
  );
}

function InfoItem({ icon, label, value }: { icon: string; label: string; value: ReactNode }) {
  return (
    <div style={s.infoItem}>
      <span style={s.infoIcon}>{icon}</span>
      <div>
        <p style={s.infoLabel}>{label}</p>
        <p style={s.infoValue}>{value}</p>
      </div>
    </div>
  );
}

function titleCase(snake: string): string {
  return snake.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDollars(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
}
