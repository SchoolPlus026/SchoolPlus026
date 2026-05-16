/**
 * AchieversBoard.jsx — Main entry point for the Achievers Board module.
 * Routes to Admin, Teacher, or Student view based on JWT role.
 */
import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import AdminAchieversPanel from './AdminAchieversPanel';
import TeacherAchieversPanel from './TeacherAchieversPanel';
import StudentAchievementsView from './StudentAchievementsView';
import { Trophy } from 'lucide-react';

export default function AchieversBoard() {
  const { user } = useAppStore();
  const role = user?.user_metadata?.role || user?.role;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <style>{`
        @keyframes abSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Page Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        marginBottom: '20px',
        animation: 'abSlideUp 0.4s ease both',
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '14px',
          background: 'linear-gradient(135deg, #F59E0B22, #EF444422)',
          border: '1px solid #F59E0B44',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Trophy size={20} color="#F59E0B" />
        </div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-main)' }}>
            Achievers Board
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
            {role === 'admin' || role === 'app_manager'
              ? 'Manage badges & school champions'
              : role === 'teacher'
              ? 'Award class stars to your students'
              : 'Your badges & achievements'}
          </div>
        </div>
      </div>

      {/* Role-based View */}
      {(role === 'admin' || role === 'app_manager') && <AdminAchieversPanel />}
      {role === 'teacher' && <TeacherAchieversPanel />}
      {(role === 'student') && <StudentAchievementsView studentId={user?.id} />}
    </div>
  );
}
