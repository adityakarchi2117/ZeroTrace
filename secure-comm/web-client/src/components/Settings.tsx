'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';

const Settings = () => {
  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoDelete, setAutoDelete] = useState('none');
  const [theme, setTheme] = useState('dark');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        <div className="space-y-6">
          {/* Privacy & Security */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/>
              </svg>
              Privacy & Security
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Default Message Expiry
                </label>
                <select
                  value={autoDelete}
                  onChange={(e) => setAutoDelete(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Default message expiry"
                >
                  <option value="none">Never</option>
                  <option value="after_read">After read</option>
                  <option value="10s">10 seconds</option>
                  <option value="1m">1 minute</option>
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Messages will automatically delete after this time
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-100 font-medium">Read Receipts</p>
                  <p className="text-sm text-slate-400">Let others know when you've read their messages</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-100 font-medium">Typing Indicators</p>
                  <p className="text-sm text-slate-400">Show when you're typing to others</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
              Notifications
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-100 font-medium">Push Notifications</p>
                  <p className="text-sm text-slate-400">Receive notifications for new messages</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={notifications}
                    onChange={(e) => setNotifications(e.target.checked)}
                    aria-label="Push notifications"
                  />
                  <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-100 font-medium">Sound Notifications</p>
                  <p className="text-sm text-slate-400">Play sound when receiving messages</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    aria-label="Sound notifications"
                  />
                  <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"/>
              </svg>
              Appearance
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Theme
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Theme"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="auto">Auto</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Message Font Size
                </label>
                <select
                  defaultValue="medium"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Message font size"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>
          </div>

          {/* Advanced */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
              </svg>
              Advanced
            </h2>
            
            <div className="space-y-3">
              <button className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                <div>
                  <p className="text-slate-100 font-medium">Clear Message History</p>
                  <p className="text-sm text-slate-400">Delete all stored messages locally</p>
                </div>
              </button>
              
              <button className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                <div>
                  <p className="text-slate-100 font-medium">Reset Encryption Keys</p>
                  <p className="text-sm text-slate-400">Generate new encryption keys</p>
                </div>
              </button>
              
              <button className="w-full text-left px-4 py-3 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 rounded-lg transition-colors">
                <div>
                  <p className="text-red-400 font-medium">Delete Account</p>
                  <p className="text-sm text-red-400/70">Permanently delete your account and all data</p>
                </div>
              </button>
            </div>
          </div>

          {/* About */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">About ZeroTrace</h2>
            <div className="space-y-2 text-sm text-slate-400">
              <p>Version 1.0.0</p>
              <p>End-to-end encrypted messaging platform</p>
              <p>Built with privacy and security in mind</p>
              <div className="pt-2">
                <a href="#" className="text-blue-400 hover:text-blue-300">Privacy Policy</a>
                <span className="mx-2">•</span>
                <a href="#" className="text-blue-400 hover:text-blue-300">Terms of Service</a>
                <span className="mx-2">•</span>
                <a href="#" className="text-blue-400 hover:text-blue-300">Open Source</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;