export default function Home() {
  return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '4rem' }}>⛳</p>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: '1rem' }}>
          Golf Fundraiser Pro
        </h1>
        <p style={{ color: 'var(--color-accent)', marginTop: '0.5rem' }}>
          Enter your event URL to view the event page.
        </p>
        <p style={{ color: 'var(--color-accent)', fontSize: '0.875rem', marginTop: '1rem' }}>
          Format: <code style={{ background: '#e8f0e8', padding: '2px 6px', borderRadius: 4 }}>/e/&#123;org&#125;/&#123;eventCode&#125;</code>
        </p>
      </div>
    </main>
  );
}
