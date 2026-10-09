import { describe, expect, it } from "vitest";
import { applyMerge, withUnsubscribeFooter } from "./merge";
import { summarizeGmassReport } from "./reports";
import { chicagoLocalToIso, gmassSendTime } from "./schedule";
import { normalizeSendingAccounts, matchSendingAccount } from "./sendingAccounts";

describe("sending accounts", () => {
  it("keeps photos@ and accepts a future news@ alias", () => {
    const accounts = normalizeSendingAccounts([
      { email: "Photos@IconicImagesTX.com", label: "Photos" },
      { email: "news@iconicimagestx.com", label: "" },
      { email: "not-an-email", label: "Bad" },
    ]);
    expect(accounts.map((account) => account.email)).toEqual([
      "photos@iconicimagestx.com",
      "news@iconicimagestx.com",
    ]);
    expect(accounts[1].label).toBe("news@iconicimagestx.com");
    expect(matchSendingAccount("news@iconicimagestx.com", accounts)).toBe("news@iconicimagestx.com");
    expect(matchSendingAccount("stranger@example.com", accounts)).toBe("");
  });
});

describe("merge tags", () => {
  it("uses the value or the fallback", () => {
    const html = applyMerge("Hi {FirstName|there} at {Company|Iconic}", {
      FirstName: "Ada",
      Company: "",
    });
    expect(html).toBe("Hi Ada at Iconic");
  });

  it("adds an unsubscribe link when the draft does not have one", () => {
    const html = withUnsubscribeFooter("<p>Hello</p>", "https://iconicimagestx.vercel.app/unsubscribe");
    expect(html).toContain('href="https://iconicimagestx.vercel.app/unsubscribe"');
  });
});

describe("Chicago schedule", () => {
  it("uses daylight time in October and standard time in January", () => {
    expect(gmassSendTime("2026-10-10T09:30")).toBe("10/10/2026 09:30 -05:00");
    expect(gmassSendTime("2026-01-15T09:30")).toBe("01/15/2026 09:30 -06:00");
    expect(chicagoLocalToIso("2026-10-10T09:30")).toBe("2026-10-10T14:30:00.000Z");
  });
});

describe("GMass report summary", () => {
  it("counts unique opens, per-link clicks, and recommends a pause at a 12% bounce rate", () => {
    const recipients = Array.from({ length: 100 }, (_, index) => ({ emailAddress: `p${index}@example.com`, sentTime: "2026-10-09T14:00:00.000Z" }));
    const bounces = recipients.slice(0, 12).map((row) => ({ ...row, bounceReason: "user unknown", bounceTime: "2026-10-09T15:00:00.000Z" }));
    const summary = summarizeGmassReport({
      recipients,
      opens: [
        { emailAddress: "p20@example.com", openCount: 3, lastOpenTime: "2026-10-09T16:00:00.000Z" },
        { emailAddress: "p21@example.com", openCount: 1, lastOpenTime: "2026-10-09T16:05:00.000Z" },
      ],
      clicks: [
        { emailAddress: "p20@example.com", url: "https://iconicimagestx.com/book", clickTime: "2026-10-09T16:10:00.000Z" },
        { emailAddress: "p20@example.com", url: "https://iconicimagestx.com/book", clickTime: "2026-10-09T16:12:00.000Z" },
        { emailAddress: "p21@example.com", url: "https://iconicimagestx.com/pricing", clickTime: "2026-10-09T16:11:00.000Z" },
      ],
      bounces,
      blocks: [{ emailAddress: "p30@example.com", blockReason: "blocked", blockTime: "2026-10-09T15:10:00.000Z" }],
      unsubscribes: [{ emailAddress: "p40@example.com", unsubscribeTime: "2026-10-09T17:00:00.000Z" }],
      replies: [{ emailAddress: "p21@example.com", replyTime: "2026-10-09T18:00:00.000Z" }],
      warnRate: 0.05,
      pauseRate: 0.08,
    });
    expect(summary.sent).toBe(100);
    expect(summary.delivered).toBe(87);
    expect(summary.uniqueOpens).toBe(2);
    expect(summary.opens).toBe(4);
    expect(summary.uniqueClicks).toBe(2);
    expect(summary.links[0]).toMatchObject({ url: "https://iconicimagestx.com/book", clicks: 2, unique: 1 });
    expect(summary.replies).toBe(1);
    expect(summary.pauseRecommended).toBe(true);
    expect(summary.timeline[0].type).toBe("reply");
  });
});
