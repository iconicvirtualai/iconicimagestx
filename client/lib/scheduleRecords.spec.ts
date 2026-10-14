import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appointmentTone } from "@shared/clientHome";
import {
  isScheduledRecord,
  isUnscheduledRequest,
} from "./scheduleRecords";

const booked = {
  status: "new",
  scheduledDate: "2026-10-20",
  scheduledTime: "11:00 AM",
  assignedPhotographerName: "Steven Banda",
  bookingPhotographerId: "steven-banda",
};

describe("booked requests on the schedule", () => {
  it("keeps a new request with a slot and a photographer on the board", () => {
    expect(isScheduledRecord(booked)).toBe(true);
    expect(isUnscheduledRequest(booked)).toBe(false);
    expect(isScheduledRecord({ ...booked, assignedPhotographerName: "", bookingPhotographerId: "" })).toBe(false);
    expect(isUnscheduledRequest({ status: "new", requestedDate: "2026-10-20" })).toBe(true);
    expect(isScheduledRecord({ status: "cancelled", scheduledDate: "2026-10-20", assignedPhotographerName: "Steven Banda" })).toBe(false);
  });

  it("counts scheduledDate in the dashboard unscheduled filter", () => {
    const metrics = readFileSync(new URL("../hooks/useOperationsMetrics.ts", import.meta.url), "utf8");
    expect(metrics).toContain("isUnscheduledRequest(or)");
    expect(metrics).not.toContain("!or.appointmentDate");
  });

  it("paints a confirmed appointment accepted and does not send mail from this read model", () => {
    expect(appointmentTone({
      status: "confirmed",
      date: "2026-12-01",
      time: "11:00 AM",
      requestedDate: "2026-12-01",
      requestedTime: "11:00 AM",
      approved: false,
    }, "2026-10-14")).toBe("accepted");
    const home = readFileSync(new URL("../../shared/clientHome.ts", import.meta.url), "utf8");
    expect(home).not.toContain("sendEmail");
    expect(home).not.toContain("CLIENT_NOTIFY_LIVE");
  });
});
