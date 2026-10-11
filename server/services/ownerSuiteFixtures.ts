import type { SheetGrid } from "../../shared/ownerSuite";

/**
 * Invented preview numbers for tests and local screenshots.
 * This is not the live scorecard and must never be replaced with a sheet export.
 */
export function ownerSuiteFixtureGrids(options: { actionLog?: boolean; planBoard?: boolean } = {}): SheetGrid[] {
  const sheets: SheetGrid[] = [
    {
      title: "Friday Scorecard",
      rows: [
        ["Cash this week", "$4,280", "Week goal", "$5,000"],
        ["Cash this month", "$18,640", "Month goal", "$22,000"],
        ["Savings", "$12,400", "Savings goal", "$15,000", "Reserve"],
        [],
        ["Money in"],
        ["Method", "Amount"],
        ["Card", "$2,140"],
        ["Zelle", "$980"],
        ["Check", "$760"],
        ["Invoice", "$400"],
        [],
        ["Accounts receivable"],
        ["Name", "Amount", "Detail"],
        ["Northwind Realty", "$1,800", "Due Friday"],
        ["Harper and Co", "$640", "Net 15"],
      ],
    },
    {
      title: "This Week",
      rows: [
        ["Day", "Date", "Plan", "Time", "Calendar", "Where", "When"],
        ["Friday", "2026-10-09", "Review the scorecard", "9:00 AM", "Broker breakfast", "Downtown", ""],
        ["Saturday", "2026-10-10", "Edit the lake house", "10:30 AM", "Lake house delivery", "Lakeway", "Today"],
        ["Monday", "2026-10-12", "Send commercial proposals", "1:00 PM", "Proposal block", "Studio", ""],
      ],
    },
    {
      title: "$100k Tracker",
      rows: [
        ["Goal", "$100,000"],
        ["Current", "$63,400"],
        ["Source", "Amount"],
        ["Iconic Images", "$48,000"],
        ["Education", "$9,400"],
        ["Commercial", "$6,000"],
      ],
    },
    {
      title: "Businesses",
      rows: [
        ["Business", "Status", "Note"],
        ["Iconic Images", "Green", "Shoots on pace"],
        ["Studio 105", "G", "Rentals booked"],
        ["Education", "Yellow", "Course outline waiting"],
        ["Prints", "On track", "Lab on time"],
        ["Commercial", "Red", "Proposal needs a yes"],
        ["Workshops", "Watch", "Fall dates open"],
      ],
    },
    {
      title: "30-60-90",
      rows: [
        ["30", "60", "90"],
        ["Close two commercial proposals", "Launch the education waitlist", "Check the 100k pace"],
        ["Book November workshops", "Bring savings to the reserve goal", "Hire a weekend editor"],
      ],
    },
    {
      title: "Owes",
      rows: [
        ["Who", "Amount", "Detail"],
        ["Lab prints", "$220", "Due Monday"],
        ["Software", "$49", "Monthly"],
      ],
    },
    {
      title: "Decisions",
      rows: [
        ["Decision", "Detail", "By", "Status"],
        ["Raise the weekend retainer", "Weekend shoots are full", "Friday", "Waiting"],
        ["Buy a second lighting kit", "One kit is booked out", "This month", "Needs your yes"],
        ["Sponsor the broker breakfast", "The host asked this week", "Wednesday", "Open"],
        ["Archive last spring's prices", "Already settled in the sheet", "", "Done"],
      ],
    },
  ];
  if (options.planBoard !== false) {
    sheets.push(planBoardFixture());
  }
  if (options.actionLog !== false) {
    sheets.push({
      title: "Action Log",
      rows: [
        ["Bot", "Loop", "Actions", "Sales closed", "Accuracy"],
        ["Booking bot", "Follow-up", "14", "3", "98%"],
        ["Inbox bot", "Reply", "22", "1", "97%"],
        ["Billing bot", "Invoice", "9", "4", "99%"],
      ],
    });
  }
  return sheets;
}

/**
 * Header and label text from the live command center, with placeholder values only.
 * Action Log is omitted on purpose: that tab does not exist.
 */
