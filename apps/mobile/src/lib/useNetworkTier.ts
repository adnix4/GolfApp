import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export type NetworkTier = 'full' | 'degraded' | 'offline';

// Adaptive poll intervals per connectivity tier
export const POLL_INTERVAL_MS: Record<NetworkTier, number> = {
  full:     30_000,  // WiFi / ethernet
  degraded: 60_000,  // cellular / unknown
  offline:  0,       // no polling
};

export function useNetworkTier(): NetworkTier {
  const [tier, setTier] = useState<NetworkTier>('full');

  useEffect(() => {
    return NetInfo.addEventListener(state => {
      if (!state.isConnected) {
        setTier('offline');
      } else if (state.type === 'wifi' || state.type === 'ethernet') {
        setTier('full');
      } else {
        setTier('degraded');
      }
    });
  }, []);

  return tier;
}
