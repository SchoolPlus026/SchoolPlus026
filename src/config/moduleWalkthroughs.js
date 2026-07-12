// Local walkthrough guides for SchoolOS+ modules.
// You can edit this file offline anytime. These guides consume zero Supabase limits.
// Google Translate will automatically translate these texts since they render in the DOM.

export const moduleWalkthroughs = {
  off_classes: {
    title: "Off-Classes & Substitution Guide",
    subtitle: "Manage absent teachers and ensure continuous class coverage.",
    roles: {
      admin: {
        description: "Welcome! As an Admin, this guide helps you coordinate substitutions when a teacher is absent, ensuring students always have a teacher in class.",
        steps: [
          {
            title: "1. Mark Teacher Absent",
            text: "Click the 'Mark Teacher Absent' button to select a teacher. This automatically fetches their timetable for today and generates period cards that need substitution."
          },
          {
            title: "2. Find Free Substitutes",
            text: "Click on any period card. The system instantly scans all teachers' schedules and lists who is free during that specific period, sorted by their department."
          },
          {
            title: "3. Assign or Broadcast",
            text: "You can assign a free teacher directly (they will receive a duty notice) or broadcast the period to all free teachers so they can volunteer to cover it."
          },
          {
            title: "4. Monitor Substitution Statuses",
            text: "Track each period's status in real-time. Look out for badges like 'Pending' (waiting for teacher response), 'Accepted' (substitute confirmed), 'Completed' (class finished), or 'Not Accepted' (expired)."
          }
        ],
        tips: [
          "Hover or tap the '?' help circle icon next to any status badge to instantly read what it means.",
          "Teachers can manually declare themselves 'Free' for specific periods, making them preferred candidates."
        ]
      },
      teacher: {
        description: "Welcome! As a Teacher, this guide helps you manage your assigned substitute duties and declare your free periods to assist the administration.",
        steps: [
          {
            title: "1. View Assigned Duties",
            text: "Check the 'My Duties & Opportunities' tab to view substitutions assigned directly to you, or see broadcasted classes available for volunteering."
          },
          {
            title: "2. Accept or Reject Request",
            text: "Review the class details (subject, class, time) and click 'Accept' to confirm your duty. If you have another urgent conflict, click 'Reject'."
          },
          {
            title: "3. Declare Free Periods",
            text: "Navigate to the 'Declare Free Periods' tab and toggle periods where you are free. This signals to the Admin that you can cover absent colleagues."
          }
        ],
        tips: [
          "Always check your notifications to accept substitute duties before the class starts.",
          "Substitute teaching duties are tracked and count towards your performance reports."
        ]
      }
    }
  }
};