export function ownerCommandCenterStructureGrids(): SheetGrid[] {
  return [
    {
      title: "Plan Board",
      rows: [
        ["Business", "Section", "Item", "Date", "Amount", "Status", "Notes"],
        ["Iconic Studios", "To-do", "Visual only placeholder", "2026-10-12", "0", "", "Visual tab"],
      ],
    },
    {
      title: "Plan Board Data",
      rows: [
        ["Business", "Section", "Item", "Date", "Amount", "Status", "Notes"],
        ["KDP", "To-do", "Data tab placeholder", "2026-10-12", "0", "", "Placeholder note"],
        ["Iconic Images M&M", "Calendar", "Placeholder calendar", "2026-10-16", "0", "", ""],
      ],
    },
    {
      title: "Friday Scorecard",
      rows: [
        ["FRIDAY SCORECARD · Week ending placeholder"],
        ["Sources note placeholder"],
        [],
        ["METRIC", "VALUE"],
        ["Cash collected this week", "$0"],
        ["Toward $100k identified moves", "$0"],
        ["Payroll reserve", "$0"],
        ["Steven paid (Cash App)", "$0"],
        ["Payroll HOLD unpaid", "~0+"],
        ["AR > 7 days (client)", "Placeholder client"],
        ["Past-due count", "0+"],
        ["New bookings", "Active"],
        ["DOT paid claims / upgrades", "0 / 0"],
        ["Job apps / interviews", "0 / 0"],
        ["Kids items done", "0"],
        ["Square Loan remaining", "$0"],
        [],
        ["BUSINESS", "RAG"],
        ["Iconic Images", "Red"],
        ["Iconic Studios", "Yellow"],
        ["KDP", "Green"],
        ["Iconic Virtual.ai", "YELLOW"],
        ["Doors Open Tour", "Amber"],
        ["aICON", "G"],
        [],
        ["NEXT WEEK TARGET (suggestions for Cadi — NOT messaged)", "OWNER"],
        ["Placeholder target", "Placeholder owner"],
        [],
        ["Week cash detail (Payment #)", "Date"],
        ["P-0", "2026-10-12"],
      ],
    },
    {
      title: "Businesses",
      rows: [
        ["Businesses"],
        ["Placeholder note"],
        ["Business", "RAG", "Where it stands", "Next milestone", "Milestone due", "Next date on the calendar", "30-day target", "30-day $ (est.)", "Owner(s)", "15% profit check"],
        ["Iconic Images", "YELLOW", "Placeholder standing", "Placeholder milestone", "2026-11-08", "2026-10-16", "Placeholder target", "$0", "Placeholder owner", "Placeholder"],
        ["Iconic Studios", "Amber", "Placeholder standing", "Placeholder milestone", "TBD", "TBD", "Placeholder target", "$0", "Placeholder owner", "Placeholder"],
        ["KDP", "R", "Placeholder standing", "Placeholder milestone", "TBD", "TBD", "Placeholder target", "$0", "Placeholder owner", "Placeholder"],
        ["Iconic Virtual.ai", "g", "Placeholder standing", "Placeholder milestone", "TBD", "TBD", "Placeholder target", "$0", "Placeholder owner", "Placeholder"],
        ["Doors Open Tour", "A", "Placeholder standing", "Placeholder milestone", "TBD", "TBD", "Placeholder target", "$0", "Placeholder owner", "Placeholder"],
        ["aICON", "Green", "Placeholder standing", "Placeholder milestone", "TBD", "TBD", "Placeholder target", "$0", "Placeholder owner", "Placeholder"],
      ],
    },
    {
      title: "30-60-90",
      rows: [
        ["30-60-90 · Oct 9, 2026 → Jan 7, 2027"],
        ["Gold = hard milestone. Day 30 = Nov 8 · Day 60 = Dec 8 · Day 90 = Jan 7, 2027. Placeholder note."],
        ["OCTOBER 2026", "", "", "", "", "", "", "", "Date", "Milestone"],
        ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT", "", "", ""],
        ["", "", "", "", "", "16\n★ Placeholder hard milestone", "", "", "Fri Oct 16", "Placeholder early item"],
        ["", "", "", "", "", "", "", "", "Sun Nov 8", "DAY 30: Placeholder checkpoint"],
        ["", "", "", "", "", "", "", "", "Tue Dec 8", "DAY 60 checkpoint: Placeholder"],
        ["", "", "", "", "", "", "", "", "Thu Jan 7, 2027", "DAY 90 checkpoint"],
        ["", "", "", "", "", "", "", "", "TBD", "Placeholder undated"],
        ["", "", "", "", "", "", "", "", "By Mar 2027 (est.)", "Placeholder later"],
        ["", "", "", "", "", "", "", "", "Once stable", "Placeholder when stable"],
      ],
    },
  ];
}

