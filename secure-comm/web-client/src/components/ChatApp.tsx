'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import Sidebar from './Sidebar';
import ChatView from './ChatView';
import NewChatModal from './NewChatModal';
import SettingsModal from './SettingsModal';
import { Lock, Menu, X } from 'lucide-react';

export default function ChatApp() {
  const { loadContacts, loadConversations, loadCallHistory, initializeWebSocket, currentConversation } = useStore();
  const [showSidebar, setShowSidebar] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadContacts();
    loadConversations();
    loadCallHistory();
    initializeWebSocket();
  }, [loadContacts, loadConversations, loadCallHistory, initializeWebSocket]);

  return (
    <div className="h-screen bg-cipher-darker flex overflow-hidden">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-cipher-dark rounded-lg text-gray-400 hover:text-white"
      >
        {showSidebar ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-40
        transform ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 transition-transform duration-200 ease-in-out
        w-80 bg-cipher-dark border-r border-gray-800
      `}>
        <Sidebar
          onNewChat={() => setShowNewChat(true)}
          onSettings={() => setShowSettings(true)}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {currentConversation ? (
          <ChatView />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Modals */}
      <NewChatModal isOpen={showNewChat} onClose={() => setShowNewChat(false)} />
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Mobile Overlay */}
      {showSidebar && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setShowSidebar(false)}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-cipher-primary/20 to-cipher-secondary/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-10 h-10 text-cipher-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Welcome to CipherLink</h2>
        <p className="text-gray-400 max-w-md">
          Select a conversation or start a new chat to begin sending end-to-end encrypted messages.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Lock className="w-4 h-4" />
          <span>All messages are encrypted on your device</span>
        </div>
      </div>
    </div>
  );
}
