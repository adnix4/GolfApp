import { readableTextOn } from '@gfp/theme';
import { resolveMedia } from '@/lib/api';
import { s } from './eventPageStyles';

/**
 * Page-top banner: organization mark + event name + status pill.
 * Logo is optional; falls back to text-only when resolvedLogoUrl is null.
 */
export default function EventHeader({
  orgName,
  eventName,
  status,
  logoUrl,
}: {
  orgName:    string;
  eventName:  string;
  status:     string;
  logoUrl:    string | null;
}) {
  return (
    <header style={s.header}>
      <div style={s.headerInner}>
        {logoUrl && <img src={resolveMedia(logoUrl)} alt={orgName} style={s.orgLogo} />}
        <div>
          <p style={s.orgName}>{orgName}</p>
          <h1 style={s.eventName}>{eventName}</h1>
        </div>
        <StatusBadge status={status} />
      </div>
    </header>
  );
}

// The label is derived from each fill: white on these bright fills was
// 2.1–3.2:1, so the badge keeps its color and the label adapts (AX4).
const STATUS_COLORS: Record<string, { bg: string; text: string }> = Object.fromEntries(
  Object.entries({ registration: '#3498db', active: '#2ecc71', scoring: '#f39c12', completed: '#27ae60' })
    .map(([k, bg]) => [k, { bg, text: readableTextOn(bg) }]),
);

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status];
  if (!c) return null;
  return (
    <span style={{ backgroundColor: c.bg, color: c.text, ...s.badge }}>
      {status === 'active' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
