'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';
import { Lock, Mail, User, Eye, EyeOff, Shield, Key, MessageSquare } from 'lucide-react';

const Aurora = dynamic(() => import('./Aurora'), { ssr: false });
const IconWithBlur = dynamic(() => import('./IconWithBlur'), { ssr: false });
const SpotlightCard = dynamic(() => import('./SpotlightCard'), { ssr: false });
const CircularText = dynamic(() => import('./CircularText'), { ssr: false });

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login, register, isLoading, error, clearError } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
    } catch (err) {
      // Error is handled by store
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    clearError();
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-cipher-darker flex relative overflow-hidden">
      {/* Aurora Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={["#ba66ff", "#B19EEF", "#5227FF"]}
          blend={0.5}
          amplitude={1.0}
          speed={1}
        />
      </div>
      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-r from-cipher-dark/75 via-cipher-dark/40 to-cipher-darker/70" />

      {/* Top-Left Circular Branding */}
      <div className="absolute top-6 left-6 z-20 lg:top-8 lg:left-10">
        <CircularText
          text="ZERO·TRACE·SECURE·"
          onHover="speedUp"
          spinDuration={16}
          className="w-[120px] h-[120px] text-[14px] lg:w-[160px] lg:h-[160px] lg:text-[17px] drop-shadow-[0_0_24px_rgba(82,39,255,0.35)]"
        />
      </div>

      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 p-12 pt-52 flex-col justify-between relative z-10">
        <div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Private by design.<br />
            <span className="text-cipher-primary">Secure by default.</span>
          </h1>

          <p className="text-gray-400 text-lg mb-12">
            End-to-end encrypted communication where only you and your recipient can read messages.
            The server never sees your data.
          </p>

          {/* Features */}
          <div className="space-y-4">
            <Feature
              icon={<Shield className="w-5 h-5" />}
              title="Zero-Knowledge Server"
              description="We can't read your messages. Ever."
            />
            <Feature
              icon={<Key className="w-5 h-5" />}
              title="Cryptographic Identity"
              description="Your identity is based on math, not trust."
            />
            <Feature
              icon={<MessageSquare className="w-5 h-5" />}
              title="Ephemeral Messages"
              description="Messages that disappear after being read."
            />
          </div>
        </div>

        <div className="text-gray-500 text-sm">
          <p>Encryption: X25519 + AES-256-GCM</p>
          <p>Protocol: Signal-style X3DH</p>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 pt-40 lg:pt-8 relative z-10">
        <div className="w-full max-w-md">

          <SpotlightCard
            className="rounded-2xl border border-gray-700/50 bg-cipher-dark/80 backdrop-blur-xl p-8"
            spotlightColor="rgba(82, 39, 255, 0.2)"
          >
            <h2 className="text-2xl font-bold text-white mb-2">
              {isLogin ? 'Welcome ' : 'Create account'}
            </h2>
            <p className="text-gray-400 mb-6">
              {isLogin
                ? 'Enter your credentials to access your encrypted messages'
                : 'Generate your cryptographic identity'}
            </p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-cipher-dark border border-gray-700 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-cipher-primary transition-colors"
                    placeholder="Enter username"
                    required
                    minLength={3}
                  />
                </div>
              </div>

              {!isLogin && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-cipher-dark border border-gray-700 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-cipher-primary transition-colors"
                      placeholder="Enter email"
                      required={!isLogin}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-cipher-dark border border-gray-700 rounded-lg py-3 pl-10 pr-12 text-white placeholder-gray-500 focus:border-cipher-primary transition-colors"
                    placeholder="Enter password"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-cipher-primary to-cipher-secondary text-white py-3 rounded-lg font-medium btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isLogin ? 'Authenticating...' : 'Creating keys...'}
                  </>
                ) : (
                  <>
                    {isLogin ? 'Sign In' : 'Create Account'}
                    <Lock className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-400">
                {isLogin ? "Don't have an account?" : 'Already have an account?'}
                <button
                  onClick={toggleMode}
                  className="text-cipher-primary hover:text-cipher-secondary ml-1 font-medium"
                >
                  {isLogin ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>
          </SpotlightCard>

          {/* Security Note */}
          <SpotlightCard
            className="mt-6 rounded-xl border border-gray-700/30 bg-cipher-dark/30 backdrop-blur-sm p-4"
            spotlightColor="rgba(82, 39, 255, 0.15)"
          >
            <div className="flex items-start gap-3 text-sm text-gray-400">
              <Shield className="w-5 h-5 flex-shrink-0 text-cipher-primary" />
              <p>
                Your private keys are generated locally and never leave your device.
                We use end-to-end encryption so only you can read your messages.
              </p>
            </div>
          </SpotlightCard>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <SpotlightCard
      className="rounded-xl border border-gray-700/30 bg-cipher-dark/50 backdrop-blur-sm p-4"
      spotlightColor="rgba(0, 224, 184, 0.15)"
    >
      <div className="flex items-start gap-4">
        <IconWithBlur
          variation={0}
          shapeSize={1}
          roundness={0.5}
          borderSize={0.05}
          circleSize={0.25}
          circleEdge={1}
          size="md"
        >
          {icon}
        </IconWithBlur>
        <div>
          <h3 className="text-white font-medium">{title}</h3>
          <p className="text-gray-400 text-sm">{description}</p>
        </div>
      </div>
    </SpotlightCard>
  );
}
