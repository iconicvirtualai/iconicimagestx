import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildClientListing, sortNewestFirst } from "./clientHome.ts";
import { planBookingListings, bookingListingDocId } from "./bookingListing.ts";

const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
const clients = readFileSync(new URL("../server/routes/clients.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../server/services/bookingListing.ts", import.meta.url), "utf8");
const home = readFileSync(new URL("../client/components/client-home/ClientHomeDashboard.tsx", import.meta.url), "utf8");

const QUINN = "quinn@example.com";

function quinnBooking() {
  return {
    orderRequests: [
      {
        id: "reqOct3",
        data: {
          email: QUINN,
          clientId: "uid-quinn",
          clientName: "Quinn Agent",
          firstName: "Quinn",
          lastName: "Agent",
          phone: "512-555-0100",
          address: "456 QA Lane",
          scheduledDate: "Saturday, October 10, 2026",
          scheduledTime: "11:00 AM",
          status: "new",
          invoiceId: "inv0006",
          lineItems: [{ name: "Photos", price: 249 }],
          total: 249,
          squareFootage: "1800",
          propertyStatus: "Vacant",
          furnishingStatus: "Furnished",
          accessMethod: "Lockbox",
          lockboxCode: "1234",
          createdAt: "2026-10-03T15:00:00.000Z",
        },
      },
      {
        id: "reqOct2",
        data: {
          email: QUINN,
          clientId: "uid-quinn",
          address: "123 Other St",
          status: "new",
          invoiceId: "inv57",
          total: 249,
          createdAt: "2026-10-02T18:00:00.000Z",
        },
      },
    ],
    invoices: [
      {
        id: "inv0006",
        data: {
          invoiceNumber: "INV-2026-0006",
          orderRequestId: "reqOct3",
          clientEmail: QUINN,
          clientId: "uid-quinn",
          status: "draft",
          total: 249,
          createdAt: "2026-10-03T15:00:00.000Z",
        },
      },
      {
        id: "inv57",
        data: {
          invoiceNumber: "INV-2026-57XFIN",
          orderRequestId: "reqOct2",
          clientEmail: QUINN,
          clientId: "uid-quinn",
          status: "draft",
          total: 249,
          createdAt: "2026-10-02T18:00:00.000Z",
        },
      },
    ],
    appointments: [
      {
        id: "appt-qa",
        data: {
          orderRequestId: "reqOct3",
          clientId: "uid-quinn",
          clientEmail: QUINN,
          addressLabel: "456 QA Lane",
          status: "requested",
          scheduledDate: "Saturday, October 10, 2026",
          scheduledTime: "11:00 AM",
          createdAt: "2026-10-03T15:00:00.000Z",
        },
      },
    ],
  };
}

