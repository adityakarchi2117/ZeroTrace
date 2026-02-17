"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MapPin,
  Calendar,
  Globe,
  Link2,
  Shield,
} from "lucide-react";
import profileApi from "@/lib/profileApi";
import { Profile } from "@/lib/profileTypes";
import { useAppearance } from "@/lib/useAppearance";
import ProfileCard from "./ProfileCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function resolveUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

interface ContactProfilePopupProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  userId?: number;
  isOnline?: boolean;
  publicKey?: string;
}

export default function ContactProfilePopup({
  isOpen,
  onClose,
  username,
  userId,
  isOnline,
  publicKey,
}: ContactProfilePopupProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getAccentGradient } = useAppearance();
  const accentGradient = getAccentGradient();

  useEffect(() => {
    if (isOpen && userId) {
      setLoading(true);
      setError(null);
      profileApi
        .getProfile(userId)
        .then((p) => setProfile(p))
        .catch((err) => {
          console.warn("Could not load contact profile:", err);
          setError("Could not load full profile details.");
          setProfile({
            user_id: userId,
            username,
          });
        })
        .finally(() => setLoading(false));
    }
    if (!isOpen) {
      setProfile(null);
      setError(null);
    }
  }, [isOpen, userId, username]);

  const displayName = profile?.display_name || username;
  const avatarSrc = resolveUrl(profile?.avatar_url);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <div className="fixed inset-0 z-[101] flex items-center justify-center p-3 sm:p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-[620px] max-w-[94vw] max-h-[90vh] overflow-hidden rounded-2xl border border-gray-700 bg-cipher-dark/95 backdrop-blur-xl shadow-2xl"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
            >
              <div className="relative h-14 overflow-hidden border-b border-gray-700/70">
              <div className="w-full h-full" style={{ background: accentGradient }} />
              <motion.button
                onClick={onClose}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 rounded-full text-white/80 hover:text-white"
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

              <div className="px-4 pb-5 pt-4 overflow-y-auto max-h-[calc(90vh-56px)]">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-cipher-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="flex justify-center items-center">
                      <ProfileCard
                        name={displayName}
                        title={profile?.status_message || profile?.pronouns || "Secure Contact"}
                        handle={username}
                        status={isOnline ? "Online" : "Offline"}
                        contactText="Message"
                        avatarUrl={avatarSrc}
                      miniAvatarUrl={avatarSrc}
                      showUserInfo
                      enableTilt={true}
                      enableMobileTilt={false}
                        onContactClick={onClose}
                        behindGlowColor="rgba(125, 190, 255, 0.67)"
                        behindGlowEnabled
                        innerGradient="linear-gradient(145deg,#60496e8c 0%,#71C4FF44 100%)"
                      />
                    </div>

                  <div className="mt-4 flex items-center justify-center gap-2 flex-wrap text-center">
                    {profile?.emoji_badge && <span className="text-lg">{profile.emoji_badge}</span>}
                    {profile?.verification_badges && profile.verification_badges.length > 0 && (
                      <span className="text-green-400 text-sm" title="Verified">?</span>
                    )}
                    {profile?.is_friend && (
                      <span className="text-xs bg-green-500/10 text-green-300 px-2 py-0.5 rounded-full border border-green-500/20">
                        Friend
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-600"}`} />
                    <span className={`text-xs ${isOnline ? "text-green-400" : "text-gray-500"}`}>
                      {isOnline ? "Online" : "Offline"}
                    </span>
                  </div>

                  {error && (
                    <div className="mt-3 px-3 py-2 bg-yellow-900/20 rounded-lg border border-yellow-700/40">
                      <p className="text-xs text-yellow-300">{error}</p>
                    </div>
                  )}

                  {profile?.status_message && (
                    <div className="mt-3 px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700/50">
                      <p className="text-sm text-gray-300 italic">&quot;{profile.status_message}&quot;</p>
                    </div>
                  )}

                  {profile?.bio && (
                    <p className="text-sm text-gray-300 mt-3 whitespace-pre-line leading-relaxed">{profile.bio}</p>
                  )}

                  {(profile?.location_city || profile?.birthday || profile?.website) && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-400">
                      {profile.location_city && (
                        <span className="flex items-center gap-1 bg-gray-800/60 px-2 py-1 rounded-md">
                          <MapPin className="w-3 h-3" /> {profile.location_city}
                        </span>
                      )}
                      {profile.birthday && (
                        <span className="flex items-center gap-1 bg-gray-800/60 px-2 py-1 rounded-md">
                          <Calendar className="w-3 h-3" /> {profile.birthday}
                        </span>
                      )}
                      {profile.website && (() => {
                        let href: string | undefined;
                        let display: string;
                        try {
                          const parsed = new URL(profile.website);
                          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                            href = parsed.href;
                            display = parsed.hostname;
                          } else {
                            display = profile.website;
                          }
                        } catch {
                          display = profile.website;
                        }
                        return href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 bg-gray-800/60 px-2 py-1 rounded-md text-cyan-400 hover:text-cyan-300"
                          >
                            <Globe className="w-3 h-3" />
                            {display}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 bg-gray-800/60 px-2 py-1 rounded-md">
                            <Globe className="w-3 h-3" />
                            {display}
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  {profile?.social_links && Object.values(profile.social_links).some(Boolean) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(profile.social_links).map(
                        ([platform, url]) =>
                          url && (
                            <a
                              key={platform}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-gray-400 hover:text-cyan-300 bg-gray-800/60 px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors"
                            >
                              <Link2 className="w-3 h-3" />
                              {platform}
                            </a>
                          ),
                      )}
                    </div>
                  )}

                  <div className="mt-4 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50 space-y-2">
                    <div className="flex items-center gap-2 text-cipher-primary">
                      <Shield className="w-4 h-4" />
                      <span className="text-sm font-medium">End-to-End Encrypted</span>
                    </div>
                    <p className="text-xs text-gray-500">Messages are secured with X25519 + AES-256-GCM encryption.</p>
                    {publicKey && (
                      <p className="text-[11px] text-gray-600 break-all">Key: {publicKey.slice(0, 24)}...</p>
                    )}
                  </div>

                  {profile?.created_at && (
                    <p className="text-xs text-gray-600 mt-3">Joined {new Date(profile.created_at).toLocaleDateString()}</p>
                  )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
