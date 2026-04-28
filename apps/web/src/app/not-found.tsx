export default function NotFound() {
  return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
      <div>
        <p style={{ fontSize: '3rem' }}>🔍</p>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: '1rem' }}>
          Event Not Found
        </h1>
        <p style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>
          This event may have been cancelled, or the URL may be incorrect.
        </p>
        <p style={{ color: 'var(--color-accent)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Check your event code and try again.
        </p>
      </div>
    </main>
  );
}