describe("booking listing docs", () => {
  it("gives each existing order one stable listing the home tile can open", () => {
    const plans = planBookingListings(quinnBooking());
    expect(plans.map((plan) => plan.listingId)).toEqual(["bklist_req_reqOct2", "bklist_req_reqOct3"]);
    expect(plans.every((plan) => plan.create)).toBe(true);

    const qa = plans.find((plan) => plan.listingId === "bklist_req_reqOct3");
    expect(qa?.createFields).toMatchObject({
      orderRequestId: "reqOct3",
      invoiceId: "inv0006",
      appointmentId: "appt-qa",
      clientId: "uid-quinn",
      clientEmail: QUINN,
      clientName: "Quinn Agent",
      address: "456 QA Lane",
      propertyAddress: "456 QA Lane",
      projectType: "real_estate",
      status: "scheduled",
      apptDate: "2026-10-10",
      scheduledDate: "2026-10-10",
      apptTime: "11:00 AM",
      squareFootage: "1800",
      propertyStatus: "Vacant",
      furnishingStatus: "Furnished",
      accessMethod: "Lockbox",
      accessInfo: "Lockbox - 1234",
      total: 249,
      services: ["Photos"],
      source: "booking",
      createdAt: "2026-10-03T15:00:00.000Z",
    });
    expect(qa?.createFields.lockboxCode).toBeUndefined();
    expect(qa?.links.map((link) => `${link.collection}/${link.id}`)).toEqual([
      "appointments/appt-qa",
      "invoices/inv0006",
      "orderRequests/reqOct3",
    ]);

    const cards = sortNewestFirst(plans.map((plan) => buildClientListing(plan.listingId, plan.createFields)));
    expect(cards.map((card) => card.address)).toEqual(["456 QA Lane", "123 Other St"]);
    expect(cards.map((card) => card.href)).toEqual([
      "/portal/listings/bklist_req_reqOct3",
      "/portal/listings/bklist_req_reqOct2",
    ]);
    expect(cards[0].appointmentDate).toBe("2026-10-10");

    const blob = JSON.stringify(plans);
    expect(blob).not.toMatch(/requirePayment|paymentUrl|studioToken|lockDownloads|cubicasa/i);
    expect(blob).not.toMatch(/"square(?!Footage)/);
  });

  it("reuses the same listing instead of creating a second one", () => {
    const source = quinnBooking();
    const first = planBookingListings(source);
    const existingListings = first.map((plan) => ({ id: plan.listingId, data: plan.createFields }));
    const unlinked = planBookingListings({ ...source, existingListings });
    expect(unlinked.map((plan) => plan.listingId)).toEqual(first.map((plan) => plan.listingId));
    expect(unlinked.every((plan) => plan.create === false)).toBe(true);
    expect(unlinked.every((plan) => Object.keys(plan.fillFields).length === 0)).toBe(true);
    expect(unlinked.some((plan) => plan.links.length > 0)).toBe(true);

    const stamp = (docs: Array<{ id: string; data: Record<string, unknown> }>, ownRequest: boolean) => docs.map((doc) => {
      const requestId = ownRequest ? doc.id : doc.data.orderRequestId;
      const listingId = first.find((plan) => plan.createFields.orderRequestId === requestId)?.listingId;
      return { ...doc, data: { ...doc.data, listingId } };
    });
    const again = planBookingListings({
      orderRequests: stamp(source.orderRequests, true),
      invoices: stamp(source.invoices, false),
      appointments: stamp(source.appointments, false),
      existingListings,
    });
    expect(again.map((plan) => plan.listingId)).toEqual(first.map((plan) => plan.listingId));
    expect(again.every((plan) => plan.create === false)).toBe(true);
    expect(again.every((plan) => Object.keys(plan.fillFields).length === 0)).toBe(true);
    expect(again.every((plan) => plan.links.length === 0)).toBe(true);
  });

  it("keeps a staff listing and only fills a blank address", () => {
    const plans = planBookingListings({
      orderRequests: quinnBooking().orderRequests.filter((doc) => doc.id === "reqOct3"),
      invoices: quinnBooking().invoices.filter((doc) => doc.id === "inv0006"),
      appointments: quinnBooking().appointments,
      existingListings: [{
        id: "staffListing1234",
        data: {
          orderRequestId: "reqOct3",
          clientId: "uid-quinn",
          clientEmail: QUINN,
          address: "10 Oak Street",
          propertyAddress: "10 Oak Street",
          status: "delivered",
          images: [{ url: "https://cdn.example/cover.jpg" }],
        },
      }],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].create).toBe(false);
    expect(plans[0].listingId).toBe("staffListing1234");
    expect(plans[0].fillFields.address).toBeUndefined();
    expect(plans[0].fillFields.status).toBeUndefined();
    expect(plans[0].fillFields.images).toBeUndefined();
    expect(buildClientListing(plans[0].listingId, { address: "10 Oak Street", status: "delivered" }).href)
      .toBe("/portal/listings/staffListing1234");
  });

  it("does not attach a booking to another client's listing", () => {
    const plans = planBookingListings({
      orderRequests: [{
        id: "reqOct3",
        data: {
          listingId: "foreignListing1",
          email: QUINN,
          clientId: "uid-quinn",
          address: "456 QA Lane",
          createdAt: "2026-10-03T15:00:00.000Z",
        },
      }],
      existingListings: [{
        id: "foreignListing1",
        data: { clientId: "someone-else", clientEmail: "other@example.com", address: "Secret HQ" },
      }],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].create).toBe(true);
    expect(plans[0].listingId).toBe("bklist_req_reqOct3");
    expect(plans[0].createFields.address).toBe("456 QA Lane");
    expect(JSON.stringify(plans[0].createFields)).not.toContain("Secret HQ");
    expect(plans[0].links).toContainEqual({ collection: "orderRequests", id: "reqOct3" });
  });

  it("joins a confirmed order, its invoices, and the appointment onto one listing", () => {
    const plans = planBookingListings({
      orderRequests: [{
        id: "reqOct3",
        data: {
          email: QUINN,
          clientId: "uid-quinn",
          address: { street: "456 QA Lane", city: "Austin", state: "TX", zip: "78701" },
          convertedToOrderId: "order9",
          invoiceId: "inv0006",
          createdAt: "2026-10-03T15:00:00.000Z",
        },
      }],
      orders: [{
        id: "order9",
        data: {
          orderRequestId: "reqOct3",
          clientId: "uid-quinn",
          clientEmail: QUINN,
          address: { street: "456 QA Lane", city: "Austin", state: "TX", zip: "78701" },
          status: "confirmed",
          total: 249,
          createdAt: "2026-10-03T16:00:00.000Z",
        },
      }],
      invoices: [
        { id: "inv0006", data: { orderRequestId: "reqOct3", clientEmail: QUINN, status: "draft", total: 249 } },
        { id: "invExtra", data: { orderRequestId: "reqOct3", clientEmail: QUINN, status: "draft", total: 249 } },
      ],
      appointments: quinnBooking().appointments,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].listingId).toBe("bklist_req_reqOct3");
    expect(plans[0].createFields.orderId).toBe("order9");
    expect(plans[0].createFields.address).toEqual({ street: "456 QA Lane", city: "Austin", state: "TX", zip: "78701" });
    expect(buildClientListing(plans[0].listingId, plans[0].createFields).address).toBe("456 QA Lane, Austin, TX, 78701");
    expect(plans[0].links.map((link) => link.id).sort()).toEqual(["appt-qa", "inv0006", "invExtra", "order9", "reqOct3"]);
  });

  it("uses the order request id when only the invoice and appointment are loaded", () => {
    const fromInvoice = planBookingListings({
      invoices: quinnBooking().invoices.filter((doc) => doc.id === "inv0006"),
      appointments: quinnBooking().appointments,
    });
    const withRequest = planBookingListings({
      orderRequests: quinnBooking().orderRequests.filter((doc) => doc.id === "reqOct3"),
      invoices: quinnBooking().invoices.filter((doc) => doc.id === "inv0006"),
      appointments: quinnBooking().appointments,
    });
    expect(fromInvoice[0].listingId).toBe("bklist_req_reqOct3");
    expect(withRequest[0].listingId).toBe(fromInvoice[0].listingId);
    expect(fromInvoice[0].createFields.address).toBe("456 QA Lane");
  });

  it("fills a blank listing that already uses the stable id", () => {
    const plans = planBookingListings({
      orderRequests: quinnBooking().orderRequests.filter((doc) => doc.id === "reqOct3"),
      existingListings: [{
        id: "bklist_req_reqOct3",
        data: { orderRequestId: "reqOct3", clientEmail: QUINN, clientId: "uid-quinn" },
      }],
    });
    expect(plans[0].create).toBe(false);
    expect(plans[0].fillFields.address).toBe("456 QA Lane");
    expect(plans[0].fillFields.propertyAddress).toBe("456 QA Lane");
    expect(plans[0].fillFields.status).toBe("scheduled");
    expect(plans[0].fillFields.images).toBeUndefined();
    expect(plans[0].fillFields.createdAt).toBeUndefined();
  });

  it("marks a business service and a declined booking without a second id", () => {
    const business = planBookingListings({
      orderRequests: [{
        id: "reqBiz",
        data: {
          email: QUINN,
          selectedService: { category: "business" },
          address: "Studio 5",
          status: "declined",
        },
      }],
    });
    expect(business[0].createFields.projectType).toBe("business");
    expect(business[0].createFields.status).toBe("cancelled");
    expect(bookingListingDocId("req", "req/with space")).toBe("bklist_req_req_with_space");
    expect(bookingListingDocId("ord", "order9")).toBe("bklist_ord_order9");
  });

  it("keeps home tiles on listings and does not change booking confirmation mail", () => {
    expect(bookings).toContain("ensureBookingListingForRequest(docRef.id)");
    expect(bookings).toContain("ensureBookingListingForRequest(req.params.id)");
    expect(clients).toContain("ensurePortalListingsForClient");
    expect(service).toContain("ref.create");
    expect(service).not.toContain("sendEmail");
    expect(service).not.toContain("sendSMS");
    expect(service).not.toContain("cubicasa.com");
    expect(bookings.match(/template: "booking_received"/g)).toHaveLength(2);
    expect(bookings.match(/template: "order_confirmed"/g)).toHaveLength(1);
    expect(bookings).toContain("SMS_TEMPLATES.bookingConfirmation");
    expect(home).toContain("clientListingPath(listing.id)");
    expect(home).toContain("No listings yet");
    expect(home).not.toContain("ensurePortalListings");
    expect(home).not.toContain("orderRequests");
  });
});
