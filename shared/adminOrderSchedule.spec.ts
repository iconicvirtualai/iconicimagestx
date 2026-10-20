import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appointmentTravelEvents,
  assignablePhotographers,
  orderAssignmentPatch,
} from "./adminOrderSchedule";
import { zonedTimeToUtc } from "./apprenticeship";

const dashboard = readFileSync(new URL("../client/pages/AdminDashboard.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../client/components/NewOrderDialog.tsx", import.meta.url), "utf8");
const orderPage = readFileSync(new URL("../client/pages/AdminOrderRequest.tsx", import.meta.url), "utf8");
const serviceEditor = readFileSync(new URL("../client/components/OrderServiceEditor.tsx", import.meta.url), "utf8");

describe("assignable photographers", () => {
  const booking = [
    { id: "cadi-torres", name: "Cadi Torres" },
    { id: "steven-banda", name: "Steven Banda" },
  ];

  it("keeps Cadi and Steven and adds an apprentice once", () => {
    const options = assignablePhotographers({
      booking,
      staff: [
        { id: "uid-cadi", name: "Cadi Torres", role: "photographer", isActive: true },
        { id: "uid-jamie", name: "Jamie Cole", role: "apprentice", isActive: true },
        { id: "uid-qa", name: "QA TEST Do Not Assign", role: "photographer", qaOnly: true, isActive: true },
        { id: "uid-off", name: "Former", role: "photographer", isActive: false },
      ],
    });
    expect(options.map((person) => person.name)).toEqual(["Cadi Torres", "Jamie Cole", "Steven Banda"]);
    const cadi = options.find((person) => person.name === "Cadi Torres");
    expect(cadi).toMatchObject({
      bookingPhotographerId: "cadi-torres",
      staffId: "uid-cadi",
    });
    expect(options.find((person) => person.name === "Jamie Cole")?.role).toBe("apprentice");
  });
});

describe("order assignment patch", () => {
  it("saves the photographer, date, and time without an email address", () => {
    const patch = orderAssignmentPatch({
      photographer: {
        key: "cadi-torres",
        name: "Cadi Torres",
        role: "photographer",
        bookingPhotographerId: "cadi-torres",
        staffId: "uid-cadi",
      },
      date: "2026-10-19",
      time: "10:00",
      durationMinutes: 90,
      overrideNotes: ["Booked over the travel buffer."],
    });
    expect(patch).toMatchObject({
      appointmentDate: "2026-10-19",
      appointmentTime: "10:00",
      scheduledTime: "10:00",
      assignedPhotographerName: "Cadi Torres",
      photographerName: "Cadi Torres",
      bookingPhotographerId: "cadi-torres",
      photographerUid: "uid-cadi",
      photographerIds: ["uid-cadi"],
      status: "scheduled",
      appointmentDuration: 90,
    });
    expect(JSON.stringify(patch)).not.toContain("@");
    expect(patch).not.toHaveProperty("photographerEmail");
    expect(patch).not.toHaveProperty("photographerCalendarId");
  });

  it("keeps an unscheduled order unscheduled", () => {
    const patch = orderAssignmentPatch({
      photographer: null,
      date: "",
      time: "10:00",
    });
    expect(patch.status).toBeUndefined();
    expect(patch.appointmentTime).toBe("10:00");
  });
});

describe("appointment travel events", () => {
  it("reads another shoot for the same photographer on that day", () => {
    const events = appointmentTravelEvents({
      date: "2026-10-19",
      photographer: {
        key: "cadi-torres",
        name: "Cadi Torres",
        role: "photographer",
        bookingPhotographerId: "cadi-torres",
        staffId: "uid-cadi",
      },
      records: [
        {
          id: "other",
          bookingPhotographerId: "cadi-torres",
          assignedPhotographerName: "Cadi Torres",
          appointmentDate: "2026-10-19",
          appointmentTime: "08:00",
          appointmentDuration: 90,
        },
        {
          id: "steven",
          bookingPhotographerId: "steven-banda",
          appointmentDate: "2026-10-19",
          appointmentTime: "08:00",
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].startMs).toBe(zonedTimeToUtc(2026, 10, 19, 8, 0, "America/Chicago").getTime());
  });
});

describe("admin order screens", () => {
  it("assigns a photographer and a time on the new order popup without notifying the client", () => {
    expect(dashboard).toContain("NewOrderDialog");
    expect(dialog).toContain('data-testid="new-order-photographer"');
    expect(dialog).toContain('data-testid="new-order-date"');
    expect(dialog).toContain('data-testid="new-order-time"');
    expect(dashboard).toContain("assignablePhotographers");
    expect(dashboard).toContain("orderAssignmentPatch");
    expect(dashboard).toContain("adminAppointmentWarnings");
    expect(dashboard).toContain("upsertScheduledAppointment");
    expect(dashboard).toContain("/api/bookings/photographers");
    expect(dashboard).not.toContain("sendEmail");
    expect(dashboard).not.toContain("sendSMS");
    expect(dashboard).not.toContain("/confirm");
    expect(dashboard).not.toContain("CLIENT_NOTIFY_LIVE");
  });

  it("picks catalog services and reprices with the shared fee math", () => {
    expect(orderPage).toContain("OrderServiceEditor");
    expect(orderPage).toContain("packagesForStaffEditor");
    expect(serviceEditor).toContain("PackageCatalogPicker");
    expect(serviceEditor).toContain("staffServiceFromPackage");
    expect(orderPage).toContain("managedOrderEditorPatch");
    expect(orderPage).toContain("orderFeePreview");
    expect(orderPage).toContain("carry.photographerIds");
    expect(orderPage).toContain("carry.photographerUid");
    expect(orderPage).not.toContain("CLIENT_NOTIFY_LIVE");
  });
});
