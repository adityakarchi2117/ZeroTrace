'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useAppearance } from '@/lib/useAppearance';
import { 
  Lock, Search, Plus, Settings, LogOut, MessageSquare, 
  Shield, User as UserIcon, Loader2, UserPlus, X
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

interface SidebarProps {
  onNewChat: () => void;
  onSettings: () => void;
}

interface SearchResult {
  id: number;
  username: string;
  public_key?: string;
  is_online?: boolean;
}

export default function Sidebar({ onNewChat, onSettings }: SidebarProps) {
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
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: accentGradient }}
            >
              <Lock className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white dark:text-white">CipherLink</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNewChat}
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="New Chat"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              onClick={onSettings}
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* User Info */}
        <div className="flex items-center gap-3 p-2 bg-cipher-darker/50 dark:bg-gray-800/50 rounded-lg">
          <div className="relative">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: accentGradient }}
            >
              <UserIcon className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-cipher-dark" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate">{user?.username}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
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
          <div className="mt-2 bg-cipher-darker border border-gray-700 rounded-lg overflow-hidden">
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
          <div className="mt-2 p-4 bg-cipher-darker border border-gray-700 rounded-lg text-center">
            <p className="text-sm text-gray-400">No users found for "{searchQuery}"</p>
            <button
              onClick={onNewChat}
              className="mt-2 text-xs text-cipher-primary hover:underline"
            >
              Try advanced search
            </button>
          </div>
        )}
      </div>

      {/* Conversations List */}
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
            <p className="text-gray-400 text-sm">No conversations match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredConversations.map((conv) => {
              const isActive = currentConversation === conv.username;
              const isOnline = onlineUsers.has(conv.user_id);
              
              return (
                <button
                  key={conv.user_id}
                  onClick={() => setCurrentConversation(conv.username)}
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
                        <span className="bg-cipher-primary text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Lock className="w-3 h-3 text-cipher-primary" />
          <span>End-to-end encrypted</span>
        </div>
      </div>
    </div>
  );
}
