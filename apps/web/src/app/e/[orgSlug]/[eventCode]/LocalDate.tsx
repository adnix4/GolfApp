'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@gfp/shared-types';

/**
 * An event date in the visitor's time zone. Server components render in the
 * server's zone (UTC in production), which shows an evening start on the next
 * day. The server and the first client render both use UTC so hydration
 * matches, then the date switches to local once mounted.
 */
export default function LocalDate({ iso, options }: { iso: string; options?: Intl.DateTimeFormatOptions }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{formatDate(iso, mounted ? options : { ...options, timeZone: 'UTC' })}</>;
}
