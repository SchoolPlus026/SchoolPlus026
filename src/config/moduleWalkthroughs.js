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
  },
  leaves: {
    title: "Leaves Management Guide",
    subtitle: "Submit leave applications and coordinate staff attendance.",
    roles: {
      admin: {
        description: "Welcome! As an Admin, this guide helps you review, approve, or reject staff leave applications and manage their annual leave balances.",
        steps: [
          {
            title: "1. Review Pending Requests",
            text: "View the list of leave applications from teachers and staff. Check the dates, type, and reason."
          },
          {
            title: "2. Check Class Coverage",
            text: "Ensure substitute arrangements (Off Classes) are in place for the absent periods before approving."
          },
          {
            title: "3. Approve or Reject",
            text: "Click 'Approve' to authorize the leave (sends notice to staff) or 'Reject' with feedback if coverage is unavailable."
          },
          {
            title: "4. Manage Balances",
            text: "Click 'Leave Balances' to view or manually credit/deduct annual quotas for specific staff members."
          }
        ],
        tips: [
          "Approving a leave automatically marks affected periods on the substitution board.",
          "Ensure that critical subject teachers do not take leave on same days."
        ]
      },
      teacher: {
        description: "Welcome! This guide helps you submit new leave requests and track your remaining leave balances.",
        steps: [
          {
            title: "1. Request Leave",
            text: "Click 'Apply for Leave'. Select the dates, leave type (Casual, Sick, etc.), and provide a reason."
          },
          {
            title: "2. Check Balances",
            text: "View your personalized balances table to see remaining days left for each category."
          },
          {
            title: "3. Track Status",
            text: "Monitor the history log to see if your request is 'Pending', 'Approved', or 'Rejected' by the Admin."
          }
        ],
        tips: [
          "Submit applications at least 3 days in advance to allow time for substitution planning.",
          "Emergency leaves can be marked as 'Sick Leave' for immediate approval."
        ]
      }
    }
  },
  complaint_box: {
    title: "Complaint Box & Feedback Guide",
    subtitle: "File concerns, submit anonymous suggestions, and track ticket resolutions.",
    roles: {
      admin: {
        description: "Welcome! As an Admin, this guide helps you monitor complaints filed by students or teachers, assign them to staff, and track resolutions.",
        steps: [
          {
            title: "1. View Complaints Inbox",
            text: "Browse complaints filed under different categories. Read description details and check anonymous statuses."
          },
          {
            title: "2. Assign Owner",
            text: "Delegate the complaint to a specific coordinator or staff member for resolution."
          },
          {
            title: "3. Mark Resolved",
            text: "Once resolved, update the status and write a summary. Students will receive an anonymous status update notification."
          }
        ],
        tips: [
          "Handle complaints with high sensitivity. Pinned anonymous complaints cannot be traced back.",
          "Assign coordinators promptly to keep response times low."
        ]
      },
      teacher: {
        description: "Welcome! This guide helps you raise concerns or submit suggestions directly to the school administration.",
        steps: [
          {
            title: "1. Submit Complaint",
            text: "Click 'File Complaint'. Choose a category, write details, and toggle 'Submit Anonymously' if you wish to hide your identity."
          },
          {
            title: "2. Track My Tickets",
            text: "View the status of your non-anonymous complaints to see if they are 'Assigned', 'In Progress', or 'Resolved'."
          }
        ],
        tips: [
          "Anonymous complaints will not display in your 'My Tickets' log to protect your identity.",
          "Provide details clearly to help admins resolve concerns faster."
        ]
      },
      student: {
        description: "Welcome! This guide helps you raise concerns or submit suggestions directly to the school administration.",
        steps: [
          {
            title: "1. Submit Complaint",
            text: "Click 'File Complaint'. Choose a category, write details, and toggle 'Submit Anonymously' if you wish to hide your identity."
          },
          {
            title: "2. Track My Tickets",
            text: "View the status of your non-anonymous complaints to see if they are 'Assigned', 'In Progress', or 'Resolved'."
          }
        ],
        tips: [
          "Anonymous complaints will not display in your 'My Tickets' log to protect your identity.",
          "Provide details clearly to help admins resolve concerns faster."
        ]
      }
    }
  },
  emergency: {
    title: "Emergency Alerts Guide",
    subtitle: "Broadcast school-wide emergency warnings and access direct safety protocols.",
    roles: {
      admin: {
        description: "Welcome! As an Admin, this guide helps you broadcast critical emergency alerts (closures, safety drills) to all students, parents, and staff.",
        steps: [
          {
            title: "1. Draft Emergency Alert",
            text: "Select 'Broadcast Alert'. Choose the emergency severity level (Info, Warning, Critical)."
          },
          {
            title: "2. Send SMS & Push",
            text: "Write clear safety instructions, select target recipients (All, Staff Only, etc.), and send. This delivers instant push notifications and SMS."
          },
          {
            title: "3. View History",
            text: "Review past alerts and check delivery success rates."
          }
        ],
        tips: [
          "Use 'Critical' level sparingly for actual situations like weather closures or safety drills.",
          "Double-check contact numbers before sending SMS broadcasts."
        ]
      },
      teacher: {
        description: "Welcome! This guide helps you view active school-wide emergency warnings and access direct safety protocols.",
        steps: [
          {
            title: "1. View Active Warnings",
            text: "Check the dashboard or emergency banner for active high-priority announcements."
          },
          {
            title: "2. Safety Protocols",
            text: "Read safety instructions attached to the alert and check coordinator details."
          }
        ],
        tips: [
          "Keep push notifications enabled on your device to receive instant critical warnings."
        ]
      },
      student: {
        description: "Welcome! This guide helps you view active school-wide emergency warnings and access direct safety protocols.",
        steps: [
          {
            title: "1. View Active Warnings",
            text: "Check the dashboard or emergency banner for active high-priority announcements."
          },
          {
            title: "2. Safety Protocols",
            text: "Read safety instructions attached to the alert."
          }
        ],
        tips: [
          "Keep push notifications enabled on your device to receive instant critical warnings."
        ]
      }
    }
  },
  billing: {
    title: "Billing & Subscription Guide",
    subtitle: "Manage school plans, renew subscriptions, upgrade limits, and download invoices.",
    roles: {
      admin: {
        description: "Welcome! This guide helps you manage your SchoolOS+ plan, renew subscriptions, upgrade limits, and download invoices.",
        steps: [
          {
            title: "1. Plan Summary",
            text: "View your current active tier, renewal date, and usage counters (student/staff limits)."
          },
          {
            title: "2. Upgrade or Renew",
            text: "Click 'Manage Subscription' to upgrade your plan or renew using secure Razorpay integration."
          },
          {
            title: "3. Billing History",
            text: "Access and download past invoices and receipts for school accounting."
          }
        ],
        tips: [
          "Renew early to avoid account locking or service disruption.",
          "Contact support directly if payment is deducted but does not show in the dashboard."
        ]
      }
    }
  },
  syllabus: {
    title: "Syllabus Progress Guide",
    subtitle: "Track subject topics, configure chapters, and monitor academic progress.",
    roles: {
      admin: {
        description: "Welcome! As an Admin, this guide helps you manage subject topics, assign them to classes, and monitor teaching progress across all teachers.",
        steps: [
          {
            title: "1. Configure Classes & Subjects",
            text: "Navigate to settings to pair subjects with standard classes and divisions."
          },
          {
            title: "2. Track Teacher Progress",
            text: "Monitor the progress dashboard to see which chapters are completed, delayed, or in progress for each subject."
          }
        ],
        tips: [
          "Review progress reports regularly to plan revisions before final exams.",
          "Coordinate with teachers if subject timelines are slipping."
        ]
      },
      teacher: {
        description: "Welcome! As a Teacher, this guide helps you log syllabus progress, update topic completion statuses, and plan classes.",
        steps: [
          {
            title: "1. Update Subject Topics",
            text: "Select your assigned class and subject. View the list of chapters and topics."
          },
          {
            title: "2. Mark Completed",
            text: "Toggle topics as 'Completed' or 'In Progress' and enter completion dates to update the admin dashboard."
          }
        ],
        tips: [
          "Keep topic logs updated weekly to provide accurate metrics to the administration.",
          "Add remarks if extra classes are needed to cover specific complex topics."
        ]
      }
    }
  },
  bus_alerts: {
    title: "Bus Tracker & Alerts Guide",
    subtitle: "Track school bus coordinates, manage driver pairings, and send delay notices.",
    roles: {
      admin: {
        description: "Welcome! As an Admin, this guide helps you configure bus routes, pair drivers with vehicle numbers, and broadcast route delays to parents.",
        steps: [
          {
            title: "1. Route Configuration",
            text: "Set up starting points, destinations, and schedules for each bus route."
          },
          {
            title: "2. Assign Drivers & Vehicles",
            text: "Link drivers with vehicles and assign student passenger logs."
          },
          {
            title: "3. Broadcast Delay Alerts",
            text: "Click 'Send Delay Alert' to broadcast weather delays or route deviations instantly to all affected parents."
          }
        ],
        tips: [
          "Check driver GPS connectivity logs regularly to ensure tracking data accuracy.",
          "Notify parents immediately if a route change is enforced."
        ]
      },
      teacher: {
        description: "Welcome! This guide helps you view driver coordinates and access schedules for school transit routes.",
        steps: [
          {
            title: "1. Check Active Routes",
            text: "View arrival timings and passenger registers for school transport buses."
          }
        ],
        tips: [
          "Reach out to transport coordinators in case of student missing status logs."
        ]
      },
      student: {
        description: "Welcome! This guide helps you track your school bus live, view driver details, and estimate arrival times.",
        steps: [
          {
            title: "1. Track Live Bus",
            text: "View the live map to track the real-time coordinates of your assigned bus route."
          },
          {
            title: "2. Driver Info",
            text: "Check driver name, phone number, and vehicle registration details."
          }
        ],
        tips: [
          "Be at your designated bus stop at least 5 minutes before scheduled arrival."
        ]
      }
    }
  },
  lost_found: {
    title: "Lost & Found Guide",
    subtitle: "Report misplaced belongings, claim found items, and manage returns.",
    roles: {
      admin: {
        description: "Welcome! As an Admin, this guide helps you manage reported lost/found items and verify ownership to resolve claims.",
        steps: [
          {
            title: "1. Claim Approval",
            text: "Review claim requests submitted by students. Verify details (photos, purchase proof) before approving."
          },
          {
            title: "2. Close Resolved Items",
            text: "Once items are returned, mark them as 'Returned' to archive them."
          }
        ],
        tips: [
          "Verify ownership carefully for high-value items (smartwatches, cash, keys).",
          "Ensure found items are kept in the physical school repository room."
        ]
      },
      teacher: {
        description: "Welcome! This guide helps you list items you found or report your lost belongings.",
        steps: [
          {
            title: "1. Report Found Item",
            text: "Found an item? Post it to help find its owner. Choose a collection location."
          },
          {
            title: "2. Report Lost Item",
            text: "Post details of a lost item including photo, description, and location where it was lost."
          }
        ],
        tips: [
          "Hand over found items to the administrative desk for safe storage."
        ]
      },
      student: {
        description: "Welcome! This guide helps you report lost items, list found items, and submit claims to recover your lost belongings.",
        steps: [
          {
            title: "1. Report Lost Item",
            text: "Click 'Report Lost'. Upload item details, photos, estimated value, and location where it was misplaced."
          },
          {
            title: "2. Report Found Item",
            text: "Found an item? Post it to help find its owner."
          },
          {
            title: "3. Claim Item",
            text: "Browse found items listed by others. If you see yours, click 'Claim' and write verification details for the Admin."
          }
        ],
        tips: [
          "Check the active found items feed regularly before reporting a new lost item.",
          "Provide detailed identifying descriptions to speed up owner verification."
        ]
      }
    }
  },
  // Mapping duplicate key to protect against hyphen-to-underscore differences
  lost_and_found: {
    title: "Lost & Found Guide",
    subtitle: "Report misplaced belongings, claim found items, and manage returns.",
    roles: {
      admin: {
        description: "Welcome! As an Admin, this guide helps you manage reported lost/found items and verify ownership to resolve claims.",
        steps: [
          {
            title: "1. Claim Approval",
            text: "Review claim requests submitted by students. Verify details (photos, purchase proof) before approving."
          },
          {
            title: "2. Close Resolved Items",
            text: "Once items are returned, mark them as 'Returned' to archive them."
          }
        ],
        tips: [
          "Verify ownership carefully for high-value items (smartwatches, cash, keys).",
          "Ensure found items are kept in the school repository room."
        ]
      },
      teacher: {
        description: "Welcome! This guide helps you list items you found or report your lost belongings.",
        steps: [
          {
            title: "1. Report Found Item",
            text: "Found an item? Post it to help find its owner. Choose a collection location."
          },
          {
            title: "2. Report Lost Item",
            text: "Post details of a lost item including photo, description, and location where it was lost."
          }
        ],
        tips: [
          "Hand over found items to the administrative desk for safe storage."
        ]
      },
      student: {
        description: "Welcome! This guide helps you report lost items, list found items, and submit claims to recover your lost belongings.",
        steps: [
          {
            title: "1. Report Lost Item",
            text: "Click 'Report Lost'. Upload item details, photos, estimated value, and location where it was misplaced."
          },
          {
            title: "2. Report Found Item",
            text: "Found an item? Post it to help find its owner."
          },
          {
            title: "3. Claim Item",
            text: "Browse found items listed by others. If you see yours, click 'Claim' and write verification details for the Admin."
          }
        ],
        tips: [
          "Check the active found items feed regularly before reporting a new lost item.",
          "Provide detailed identifying descriptions to speed up owner verification."
        ]
      }
    }
  }
};
