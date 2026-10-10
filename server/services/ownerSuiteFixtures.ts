import type { SheetGrid } from "../../shared/ownerSuite";

/**
 * Invented preview numbers for tests and local screenshots.
 * This is not the live scorecard and must never be replaced with a sheet export.
 */
export function ownerSuiteFixtureGrids(options: { actionLog?: boolean } = {}): SheetGrid[] {
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
