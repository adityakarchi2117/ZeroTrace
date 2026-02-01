'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { useAppearance } from '@/lib/useAppearance';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionAvatar, TiltCard } from '@/components/motion';
import { motionVariants } from '@/lib/motion/config';
import { 
  Lock, Search, Plus, Settings, LogOut, MessageSquare, 
  Shield, User as UserIcon, Loader2, UserPlus, X, Users,
  ShieldBan, RefreshCw
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { friendApi } from '@/lib/friendApi';

interface SidebarProps {
  onNewChat: () => void;
  onSettings: () => void;
  onAddFriend: () => void;
  onPendingRequests: () => void;
  onBlockedUsers?: () => void;
}

interface SearchResult {
  id: number;
  username: string;
  public_key?: string;
  is_online?: boolean;
}

export default function Sidebar({ 
  onNewChat, 
  onSettings, 
  onAddFriend, 
  onPendingRequests,
  onBlockedUsers 
}: SidebarProps) {
  const { 
    user, conversations, currentConversation, 
    setCurrentConversation, logout, onlineUsers,
    searchUsers, addContact, loadContacts, loadConversations, contacts
  } = useStore();

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

    // Listen for custom events dispatched from WebSocket handler
    window.addEventListener('contacts_sync', handleContactsSync);
    window.addEventListener('friend_request', handleFriendRequest);
    window.addEventListener('friend_accepted', handleFriendRequest);
    window.addEventListener('contact_removed', handleContactRemoved);
    window.addEventListener('blocked', handleContactRemoved);

    return () => {
      window.removeEventListener('contacts_sync', handleContactsSync);
      window.removeEventListener('friend_request', handleFriendRequest);
      window.removeEventListener('friend_accepted', handleFriendRequest);
      window.removeEventListener('contact_removed', handleContactRemoved);
      window.removeEventListener('blocked', handleContactRemoved);
    };
  }, [refreshContacts, fetchPendingRequestCount]);

  // Initial fetch of pending requests
  useEffect(() => {
    fetchPendingRequestCount();
    
    // Poll for counts every 30 seconds
    const interval = setInterval(() => {
      fetchPendingRequestCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingRequestCount]);

  // Filter existing conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(conv => 
      conv.username.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  // Search for users globally when typing
  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    
    if (value.trim().length >= 2) {
      setIsSearching(true);
      setShowGlobalSearch(true);
      try {
        const results = await searchUsers(value.trim());
        // Filter out current user and already existing conversations
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

  const formatTime = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return 'Yesterday';
    }
    return format(date, 'dd/MM');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <motion.div 
        className="p-4 border-b border-gray-800"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <motion.div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: accentGradient }}
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
            >
              <Lock className="w-4 h-4 text-white" />
            </motion.div>
            <span className="font-bold text-white dark:text-white">ZeroTrace</span>
          </div>
          <div className="flex items-center gap-1">
            <motion.button
              onClick={onSettings}
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Settings"
              whileHover={{ scale: 1.1, rotate: 30 }}
              whileTap={{ scale: 0.9 }}
            >
              <Settings className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-between bg-gray-800/30 rounded-lg p-1 mb-3">
          <motion.button
            onClick={onAddFriend}
            className="flex-1 flex flex-col items-center gap-1 p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-green-400 transition-colors"
            title="Add Friend"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <UserPlus className="w-4 h-4" />
            <span className="text-[10px]">Add</span>
          </motion.button>
          
          <motion.button
            onClick={onPendingRequests}
            className="flex-1 flex flex-col items-center gap-1 p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-yellow-400 transition-colors relative"
            title="Pending Requests"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="relative">
              <Users className="w-4 h-4" />
              {pendingRequestCount > 0 && (
                <motion.span
                  className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-500 text-black text-[9px] rounded-full flex items-center justify-center font-bold"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                >
                  {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                </motion.span>
              )}
            </div>
            <span className="text-[10px]">Requests</span>
          </motion.button>
          
          {onBlockedUsers && (
            <motion.button
              onClick={onBlockedUsers}
              className="flex-1 flex flex-col items-center gap-1 p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
              title="Blocked Users"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <ShieldBan className="w-4 h-4" />
              <span className="text-[10px]">Blocked</span>
            </motion.button>
          )}
          
          <motion.button
            onClick={onNewChat}
            className="flex-1 flex flex-col items-center gap-1 p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-cyan-400 transition-colors"
            title="New Chat"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus className="w-4 h-4" />
            <span className="text-[10px]">New</span>
          </motion.button>
          
          <motion.button
            onClick={refreshContacts}
            disabled={isRefreshingContacts}
            className="flex-1 flex flex-col items-center gap-1 p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
            title="Refresh"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshingContacts ? 'animate-spin' : ''}`} />
            <span className="text-[10px]">Refresh</span>
          </motion.button>
        </div>

        {/* User Info with Tilt Avatar */}
        <div className="flex items-center gap-3 p-2 bg-cipher-darker/50 dark:bg-gray-800/50 rounded-lg">
          <MotionAvatar name={user?.username || 'U'} size="md" disableTilt />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate">{user?.username}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <motion.button
            onClick={logout}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
            title="Logout"
            whileHover={{ scale: 1.1, x: 2 }}
            whileTap={{ scale: 0.9 }}
          >
            <LogOut className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div 
        className="p-4"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
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
            <motion.button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              whileHover={{ scale: 1.2, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-4 h-4" />
            </motion.button>
          )}
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cipher-primary animate-spin" />
          )}
        </div>

        {/* Global Search Results */}
        <AnimatePresence>
          {showGlobalSearch && searchResults.length > 0 && (
            <motion.div 
              className="mt-2 bg-cipher-darker border border-gray-700 rounded-lg overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/50">
                <p className="text-xs text-gray-400 font-medium">Users Found</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {searchResults.map((result, index) => {
                  const existingConv = conversations.find(c => c.username === result.username);
                  const isAdding = addingUser === result.id;
                  
                  return (
                    <motion.button
                      key={result.id}
                      onClick={() => handleStartChat(result)}
                      disabled={isAdding}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors border-b border-gray-700/50 last:border-0"
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.05)' }}
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
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No results message */}
        <AnimatePresence>
          {showGlobalSearch && !isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <motion.div 
              className="mt-2 p-4 bg-cipher-darker border border-gray-700 rounded-lg text-center"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <p className="text-sm text-gray-400">No users found for &quot;{searchQuery}&quot;</p>
              <button
                onClick={onNewChat}
                className="mt-2 text-xs text-cipher-primary hover:underline"
              >
                Try advanced search
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Conversations List with Stagger Animation */}
      <motion.div 
        className="flex-1 overflow-y-auto"
        variants={motionVariants.stagger}
        initial="hidden"
        animate="visible"
      >
        {filteredConversations.length === 0 && conversations.length === 0 ? (
          <motion.div 
            className="p-8 text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-gray-400 text-sm">No conversations yet</p>
            <motion.button
              onClick={onNewChat}
              className="mt-3 text-cipher-primary hover:text-cipher-secondary text-sm font-medium"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Start a new chat
            </motion.button>
          </motion.div>
        ) : filteredConversations.length === 0 && searchQuery ? (
          <div className="p-4 text-center">
            <p className="text-gray-400 text-sm">No conversations match &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredConversations.map((conv, index) => {
              const isActive = currentConversation === conv.username;
              const isOnline = onlineUsers.has(conv.user_id);
              
              return (
                <motion.button
                  key={conv.user_id}
                  onClick={() => setCurrentConversation(conv.username)}
                  variants={motionVariants.listItem}
                  whileHover={{ 
                    x: 4,
                    backgroundColor: isActive ? undefined : 'rgba(255,255,255,0.05)',
                  }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    w-full p-3 rounded-lg flex items-center gap-3 transition-colors
                    ${isActive 
                      ? 'bg-cipher-primary/20 border border-cipher-primary/30' 
                      : 'hover:bg-gray-800'}
                  `}
                >
                  <div className="relative flex-shrink-0">
                    <div 
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${!isActive ? 'bg-gray-700' : ''}`}
                      style={isActive ? { background: accentGradient } : undefined}
                    >
                      <span className="text-white font-medium">
                        {conv.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {isOnline && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-cipher-dark online-indicator" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium truncate ${isActive ? 'text-white' : 'text-gray-200'}`}>
                        {conv.username}
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
                        <motion.span 
                          className="bg-cipher-primary text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                        >
                          {conv.unread_count}
                        </motion.span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Footer */}
      <motion.div 
        className="p-4 border-t border-gray-800"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Lock className="w-3 h-3 text-cipher-primary" />
          <span>End-to-end encrypted</span>
        </div>
      </motion.div>
    </div>
  );
}
