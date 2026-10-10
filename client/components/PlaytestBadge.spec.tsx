import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { PlaytestBadge } from "./PlaytestBadge";

describe("PlaytestBadge", () => {
  it("labels a playtest invoice TEST and stays quiet otherwise", () => {
    expect(renderToString(<PlaytestBadge record={{ playtest: true, total: 1 }} />)).toContain("TEST");
    expect(renderToString(<PlaytestBadge record={{ playtest: false, total: 1 }} />)).toBe("");
    expect(renderToString(<PlaytestBadge record={{ total: 1 }} />)).toBe("");
    expect(renderToString(<PlaytestBadge record={{ total: 1 }} links={{ order: { playtest: true } }} />)).toContain("TEST");
  });
});
