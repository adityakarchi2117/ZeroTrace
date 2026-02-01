'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { Lock, Mail, User, Eye, EyeOff, Shield, Key, MessageSquare } from 'lucide-react';

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
    <div className="min-h-screen bg-cipher-darker flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-cipher-dark to-cipher-darker p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-xl flex items-center justify-center">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold gradient-text">ZeroTrace</span>
          </div>
          
          <h1 className="text-4xl font-bold text-white mb-4">
            Private by design.<br />
            <span className="text-cipher-primary">Secure by default.</span>
          </h1>
          
          <p className="text-gray-400 text-lg mb-12">
            End-to-end encrypted communication where only you and your recipient can read messages. 
            The server never sees your data.
          </p>

          {/* Features */}
          <div className="space-y-6">
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
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-xl flex items-center justify-center">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">ZeroTrace</span>
          </div>

          <div className="glass rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-2">
              {isLogin ? 'Welcome back' : 'Create account'}
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
          </div>

          {/* Security Note */}
          <div className="mt-6 flex items-start gap-3 text-sm text-gray-500">
            <Shield className="w-5 h-5 flex-shrink-0 text-cipher-primary" />
            <p>
              Your private keys are generated locally and never leave your device. 
              We use end-to-end encryption so only you can read your messages.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-10 h-10 bg-cipher-primary/20 rounded-lg flex items-center justify-center text-cipher-primary flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-white font-medium">{title}</h3>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
    </div>
  );
}
