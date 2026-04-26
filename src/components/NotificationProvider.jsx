/**
 * NotificationProvider.jsx
 * ─────────────────────────────────────────────────────────
 * Wrapper component that activates push notification registration
 * once a user is authenticated. Drop this inside any protected
 * layout (AdminLayout, TeacherLayout, StudentLayout, etc.)
 * OR inside App.jsx around protected routes.
 *
 * It renders nothing visual — purely a side-effect component.
 * ─────────────────────────────────────────────────────────
 */

import React from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';

export default function NotificationProvider({ children }) {
  // This hook runs after the component mounts. By this point,
  // useAppStore will have user and schoolSettings populated
  // because we are inside a ProtectedRoute.
  usePushNotifications();
  return children;
}
