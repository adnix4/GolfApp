import type { Metadata } from 'next';
import { buildCSSVars, ECO_GREEN_DEFAULT } from '@gfp/theme';

export const metadata: Metadata = {
  title: { default: 'Golf Fundraiser Pro', template: '%s | Golf Fundraiser Pro' },
  description: 'Golf scramble fundraising made easy.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cssVars = buildCSSVars(ECO_GREEN_DEFAULT);

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssVars }} />
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const globalStyles = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--color-surface);
  color: var(--color-primary);
  line-height: 1.5;
}
a { color: var(--color-action); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; }
`;
