import React from "react";
import { Profile } from "@/lib/profileTypes";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function resolveUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

interface Props {
  profile: Profile | null;
  /** If true, show minimal "as-seen-by-others" layout */
  compact?: boolean;
}

export default function ProfilePreview({ profile, compact }: Props) {
  if (!profile) return null;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 backdrop-blur overflow-hidden">
      {profile.banner_url && !compact && (
        <div className="h-28 w-full overflow-hidden">
          <img
            src={resolveUrl(profile.banner_url)}
            alt="banner"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-700 bg-gray-800 flex-shrink-0 -mt-2">
            {profile.avatar_url ? (
              <img
                src={resolveUrl(profile.avatar_url)}
                alt="avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-2xl">
                👤
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-white text-lg font-semibold truncate">
                {profile.display_name || profile.username}
                {profile.emoji_badge && (
                  <span className="ml-1">{profile.emoji_badge}</span>
                )}
              </p>
              {profile.verification_badges &&
                profile.verification_badges.length > 0 && (
                  <span className="text-green-400 text-sm" title="Verified">
                    ✓
                  </span>
                )}
            </div>
            <p className="text-gray-400 text-sm">@{profile.username}</p>
            {profile.pronouns && (
              <p className="text-gray-500 text-xs">{profile.pronouns}</p>
            )}
            {profile.status_message && (
              <p className="text-gray-300 text-sm mt-0.5">
                {profile.status_message}
              </p>
            )}
          </div>
          {profile.is_friend && (
            <span className="text-xs bg-green-500/10 text-green-300 px-2 py-1 rounded-full border border-green-500/20">
              Friend
            </span>
          )}
        </div>
        {profile.bio && (
          <p className="text-gray-300 text-sm mt-3 whitespace-pre-line">
            {profile.bio}
          </p>
        )}
        <div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-3">
          {profile.location_city && <span>📍 {profile.location_city}</span>}
          {profile.birthday && <span>🎂 {profile.birthday}</span>}
          {profile.website && (() => {
            try {
              const parsed = new URL(profile.website);
              if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return (
                  <a
                    href={parsed.href}
                    className="text-cyan-300 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    🔗 {parsed.hostname}
                  </a>
                );
              }
              return <span>🔗 {profile.website}</span>;
            } catch {
              return <span>🔗 {profile.website}</span>;
            }
          })()}
        </div>
        {profile.social_links &&
          Object.keys(profile.social_links).some(
            (k) => profile.social_links![k],
          ) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(profile.social_links).map(
                ([platform, url]) =>
                    url && (() => {
                      let safeHref: string | undefined;
                      try {
                        const parsed = new URL(url);
                        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                          safeHref = parsed.href;
                        }
                      } catch { /* invalid URL */ }
                      return safeHref ? (
                        <a
                          key={platform}
                          href={safeHref}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-gray-400 hover:text-cyan-300 bg-gray-800 px-2 py-1 rounded"
                        >
                          {platform}
                        </a>
                      ) : (
                        <span
                          key={platform}
                          className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded"
                        >
                          {platform}
                        </span>
                      );
                    })()
              )}
            </div>
          )}
        {!compact && profile.created_at && (
          <p className="text-xs text-gray-600 mt-3">
            Joined {new Date(profile.created_at).toLocaleDateString()}
            {profile.updated_at && (
              <span>
                {" "}
                · Updated {new Date(profile.updated_at).toLocaleDateString()}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
