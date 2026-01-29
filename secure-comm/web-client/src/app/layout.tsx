import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AppearanceProvider from '@/components/AppearanceProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CipherLink - Private by Design',
  description: '🔐 End-to-end encrypted messaging platform. Zero-knowledge server. Perfect Forward Secrecy.',
  keywords: ['encryption', 'privacy', 'messaging', 'secure', 'e2e', 'zero-knowledge'],
  authors: [{ name: 'CipherLink Team' }],
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f2937',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} bg-gray-900 text-white antialiased`} suppressHydrationWarning>
        <AppearanceProvider>
          <div id="root" className="min-h-screen">
            {children}
          </div>
          <div id="modal-root" />
        </AppearanceProvider>
      </body>
    </html>
  );
}
