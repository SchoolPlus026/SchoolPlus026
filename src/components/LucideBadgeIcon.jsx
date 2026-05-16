/**
 * LucideBadgeIcon.jsx
 * Maps an icon_key string from badges_master → Lucide React icon component.
 * Keeps ALL badge rendering zero-image. Add new icon_key entries as needed.
 */
import React from 'react';
import {
  Star, Flame, Trophy, Medal, Crown,
  BookOpen, HandHeart, Smile, Shield,
  CalendarCheck, FlaskConical, Music,
  Zap, Heart, Award, ThumbsUp, Sparkles,
  Target, GraduationCap, Users,
} from 'lucide-react';

const ICON_MAP = {
  // Tier 1 - Class Stars
  'star':           Star,
  'flame':          Flame,
  'book-open':      BookOpen,
  'hand-heart':     HandHeart,
  'smile':          Smile,
  'shield':         Shield,
  'calendar-check': CalendarCheck,
  'zap':            Zap,
  'heart':          Heart,
  'thumbs-up':      ThumbsUp,
  'target':         Target,
  // Tier 2 - School Champions
  'trophy':         Trophy,
  'medal':          Medal,
  'crown':          Crown,
  'award':          Award,
  'flask-conical':  FlaskConical,
  'music':          Music,
  'sparkles':       Sparkles,
  'graduation-cap': GraduationCap,
  'users':          Users,
};

export function LucideBadgeIcon({ iconKey, color = '#FFD700', size = 14, strokeWidth = 2 }) {
  const IconComponent = ICON_MAP[iconKey] || Star;
  return (
    <IconComponent
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      style={{ flexShrink: 0, display: 'block' }}
    />
  );
}
