'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { ParticleField } from '@/lib/motion';
import { useAppearance, getWallpaperCSSValue } from '@/lib/useAppearance';
import Sidebar from './Sidebar';
import ChatView from './ChatView';
import NewChatModal from './NewChatModal';
import SettingsModal from './SettingsModal';
import AddFriendPanel from './AddFriendPanel';
import PendingRequestsPanel from './PendingRequestsPanel';
import BlockedUsersPanel from './BlockedUsersPanel';
import NotificationToast, { useNotificationToasts } from './NotificationToast';
import { Lock, Menu, X, PanelLeftOpen, PanelLeftClose } from 'lucide-react';

export default function ChatApp() {
  const { loadContacts, loadConversations, loadCallHistory, initializeWebSocket, currentConversation, publicKey } = useStore();
  const { settings } = useAppearance();
  const { wallpaper } = settings;
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showPendingRequests, setShowPendingRequests] = useState(false);
  const [showBlockedUsers, setShowBlockedUsers] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Notification toast system
  const { notifications, dismissNotification, showSuccess, showError } = useNotificationToasts();

  useEffect(() => {
    loadContacts();
    loadConversations();
    loadCallHistory();
    initializeWebSocket();

    // Detect mobile
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [loadContacts, loadConversations, loadCallHistory, initializeWebSocket]);

  // On mobile, sidebar is completely hidden when closed
  // On desktop, sidebar can be collapsed (narrow) or expanded
  const sidebarWidth = isMobile ? 320 : (sidebarCollapsed ? 80 : 320);

  return (
    <div className="h-screen bg-cipher-darker flex overflow-hidden relative">
      {/* Background particles for premium feel */}
      <ParticleField density="low" className="opacity-30" />

      {/* Mobile Menu Button */}
      <motion.button
        onClick={() => setShowSidebar(!showSidebar)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-cipher-dark rounded-lg text-gray-400 hover:text-white"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        {showSidebar ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </motion.button>

      {/* Desktop Sidebar Toggle - Shows when sidebar is open */}
      <AnimatePresence>
        {showSidebar && !isMobile && (
          <motion.button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:flex fixed top-1/2 -translate-y-1/2 z-50 p-2 bg-cipher-dark border border-gray-700 rounded-r-lg text-gray-400 hover:text-white shadow-lg"
            style={{ left: sidebarWidth - 1 }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            whileHover={{ scale: 1.1, x: 2 }}
            whileTap={{ scale: 0.95 }}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Sidebar with 3D effect */}
      <motion.div
        className={`
          fixed lg:relative inset-y-0 left-0 z-40
          bg-cipher-dark border-r border-gray-800
          transform ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
        initial={false}
        animate={{
          x: showSidebar ? 0 : -320,
          width: sidebarWidth,
          rotateY: showSidebar && !isMobile ? 0 : 5,
          scale: showSidebar ? 1 : 0.95,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
        style={{
          transformStyle: 'preserve-3d',
          perspective: 1200,
          transformOrigin: 'left center',
        }}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onNewChat={() => setShowNewChat(true)}
          onSettings={() => setShowSettings(true)}
          onAddFriend={() => setShowAddFriend(true)}
          onPendingRequests={() => setShowPendingRequests(true)}
          onBlockedUsers={() => setShowBlockedUsers(true)}
        />
      </motion.div>

      {/* Main Chat Area with 3D transition */}
      <div 
        className="flex-1 flex flex-col relative"
        style={{
          backgroundImage: wallpaper.enabled ? getWallpaperCSSValue(wallpaper) : undefined,
          backgroundSize: wallpaper.enabled && (wallpaper.type === 'custom' || wallpaper.type === 'url') ? 'cover' : 'initial',
          backgroundPosition: 'center',
          backgroundRepeat: wallpaper.enabled && (wallpaper.type === 'custom' || wallpaper.type === 'url') ? 'no-repeat' : 'initial',
        }}
      >
        {/* Wallpaper overlay for opacity/blur */}
        {wallpaper.enabled && (
          <div 
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              backdropFilter: `blur(${wallpaper.blur}px)`,
              opacity: wallpaper.opacity / 100,
            }}
          />
        )}
        
        <AnimatePresence mode="wait">
          {currentConversation ? (
            <motion.div
              key="chat"
              className="flex-1 flex flex-col h-full relative z-10"
              initial={{ 
                x: 50, 
                opacity: 0,
                rotateY: -10,
              }}
              animate={{ 
                x: 0, 
                opacity: 1,
                rotateY: 0,
              }}
              exit={{ 
                x: -30, 
                opacity: 0,
                rotateY: 10,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 30,
              }}
              style={{
                transformStyle: 'preserve-3d',
                perspective: 1200,
              }}
            >
              <ChatView />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="flex-1 flex items-center justify-center relative z-10"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <EmptyState />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <NewChatModal isOpen={showNewChat} onClose={() => setShowNewChat(false)} />
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <AddFriendPanel 
        isOpen={showAddFriend} 
        onClose={() => setShowAddFriend(false)} 
        currentUserPublicKey={publicKey || ''}
        onRequestSent={() => {
          // Optionally refresh something after request sent
        }}
      />
      <PendingRequestsPanel 
        isOpen={showPendingRequests} 
        onClose={() => setShowPendingRequests(false)} 
        currentUserPublicKey={publicKey || ''}
        onRequestAccepted={() => {
          // Reload contacts after accepting a friend
          loadContacts();
          loadConversations();
        }}
        onRequestRejected={() => {
          // Optionally refresh something
        }}
      />
      <BlockedUsersPanel
        isOpen={showBlockedUsers}
        onClose={() => setShowBlockedUsers(false)}
      />

      {/* Mobile Overlay */}
      <AnimatePresence>
        {showSidebar && isMobile && (
          <motion.div
            className="lg:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSidebar(false)}
          />
        )}
      </AnimatePresence>

      {/* Notification Toast Container */}
      <NotificationToast
        notifications={notifications}
        onDismiss={dismissNotification}
        position="top-right"
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center">
      <motion.div
        className="w-20 h-20 bg-gradient-to-br from-cipher-primary/20 to-cipher-secondary/20 rounded-full flex items-center justify-center mx-auto mb-6"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: 'spring',
          stiffness: 200,
          damping: 15,
          delay: 0.2,
        }}
      >
        <Lock className="w-10 h-10 text-cipher-primary" />
      </motion.div>
      
      <motion.h2
        className="text-2xl font-bold text-white mb-2"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Welcome to ZeroTrace
      </motion.h2>
      
      <motion.p
        className="text-gray-400 max-w-md"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        Select a conversation or start a new chat to begin sending end-to-end encrypted messages.
      </motion.p>
      
      <motion.div
        className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Lock className="w-4 h-4" />
        <span>All messages are encrypted on your device</span>
      </motion.div>
    </div>
  );
}
