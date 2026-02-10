'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useAppearance } from '@/lib/useAppearance';
import { MotionAvatar } from '@/components/motion';
import {
  Lock, Search, Plus, Settings, LogOut, MessageSquare,
  Shield, User as UserIcon, Loader2, UserPlus, X, Users,
  ShieldBan, RefreshCw, Volume2, VolumeX, Bell
} from 'lucide-react';
import { getSoundEnabled, setSoundEnabled, loadSoundSettings } from '@/lib/sound';
import { format, isToday, isYesterday } from 'date-fns';
import { friendApi } from '@/lib/friendApi';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNewChat: () => void;
  onSettings: () => void;
  onAddFriend: () => void;
  onPendingRequests: () => void;
  onBlockedUsers?: () => void;
  onProfile?: () => void;
}

interface SearchResult {
  id: number;
  username: string;
  public_key?: string;
  is_online?: boolean;
}

// Memoized conversation item to prevent unnecessary re-renders
const ConversationItem = React.memo(({
  conv,
  isActive,
  isOnline,
  collapsed,
  accentGradient,
  formatTime,
  onClick
}: {
  conv: any;
  isActive: boolean;
  isOnline: boolean;
  collapsed: boolean;
  accentGradient: string;
  formatTime: (date: string) => string;
  onClick: () => void;
}) => {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const avatarUrl = conv.avatar_url
    ? (conv.avatar_url.startsWith('http') ? conv.avatar_url : `${API_BASE}${conv.avatar_url}`)
    : null;
  const displayName = conv.display_name || conv.username;

  return (
    <button
      onClick={onClick}
      className={`
        w-full rounded-lg flex items-center transition-all duration-200
        ${collapsed
          ? `justify-center p-2 ${isActive ? 'bg-cipher-primary/30' : 'hover:bg-gray-800'}`
          : `p-3 gap-3 ${isActive
            ? 'bg-cipher-primary/20 border border-cipher-primary/30'
            : 'hover:bg-gray-800'}`}
      `}
      title={collapsed ? displayName : undefined}
    >
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className={`${collapsed ? 'w-10 h-10' : 'w-12 h-12'} rounded-full object-cover`}
          />
        ) : (
          <div
            className={`${collapsed ? 'w-10 h-10' : 'w-12 h-12'} rounded-full flex items-center justify-center transition-colors ${!isActive ? 'bg-gray-700' : ''}`}
            style={isActive ? { background: accentGradient } : undefined}
          >
            <span className={`text-white font-medium ${collapsed ? 'text-sm' : ''}`}>
              {conv.username.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {isOnline && (
          <div className={`absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full border-2 border-cipher-dark online-indicator ${collapsed ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
        )}
        {collapsed && conv.unread_count > 0 && (
          <span className="absolute -top-1 -right-1 bg-cipher-primary text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
            {conv.unread_count > 9 ? '9+' : conv.unread_count}
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between">
            <span className={`font-medium truncate ${isActive ? 'text-white' : 'text-gray-200'}`}>
              {displayName}
            </span>
            <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
              {formatTime(conv.last_message_time)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1 text-sm text-gray-400 truncate">
              <Shield className="w-3 h-3 text-cipher-primary flex-shrink-0" />
              <span className="truncate">
                {conv.last_message_preview || 'Start conversation'}
              </span>
            </div>
            {conv.unread_count > 0 && (
              <span className="bg-cipher-primary text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                {conv.unread_count}
              </span>
            )}
          </div>
        </div>
      )}
    </button>
  );
});

ConversationItem.displayName = 'ConversationItem';

export default function Sidebar({
  collapsed = false,
  onToggleCollapse,
  onNewChat,
  onSettings,
  onAddFriend,
  onPendingRequests,
  onBlockedUsers,
  onProfile,
}: SidebarProps) {
  const {
    user, conversations, currentConversation,
    setCurrentConversation, logout, onlineUsers,
    searchUsers, addContact, loadContacts, loadConversations, contacts,
    loadStoredAuth
  } = useStore();

  // Sound enabled state
  const [soundEnabled, setSoundEnabledState] = useState(() => {
    loadSoundSettings();
    return getSoundEnabled();
  });

  // Appearance settings
  const { getAccentGradient, settings } = useAppearance();
  const accentGradient = getAccentGradient();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [addingUser, setAddingUser] = useState<number | null>(null);

  // Badge state
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [isRefreshingContacts, setIsRefreshingContacts] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch pending request count
  const fetchPendingRequestCount = useCallback(async () => {
    try {
      const pending = await friendApi.getPendingRequests();
      setPendingRequestCount(pending.incoming?.length || 0);
    } catch (error) {
      console.error('Failed to fetch pending requests:', error);
    }
  }, []);

  // Refresh contacts from server
  const refreshContacts = useCallback(async () => {
    setIsRefreshingContacts(true);
    try {
      await loadContacts();
      await loadConversations();
      await fetchPendingRequestCount();
    } catch (error) {
      console.error('Failed to refresh contacts:', error);
    } finally {
      setIsRefreshingContacts(false);
    }
  }, [loadContacts, loadConversations, fetchPendingRequestCount]);

  // Listen for WebSocket events via window custom events
  useEffect(() => {
    const handleContactsSync = () => {
      console.log('Contacts sync event received');
      refreshContacts();
    };

    const handleFriendRequest = () => {
      fetchPendingRequestCount();
    };

    const handleContactRemoved = () => {
      refreshContacts();
    };

    const handleProfileUpdated = () => {
      console.log('Profile updated event received');
      loadConversations(); // Reload conversations to get updated avatars/names
      loadStoredAuth(); // Reload user to get updated avatar
    };

    // Listen for custom events dispatched from WebSocket handler
    window.addEventListener('contacts_sync', handleContactsSync);
    window.addEventListener('friend_request', handleFriendRequest);
    window.addEventListener('friend_accepted', handleFriendRequest);
    window.addEventListener('contact_removed', handleContactRemoved);
    window.addEventListener('blocked', handleContactRemoved);
    window.addEventListener('profile_updated', handleProfileUpdated);

    return () => {
      window.removeEventListener('contacts_sync', handleContactsSync);
      window.removeEventListener('friend_request', handleFriendRequest);
      window.removeEventListener('friend_accepted', handleFriendRequest);
      window.removeEventListener('contact_removed', handleContactRemoved);
      window.removeEventListener('blocked', handleContactRemoved);
      window.removeEventListener('profile_updated', handleProfileUpdated);
    };
  }, [refreshContacts, fetchPendingRequestCount, loadConversations, loadStoredAuth]);


  // Initial fetch of pending requests
  useEffect(() => {
    fetchPendingRequestCount();

    // Poll for counts every 30 seconds
    const interval = setInterval(() => {
      fetchPendingRequestCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingRequestCount]);

  // Filter existing conversations based on search query - memoized
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(conv =>
      conv.username.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  // Memoize online status lookup
  const isUserOnline = useCallback((userId: number) => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  // Toggle sound
  const toggleSound = useCallback(() => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    setSoundEnabledState(newValue);
  }, [soundEnabled]);

  // Search for users globally when typing (debounced)
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (value.trim().length >= 2) {
      setShowGlobalSearch(true);
      searchTimerRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const results = await searchUsers(value.trim());
          const filtered = results.filter(r =>
            r.username !== user?.username
          );
          setSearchResults(filtered);
        } catch (error) {
          console.error('Search failed:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    } else {
      setSearchResults([]);
      setShowGlobalSearch(false);
    }
  };

  // Start chat with a user from search results
  const handleStartChat = async (searchUser: SearchResult) => {
    setAddingUser(searchUser.id);
    try {
      // Check if conversation already exists
      const existingConv = conversations.find(c => c.username === searchUser.username);

      if (existingConv) {
        setCurrentConversation(searchUser.username);
      } else {
        // Check if already a contact
        const existingContact = contacts.find(c => c.contact_username === searchUser.username);
        if (!existingContact) {
          await addContact(searchUser.username);
          await loadContacts();
        }
        await loadConversations();
        setCurrentConversation(searchUser.username);
      }

      // Clear search
      setSearchQuery('');
      setSearchResults([]);
      setShowGlobalSearch(false);
    } catch (error) {
      console.error('Failed to start chat:', error);
    } finally {
      setAddingUser(null);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowGlobalSearch(false);
  };

  const formatTime = useCallback((dateString: string | null | undefined) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return 'Yesterday';
    }
    return format(date, 'dd/MM');
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className={`p-4 border-b border-gray-800 ${collapsed ? 'p-2' : ''}`}
      >
        {/* Header Row */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} mb-3`}>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: accentGradient }}
            >
              <Lock className="w-4 h-4 text-white" />
            </div>
            {!collapsed && <span className="font-bold text-white dark:text-white">ZeroTrace</span>}
          </div>
          {!collapsed && (
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSound}
                className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              >
                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <button
                onClick={onPendingRequests}
                className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors relative"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {pendingRequestCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                  </span>
                )}
              </button>
              <button
                onClick={onSettings}
                className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className={`${collapsed ? 'flex flex-col gap-2' : 'flex items-center justify-between'} bg-gray-800/30 rounded-lg p-1 mb-3`}>
          <button
            onClick={onAddFriend}
            className={`${collapsed ? 'p-3' : 'flex-1 p-2'} flex flex-col items-center gap-1 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-green-400 transition-colors`}
            title="Add Friend"
          >
            <UserPlus className="w-4 h-4" />
            {!collapsed && <span className="text-[10px]">Add</span>}
          </button>

          <button
            onClick={onPendingRequests}
            className={`${collapsed ? 'p-3' : 'flex-1 p-2'} flex flex-col items-center gap-1 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-yellow-400 transition-colors relative`}
            title="Pending Requests"
          >
            <div className="relative">
              <Users className="w-4 h-4" />
              {pendingRequestCount > 0 && (
                <span
                  className={`absolute -top-2 -right-2 w-4 h-4 bg-yellow-500 text-black text-[9px] rounded-full flex items-center justify-center font-bold ${collapsed ? 'w-3 h-3 text-[8px]' : ''}`}
                >
                  {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                </span>
              )}
            </div>
            {!collapsed && <span className="text-[10px]">Requests</span>}
          </button>

          {!collapsed && onBlockedUsers && (
            <button
              onClick={onBlockedUsers}
              className="flex-1 flex flex-col items-center gap-1 p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
              title="Blocked Users"
            >
              <ShieldBan className="w-4 h-4" />
              <span className="text-[10px]">Blocked</span>
            </button>
          )}

          <button
            onClick={onNewChat}
            className={`${collapsed ? 'p-3' : 'flex-1 p-2'} flex flex-col items-center gap-1 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-cyan-400 transition-colors`}
            title="New Chat"
          >
            <Plus className="w-4 h-4" />
            {!collapsed && <span className="text-[10px]">New</span>}
          </button>

          {!collapsed && (
            <button
              onClick={refreshContacts}
              disabled={isRefreshingContacts}
              className="flex-1 flex flex-col items-center gap-1 p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingContacts ? 'animate-spin' : ''}`} />
              <span className="text-[10px]">Refresh</span>
            </button>
          )}
        </div>

        {/* User Info */}

        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} p-2 bg-cipher-darker/50 dark:bg-gray-800/50 rounded-lg`}>
          <MotionAvatar
            name={user?.display_name || user?.username || 'U'}
            src={user?.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${user.avatar_url}`) : undefined}
            size={collapsed ? 'sm' : 'md'}
            disableTilt
          />
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{user?.username}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <div className="flex gap-1">
                {onProfile && (
                  <button
                    onClick={onProfile}
                    className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-400 transition-colors"
                    title="Profile"
                  >
                    <UserIcon className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={logout}
                  className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Search - Hidden when collapsed */}
      {!collapsed && (
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search users or conversations..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-cipher-darker border border-gray-700 rounded-lg py-2 pl-10 pr-10 text-sm text-white placeholder-gray-500 focus:border-cipher-primary transition-colors"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cipher-primary animate-spin" />
            )}
          </div>

          {/* Global Search Results */}
          {showGlobalSearch && searchResults.length > 0 && (
            <div className="mt-2 bg-cipher-darker border border-gray-700 rounded-lg overflow-hidden animate-fade-in">
              <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/50">
                <p className="text-xs text-gray-400 font-medium">Users Found</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {searchResults.map((result) => {
                  const existingConv = conversations.find(c => c.username === result.username);
                  const isAdding = addingUser === result.id;

                  return (
                    <button
                      key={result.id}
                      onClick={() => handleStartChat(result)}
                      disabled={isAdding}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
                    >
                      <div className="relative">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center"
                          style={{ background: accentGradient }}
                        >
                          <span className="text-white font-medium text-sm">
                            {result.username[0].toUpperCase()}
                          </span>
                        </div>
                        {result.is_online && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-cipher-darker" />
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-white font-medium truncate text-sm">{result.username}</p>
                        <p className="text-xs text-gray-500">
                          {existingConv ? 'Open chat' : 'Start new chat'}
                        </p>
                      </div>
                      {isAdding ? (
                        <Loader2 className="w-5 h-5 text-cipher-primary animate-spin" />
                      ) : existingConv ? (
                        <MessageSquare className="w-5 h-5 text-cipher-primary" />
                      ) : (
                        <UserPlus className="w-5 h-5 text-green-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* No results message */}
          {showGlobalSearch && !isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="mt-2 p-4 bg-cipher-darker border border-gray-700 rounded-lg text-center animate-fade-in">
              <p className="text-sm text-gray-400">No users found for &quot;{searchQuery}&quot;</p>
              <button
                onClick={onNewChat}
                className="mt-2 text-xs text-cipher-primary hover:underline"
              >
                Try advanced search
              </button>
            </div>
          )}
        </div>
      )}

      {/* Conversations List - Optimized with memoization */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 && conversations.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-gray-400 text-sm">No conversations yet</p>
            <button
              onClick={onNewChat}
              className="mt-3 text-cipher-primary hover:text-cipher-secondary text-sm font-medium"
            >
              Start a new chat
            </button>
          </div>
        ) : filteredConversations.length === 0 && searchQuery ? (
          <div className="p-4 text-center">
            <p className="text-gray-400 text-sm">No conversations match &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <div className={`space-y-1 ${collapsed ? 'p-1' : 'p-2'}`}>
            {filteredConversations.map((conv) => (
              <ConversationItem
                key={conv.username || `user-${conv.user_id}`}
                conv={conv}
                isActive={currentConversation === conv.username}
                isOnline={isUserOnline(conv.user_id)}
                collapsed={collapsed}
                accentGradient={accentGradient}
                formatTime={formatTime}
                onClick={() => setCurrentConversation(conv.username)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`p-4 border-t border-gray-800 ${collapsed ? 'p-2' : ''}`}>
        {collapsed ? (
          <div className="flex justify-center">
            <Lock className="w-4 h-4 text-cipher-primary" />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Lock className="w-3 h-3 text-cipher-primary" />
            <span>End-to-end encrypted</span>
          </div>
        )}
      </div>
    </div>
  );
}
