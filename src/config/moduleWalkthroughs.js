// Local walkthrough guides for SchoolOS+ modules.
// You can edit this file offline anytime. These guides consume zero Supabase limits.
// Google Translate will automatically translate these texts since they render in the DOM.

export const moduleWalkthroughs = {
  off_classes: {
    title: "Off-Classes & Substitution Guide",
    subtitle: "Manage absent teachers and ensure continuous class coverage.",
    description: "Welcome! This module helps you coordinate substitutions when a teacher is absent, ensuring students always have a teacher in class.",
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
  }
};
