import React from 'react';
import PendingAttendanceWidget from '../features/attendance/PendingAttendanceWidget';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function StaffPendingDutyPage() {
  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto pb-10">
      <Link to="/admin/dashboard" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-bold text-sm mb-4 transition-colors">
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
      <PendingAttendanceWidget forceShow={true} />
    </div>
  );
}
