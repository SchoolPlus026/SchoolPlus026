/**
 * dashboardSorter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sorts dashboard modules across all roles into a single, unified relative order.
 */

const SEQUENCE_ORDER = [
  'Manage Modules',
  'My Profile',
  'Users',
  'Manage Students',
  'Attendance',
  'My Attendance',
  'Class Attendance',
  'Timetable',
  'Calendar',
  'Notices',
  'Gallery',
  'Off Classes',
  'Leaves',
  'Achievers Board',
  'Complaint Box',
  'Route Control',
  'Bus Tracker',
  'Fees',
  'Syllabus Tracker',
  'Lost & Found',
  'Mood Note',
  'Emergency Alerts',
  'Billing',
  'Executive Briefing',
  'Staff Pending Duty',
  'Reports',
  'Help',
  'Settings'
];

/**
 * Sorts an array of module configurations based on the predefined sequence.
 * 
 * @param {Array} modules The list of module objects to sort.
 * @returns {Array} Sorted copy of the modules.
 */
export function sortModules(modules) {
  return [...modules].sort((a, b) => {
    let indexA = SEQUENCE_ORDER.findIndex(name => name.toLowerCase() === a.name.toLowerCase());
    let indexB = SEQUENCE_ORDER.findIndex(name => name.toLowerCase() === b.name.toLowerCase());
    
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    
    return indexA - indexB;
  });
}
