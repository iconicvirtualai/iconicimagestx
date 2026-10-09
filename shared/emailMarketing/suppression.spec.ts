import { describe, expect, it } from "vitest";
import { resolveAudience } from "./audience";
import { blankContact } from "./contacts";
import { matchSuppression, seedSuppression } from "./suppression";
import { DEFAULT_MARKETING_SETTINGS, type MarketingContact } from "./types";

const now = "2026-10-09T15:00:00.000Z";
const seed = seedSuppression(now);

function person(email: string, first: string, last: string, extra: Partial<MarketingContact> = {}): MarketingContact {
  return { ...blankContact(email, "import", now), firstName: first, lastName: last, emailVerified: false, ...extra };
}

describe("standing suppression", () => {
  it("blocks the kink team domain, named people, and personal holds", () => {
    expect(matchSuppression(person("a@thekinkteam.com", "A", "Agent"), seed)?.kind).toBe("domain");
    expect(matchSuppression(person("bruce@anywhere.com", "Bruce", "Kink"), seed)?.value).toBe("bruce kink");
    expect(matchSuppression(person("lisa@example.com", "Lisa", "Cagle"), seed)).toBeTruthy();
    expect(matchSuppression(person("haley@example.com", "Haley", "Garcia"), seed)).toBeTruthy();
    expect(matchSuppression(person("shannon@example.com", "Shannon", "Cox"), seed)).toBeTruthy();
    expect(matchSuppression(person("melissa@example.com", "Melissa", "Franklin"), seed)).toBeTruthy();
    expect(matchSuppression(person("justin@example.com", "Justin", "McClung"), seed)).toBeTruthy();
    expect(matchSuppression(person("rebecca@example.com", "Rebecca", "Nye"), seed)?.hold).toBe("personal");
    expect(matchSuppression(person("jacki@example.com", "Jacki", "Henthorne"), seed)?.hold).toBe("personal");
    expect(matchSuppression(person("jacalyn@example.com", "Jacalyn", "Henthorne"), seed)?.hold).toBe("personal");
    expect(matchSuppression(person("ok@example.com", "Pat", "Agent"), seed)).toBeNull();
  });

  it("uses an email once Cadi fills it in on a name hold", () => {
    const withEmail = seed.map((item) => item.value === "shannon cox" ? { ...item, email: "shannon@broker.com" } : item);
    expect(matchSuppression(person("shannon@broker.com", "S", "Unknown"), withEmail)?.value).toBe("shannon cox");
  });
});

describe("audience enforcement", () => {
  const contacts = [
    person("ok@example.com", "Pat", "Agent", { emailVerified: true, tags: ["agents"] }),
    person("ok@example.com", "Pat", "Duplicate"),
    person("bruce@anywhere.com", "Bruce", "Kink"),
    person("a@thekinkteam.com", "A", "Agent"),
    person("recent@example.com", "Rae", "Cent", { emailVerified: true }),
    person("overlap@example.com", "Olive", "Lap", { emailVerified: true }),
    person("not-an-email", "Nope", "Body"),
    person("fresh@example.com", "Fran", "List"),
  ];

  const settings = { ...DEFAULT_MARKETING_SETTINGS, frequencyMax: 1, frequencyDays: 7, overlapHours: 24 };

  function run(overlapOverride = false) {
    return resolveAudience({
      contacts,
      suppression: seed,
      sends: [{ email: "recent@example.com", campaignId: "old", sentAt: "2026-10-08T15:00:00.000Z" }],
      campaigns: [{
        id: "live",
        name: "Tuesday agents",
        status: "sent",
        sentAt: "2026-10-09T12:00:00.000Z",
        scheduledAt: "",
        recipientEmails: ["overlap@example.com"],
      }],
      settings,
      sendAt: now,
      overlapOverride,
    });
  }

  it("dedupes, suppresses, frequency-caps, and holds overlap", () => {
    const result = run();
    expect(result.recipients.map((contact) => contact.email).sort()).toEqual(["fresh@example.com", "ok@example.com"]);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.suppressed).toBe(2);
    expect(result.frequencyCapped).toBe(1);
    expect(result.overlapHeld).toBe(1);
    expect(result.unverified).toBe(1);
  });

  it("lets an explicit override include the overlapping person and nobody else", () => {
    const result = run(true);
    expect(result.recipients.map((contact) => contact.email)).toContain("overlap@example.com");
    expect(result.recipients.map((contact) => contact.email)).not.toContain("bruce@anywhere.com");
    expect(result.overlapHeld).toBe(0);
  });
});
