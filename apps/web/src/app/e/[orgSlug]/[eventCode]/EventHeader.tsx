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
        {logoUrl && <img src={logoUrl} alt={orgName} style={s.orgLogo} />}
        <div>
          <p style={s.orgName}>{orgName}</p>
          <h1 style={s.eventName}>{eventName}</h1>
        </div>
        <StatusBadge status={status} />
      </div>
    </header>
  );
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  registration: { bg: '#3498db', text: '#fff' },
  active:       { bg: '#2ecc71', text: '#fff' },
  scoring:      { bg: '#f39c12', text: '#fff' },
  completed:    { bg: '#27ae60', text: '#fff' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status];
  if (!c) return null;
  return (
    <span style={{ backgroundColor: c.bg, color: c.text, ...s.badge }}>
      {status === 'active' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
