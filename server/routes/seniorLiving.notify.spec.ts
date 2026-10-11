import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/email", () => ({
  sendEmail: vi.fn(async () => ({ sent: true, delivery: "sent" as const })),
}));

import { sendEmail } from "../services/email";
import { notifyOfficeOfOrder } from "../services/officeOrderNotify";
import {
  SENIOR_LIVING_OPS_EMAIL,
  seniorLivingOfficeEnv,
  seniorLivingOfficeRecord,
} from "../../shared/seniorLiving";

const sendEmailMock = vi.mocked(sendEmail);

const value = {
  name: "Ada Lovelace",
  community: "Sundale Senior Living",
  email: "ada@sundale.example",
  phone: "281-555-0199",
  address: "100 Oak St, Spring, TX 77380",
  services: ["tour-3d" as const],
  preferredDates: "April 14",
  notes: "",
};

describe("senior living office notify", () => {
  beforeEach(() => {
    sendEmailMock.mockClear();
  });

  it("uses the office helper to email ops and not the client", async () => {
    const saved = seniorLivingOfficeRecord("sl1", value);
    const result = await notifyOfficeOfOrder({
      isNewOrder: true,
      saved,
      adminUrl: "https://iconicimagestx.com/admin/orders",
      env: seniorLivingOfficeEnv({
        ADMIN_EMAIL: "photos@iconicimagestx.com",
        COORDINATOR_EMAIL: "ada@sundale.example",
      }),
    });
    expect(result.sent).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const message = sendEmailMock.mock.calls[0][0];
    expect(message.to).toContain(SENIOR_LIVING_OPS_EMAIL);
    expect(message.to).toContain("photos@iconicimagestx.com");
    expect(message.to).not.toContain("ada@sundale.example");
    expect(message.audience).toBe("staff");
    expect(message.template).toBe("office_new_order");
    expect(message.subject).toContain("Senior Living");
    expect(message.html).toContain("Sundale Senior Living");
  });
});
