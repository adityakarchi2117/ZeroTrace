'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import AuthScreen from '@/components/AuthScreen';
import ChatApp from '@/components/ChatApp';

export default function Home() {
  const { isAuthenticated, isLoading, loadStoredAuth } = useStore();

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cipher-darker flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cipher-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading CipherLink...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <ChatApp /> : <AuthScreen />;
}
