export const ALL_MODULES = [
  { id: 'users', name: 'Users / Profile' },
  { id: 'attendance', name: 'Attendance' },
  { id: 'fees', name: 'Fees' },
  { id: 'calendar', name: 'Calendar' },
  { id: 'notices', name: 'Notices' },
  { id: 'gallery', name: 'Gallery' },
  { id: 'timetable', name: 'Timetable' },
  { id: 'off_classes', name: 'Off Classes' },
  { id: 'leaves', name: 'Leaves' },
  { id: 'reports', name: 'Reports' },
  { id: 'complaint_box', name: 'Complaint Box' },
  { id: 'bus_alerts', name: 'Bus Tracker' },
  { id: 'syllabus', name: 'Syllabus Tracker' },
  { id: 'lost_found', name: 'Lost & Found' },
  { id: 'emergency', name: 'Emergency Alerts' },
  { id: 'knowledge_base', name: 'Help / Knowledge Base' },
  { id: 'executive_briefing', name: 'Executive Briefing' },
  { id: 'duty_radar', name: 'Staff Pending Duty' },
  { id: 'settings', name: 'Settings' }
];

export const getModuleName = (moduleId) => {
  const mod = ALL_MODULES.find(m => m.id === moduleId);
  return mod ? mod.name : moduleId;
};
