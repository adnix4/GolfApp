import { describe, it, expect } from 'vitest';
import { splitHighlight } from '../lib/dialogText';

describe('splitHighlight', () => {
  it('pulls a quoted title out as a highlighted part, dropping the quotes', () => {
    const { parts, inline } = splitHighlight('Pledge $25.00 to "Junior Golf"?', 'Junior Golf');
    expect(inline).toBe(true);
    expect(parts).toEqual([
      { text: 'Pledge $25.00 to ', highlight: false },
      { text: 'Junior Golf', highlight: true },
      { text: '?', highlight: false },
    ]);
  });

  it('highlights an unquoted mention and every repeat', () => {
    const { parts } = splitHighlight('Flag now. Flag later.', 'Flag');
    expect(parts.filter(p => p.highlight)).toHaveLength(2);
    expect(parts.map(p => p.text).join('')).toBe('Flag now. Flag later.');
  });

  it('reports not-inline when the message never mentions the subject', () => {
    expect(splitHighlight('Bid placed!', 'Signed Flag'))
      .toEqual({ parts: [{ text: 'Bid placed!', highlight: false }], inline: false });
  });

  it('passes plain messages through untouched', () => {
    expect(splitHighlight('Saved.')).toEqual({ parts: [{ text: 'Saved.', highlight: false }], inline: false });
    expect(splitHighlight('', 'X')).toEqual({ parts: [], inline: false });
  });
});
