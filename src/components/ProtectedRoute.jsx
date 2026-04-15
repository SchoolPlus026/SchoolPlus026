import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';

export default function ProtectedRoute({ allowedRoles }) {
  const { user, role } = useAppStore();

  if (!user) {
    // If user is falsy (not authenticated), safely bounce them to the public login page
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    // Highly strict role verification
    // E.g., someone with "student" role tried to manually navigate to "/admin/users"
    // Re-route them safely back to their designated domain baseline
    return <Navigate to={`/${role}`} replace />;
  }

  // They are authenticated and have matching role parameters, expose the guarded child route
  return <Outlet />;
}