function planBoardFixture(): SheetGrid {
  return {
    title: "Plan Board",
    rows: [
      ["Business", "Section", "Item", "Date", "Amount", "Status", "Notes", "Lane"],
      ["iconic images m&m", "Revenue", "October retainers", "2026-10-01", "$8,400", "", "Retainer", "ignore-me"],
      ["Iconic Images M&M", "revenue", "Print add-on", "2026-10-08", "$640", "", "", ""],
      ["Iconic Images M&M", "Expense", "Lab", "2026-10-03", "$1,200", "", "Prints", ""],
      ["ICONIC IMAGES M&M", "EXPENSE", "Ads", "10/12/2026", "$350", "", "", ""],
      ["Iconic Images M&M", "Calendar", "Broker breakfast", "2026-10-16", "", "Set", "Downtown", ""],
      ["Iconic Images M&M", "calendar", "Gallery night", "2026-10-14", "", "", "Studio", ""],
      ["Iconic Images M&M", "Social", "Lake house reel", "2026-10-18", "", "Scheduled", "", ""],
      ["Iconic Images M&M", "Social", "Before and after", "2026-10-11", "", "", "", ""],
      ["Iconic Images M&M", "Event", "Fall mini sessions", "2026-10-24", "", "", "Outdoor", ""],
      ["Iconic Images M&M", "Promo", "Referral card", "2026-10-20", "", "", "", ""],
      ["Iconic Images M&M", "Email", "Newsletter", "2026-10-27", "", "", "", ""],
      ["Iconic Images M&M", "Email", "Past client note", "2026-10-13", "", "Draft", "", ""],
      ["Iconic Images M&M", "To-do", "File the lens receipt", "2026-10-09", "", "Done", "", ""],
      ["Iconic Images M&M", "To-do", "Confirm weekend crew", "2026-10-10", "", "Open", "", ""],
      ["Iconic Studios", "Revenue", "Booth rentals", "2026-10-02", "$3,200", "", "", ""],
      ["Iconic Studios", "Expense", "Utilities", "2026-10-04", "$800", "", "", ""],
      ["Iconic Studios", "Calendar", "Studio tour", "2026-10-15", "", "", "", ""],
      ["Iconic Studios", "Social", "Cyclorama reel", "2026-10-12", "", "", "", ""],
      ["Iconic Studios", "Event", "Open studio", "2026-10-22", "", "", "", ""],
      ["Iconic Studios", "Email", "Member reminder", "2026-10-17", "", "", "", ""],
      ["Iconic Studios", "To-do", "Order backdrops", "", "", "Open", "Seamless paper", ""],
      ["aICON", "Revenue", "Suite build", "2026-10-06", "$1,500", "", "", ""],
      ["aICON", "Expense", "Software", "2026-10-05", "$90", "", "", ""],
      ["aICON", "Calendar", "Ship the scorecard", "2026-10-10", "", "", "", ""],
      ["aicon", "Social", "Feature the board", "2026-10-19", "", "", "", ""],
      ["aICON", "Email", "Weekly ops note", "2026-10-14", "", "", "", ""],
      ["aICON", "To-do", "Review the owner gate", "2026-10-08", "", "Completed", "", ""],
      ["Iconic Virtual", "Revenue", "Tour packages", "2026-10-03", "$2,100", "", "", ""],
      ["Iconic Virtual", "Expense", "Hosting", "2026-10-07", "$400", "", "", ""],
      ["Iconic Virtual", "Calendar", "Listing refresh", "2026-10-13", "", "", "", ""],
      ["Iconic Virtual", "Social", "Virtual tour clip", "2026-10-16", "", "", "", ""],
      ["Iconic Virtual", "Promo", "October highlight", "2026-10-19", "", "", "", ""],
      ["Iconic Virtual", "Email", "Agent blast", "2026-10-15", "", "", "", ""],
      ["Iconic Virtual", "To-do", "Update floor plans", "", "", "Open", "", ""],
      ["KDP", "Revenue", "Paperback", "2026-10-09", "$720", "", "", ""],
      ["KDP", "Expense", "Proof copy", "2026-10-02", "$40", "", "", ""],
      ["KDP", "Calendar", "Upload week", "2026-10-18", "", "", "", ""],
      ["KDP", "Social", "Cover refresh", "2026-10-21", "", "", "", ""],
      ["KDP", "Email", "Reader note", "2026-10-11", "", "", "", ""],
      ["KDP", "To-do", "Proof chapter four", "", "", "Open", "", ""],
      ["Mystery Co", "Revenue", "Should not appear", "2026-10-01", "$9,999", "", "", ""],
      ["Iconic Images M&M", "Other", "Ignore this lane", "2026-10-01", "$50", "", "", ""],
    ],
  };
}
