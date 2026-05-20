import React from 'react';
import PendingAttendanceWidget from '../features/attendance/PendingAttendanceWidget';

export default function StaffPendingDutyPage() {
  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto pb-10">
      <PendingAttendanceWidget forceShow={true} />
    </div>
  );
}
