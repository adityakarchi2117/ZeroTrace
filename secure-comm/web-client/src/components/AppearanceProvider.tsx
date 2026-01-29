'use client';

import { useEffect } from 'react';
import { initializeAppearance } from '@/lib/useAppearance';

export default function AppearanceProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize appearance settings on mount
    initializeAppearance();
  }, []);

  return <>{children}</>;
}
