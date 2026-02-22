import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Playfair_Display, Dancing_Script, Nunito } from 'next/font/google';
import './globals.css';
import AppearanceProvider from '@/components/AppearanceProvider';
import { MotionProvider } from '@/lib/motion';
import ErrorBoundary from '@/components/ErrorBoundary';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-code' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' });
const dancingScript = Dancing_Script({ subsets: ['latin'], variable: '--font-cursive' });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-rounded' });

export const metadata: Metadata = {
  title: 'ZeroTrace - Private by Design',
  description: '🔒 End-to-end encrypted messaging platform. Zero-knowledge server. Perfect Forward Secrecy.',
  keywords: ['encryption', 'privacy', 'messaging', 'secure', 'e2e', 'zero-knowledge'],
  authors: [{ name: 'ZeroTrace Team' }],
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
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${playfair.variable} ${dancingScript.variable} ${nunito.variable} ${inter.className} bg-gray-900 text-white antialiased`} suppressHydrationWarning>
        <MotionProvider>
          <ErrorBoundary>
            <AppearanceProvider>
              <div id="root" className="min-h-screen">
                {children}
              </div>
              <div id="modal-root" />
            </AppearanceProvider>
          </ErrorBoundary>
        </MotionProvider>
      </body>
    </html>
  );
}
