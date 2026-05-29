import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

// Static Google Drive CDN thumbnail endpoint helper
const getThumbnailLink = (url, sizePx = 100) => {
  if (!url) return '';
  if (url.includes('drive.google.com/thumbnail') || url.includes('googleusercontent.com')) {
    if (url.includes('&sz=')) {
      return url.replace(/&sz=\w+/, `&sz=w${sizePx}-h${sizePx}`);
    }
    return `${url}&sz=w${sizePx}-h${sizePx}`;
  }
  const match = url.match(/\/d\/(.*?)\//);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w${sizePx}-h${sizePx}`;
  }
  if (url.match(/^[a-zA-Z0-9_-]{25,}$/)) {
    return `https://drive.google.com/thumbnail?id=${url}&sz=w${sizePx}-h${sizePx}`;
  }
  return url;
};

// Deterministic premium gradients for fallback initials
const getGradient = (id) => {
  if (!id) return 'linear-gradient(135deg, #6366f1, #a855f7)'; // indigo to purple
  const char = id.charAt(0).toLowerCase();
  if ('abcdef'.includes(char)) return 'linear-gradient(135deg, #ec4899, #f43f5e)'; // pink to rose
  if ('ghijkl'.includes(char)) return 'linear-gradient(135deg, #f59e0b, #ea580c)'; // amber to orange
  if ('mnopqr'.includes(char)) return 'linear-gradient(135deg, #10b981, #0d9488)'; // emerald to teal
  if ('stuvwx'.includes(char)) return 'linear-gradient(135deg, #3b82f6, #06b6d4)'; // blue to cyan
  return 'linear-gradient(135deg, #6366f1, #a855f7)'; // default indigo
};

export default function UserAvatar({ user, size = 'md', className = '', style = {}, onClick = null }) {
  const { user: currentUser, role: currentRole, setPreviewAvatarUrl } = useAppStore();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar_url]);

  // Size mappings (in pixels)
  const sizeMap = {
    xs: { px: 32, class: 'w-8 h-8 text-xs' },
    sm: { px: 40, class: 'w-10 h-10 text-sm' },
    md: { px: 48, class: 'w-12 h-12 text-base' },
    lg: { px: 64, class: 'w-16 h-16 text-lg' },
    xl: { px: 96, class: 'w-24 h-24 text-2xl' },
    '2xl': { px: 180, class: 'w-44 h-44 text-5xl' }
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  if (!user) return null;

  const isMe = currentUser?.id === user.id;
  const isPrivileged = ['admin', 'teacher', 'app_manager'].includes(currentRole);
  
  // Student Privacy Check: Hide avatar if toggled ON, and viewer is not privileged or owner
  const shouldHide = user.hide_avatar_from_class && !isMe && !isPrivileged;

  const nameToUse = user.name || user.username || 'U';
  const initial = nameToUse.charAt(0).toUpperCase();

  const handleAvatarClick = (e) => {
    if (onClick) {
      onClick(e);
      return;
    }
    
    // Default click handler: Open full-screen preview if image is visible
    if (user.avatar_url && !shouldHide && !imgError) {
      // Pass the high resolution URL to preview modal
      const highResUrl = getThumbnailLink(user.avatar_url, 800);
      setPreviewAvatarUrl(highResUrl);
    }
  };

  const hasImage = user.avatar_url && !shouldHide && !imgError;

  return (
    <div
      onClick={handleAvatarClick}
      className={`rounded-2xl border border-white/10 shrink-0 flex items-center justify-center font-black relative overflow-hidden transition-all duration-300 ${
        hasImage ? 'cursor-pointer hover:scale-105 active:scale-95 shadow-lg' : ''
      } ${currentSize.class} ${className}`}
      style={{
        background: hasImage ? 'rgba(255,255,255,0.05)' : getGradient(user.id),
        color: 'white',
        ...style
      }}
    >
      {hasImage ? (
        <img
          src={getThumbnailLink(user.avatar_url, currentSize.px)}
          alt={nameToUse}
          className="w-full h-full object-cover pointer-events-none"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="select-none tracking-tight">{initial}</span>
      )}
    </div>
  );
}
