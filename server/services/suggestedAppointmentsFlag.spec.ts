import { afterEach, describe, expect, it } from "vitest";
import {
  resetSuggestedAppointmentsCache,
  suggestedAppointmentsAreEnabled,
} from "./suggestedAppointmentsFlag";

afterEach(() => {
  resetSuggestedAppointmentsCache();
});

describe("suggested appointments flag", () => {
  it("uses the stored admin setting when the env flag is unset", async () => {
    await expect(suggestedAppointmentsAreEnabled({}, async () => false)).resolves.toBe(false);
    resetSuggestedAppointmentsCache();
    await expect(suggestedAppointmentsAreEnabled({}, async () => undefined)).resolves.toBe(true);
  });

  it("lets the env flag force the feature off without reading the setting", async () => {
    let reads = 0;
    const enabled = await suggestedAppointmentsAreEnabled(
      { SUGGESTED_APPOINTMENTS_ENABLED: "false" },
      async () => {
        reads += 1;
        return true;
      },
    );
    expect(enabled).toBe(false);
    expect(reads).toBe(0);
  });
});