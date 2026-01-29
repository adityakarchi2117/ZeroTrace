'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';

const UserProfile = () => {
  const { user, logout } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.username || '');

  const handleSave = () => {
    // TODO: Implement profile update
    setIsEditing(false);
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        {/* Profile Header */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">
            {user?.username || 'Unknown User'}
          </h1>
          <p className="text-slate-400">
            Member since {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Profile Information */}
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Profile Information</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Username
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-slate-100">{user?.username}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email
                </label>
                <p className="text-slate-100">{user?.email || 'Not provided'}</p>
              </div>
            </div>

            <div className="mt-6 flex space-x-3">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-slate-600 text-slate-100 rounded-lg hover:bg-slate-500 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-slate-600 text-slate-100 rounded-lg hover:bg-slate-500 transition-colors"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>

          {/* Security Information */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Security</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-100 font-medium">Identity Key</p>
                  <p className="text-sm text-slate-400">Your cryptographic identity</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 font-mono">
                    {user?.public_key ? `${user.public_key.slice(0, 8)}...${user.public_key.slice(-8)}` : 'Not available'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-100 font-medium">End-to-End Encryption</p>
                  <p className="text-sm text-slate-400">All messages are encrypted</p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-sm text-green-400">Active</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-100 font-medium">Perfect Forward Secrecy</p>
                  <p className="text-sm text-slate-400">Keys rotate automatically</p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-sm text-green-400">Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Account Actions</h2>

            <div className="space-y-3">
              <button className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                <div>
                  <p className="text-slate-100 font-medium">Export Keys</p>
                  <p className="text-sm text-slate-400">Backup your encryption keys</p>
                </div>
              </button>

              <button className="w-full text-left px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                <div>
                  <p className="text-slate-100 font-medium">Change Password</p>
                  <p className="text-sm text-slate-400">Update your account password</p>
                </div>
              </button>

              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 rounded-lg transition-colors"
              >
                <div>
                  <p className="text-red-400 font-medium">Sign Out</p>
                  <p className="text-sm text-red-400/70">Sign out of your account</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;