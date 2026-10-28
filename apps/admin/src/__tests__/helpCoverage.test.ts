/// <reference types="node" />  // this test reads the help and layout sources
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The help pages are hand-written, so a new event tab ships without help unless
// something notices (the Checkout tab went undocumented this way). Read the tab
// list straight out of the event layout and require each one in both pages.

const app = resolve(__dirname, '../app/(app)');
const read = (p: string) => readFileSync(resolve(app, p), 'utf8');

const layout = read('events/[id]/_layout.tsx');
const tabLabels = [...layout.matchAll(/\{\s*label:\s*'([^']+)',\s*path:\s*'[^']*'\s*\}/g)]
  .map(m => m[1])
  .filter(l => l !== 'Help');

describe('help pages cover every event tab', () => {
  it('finds the tab list in the event layout', () => {
    expect(tabLabels).toContain('Overview');
    expect(tabLabels).toContain('Checkout');
  });

  for (const page of ['events/[id]/help.tsx', 'help.tsx']) {
    it(`${page} describes each tab`, () => {
      const src = read(page);
      const missing = tabLabels.filter(l => !src.includes(`name: '${l}'`));
      expect(missing).toEqual([]);
    });
  }
});
