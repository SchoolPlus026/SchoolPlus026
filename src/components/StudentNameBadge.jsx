/**
 * StudentNameBadge.jsx
 * Wrapper component to display a student's name alongside their pinned badges.
 * Reads instantly from the school-wide badge cache.
 */
import React from 'react';
import { useSchoolBadgeCache } from '../hooks/useAchievements';
import { LucideBadgeIcon } from './LucideBadgeIcon';
import { useAppStore } from '../store/useAppStore';

export default function StudentNameBadge({ studentId, name, className, style, showClassStars = false }) {
  const { schoolSettings } = useAppStore();
  const schoolId = schoolSettings?.school_id;
  
  // This hook relies on React Query's cache so it's instantaneous if already fetched
  const { data: cacheMap = {} } = useSchoolBadgeCache(schoolId);
  const cacheRow = cacheMap[studentId];

  // Logic: 
  // 1. If student has pinned_badges, show them (up to 2).
  // 2. Otherwise, fallback auto-display: Show active champion, then active class stars (if showClassStars is true).
  // Total max 2.

  let badgesToRender = [];
  let totalBadges = 0;

  if (cacheRow) {
    totalBadges = (cacheRow.active_class_stars?.length || 0) + (cacheRow.active_champion ? 1 : 0);

    if (cacheRow.pinned_badges && cacheRow.pinned_badges.length > 0) {
      badgesToRender = cacheRow.pinned_badges.slice(0, 2);
    } else {
      if (cacheRow.active_champion) {
        badgesToRender.push(cacheRow.active_champion);
      }
      if (showClassStars && cacheRow.active_class_stars) {
        const remaining = 2 - badgesToRender.length;
        if (remaining > 0) {
          badgesToRender = [...badgesToRender, ...cacheRow.active_class_stars.slice(0, remaining)];
        }
      }
    }
  }

  const hasMore = totalBadges > 2;

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', ...style }}>
      <span>{name}</span>
      {badgesToRender.length > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', transform: 'translateY(1px)' }}>
          {badgesToRender.map((b, i) => (
            <LucideBadgeIcon key={i} iconKey={b.icon_key} color={b.icon_color} size={14} />
          ))}
          {hasMore && <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--text-muted)', marginLeft: '2px' }}>+</span>}
        </span>
      )}
    </span>
  );
}
