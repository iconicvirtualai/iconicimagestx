import { describe, expect, it } from "vitest";
import {
  applyTimelineAction,
  createEmptyTimeline,
  projectDuration,
  rampSegments,
  RIGID_TRANSITIONS,
} from "./videoTimeline";

describe("timeline edits", () => {
  it("trims, reorders, splits, ramps, reverses, and grades without warp transitions", () => {
    expect(RIGID_TRANSITIONS).not.toContain("warp");
    expect(RIGID_TRANSITIONS).toContain("whip");
    let project = createEmptyTimeline();
    project = applyTimelineAction(project, { type: "add-video", trackId: "v1", sourceId: "a", name: "Arrival", duration: 20 });
    project = applyTimelineAction(project, { type: "add-video", trackId: "v1", sourceId: "b", name: "Kitchen", duration: 8 });
    const first = project.tracks[0].clips?.[0];
    const second = project.tracks[0].clips?.[1];
    expect(first && second).toBeTruthy();
    if (!first || !second) return;
    project = applyTimelineAction(project, { type: "trim-video", clipId: first.id, inPoint: 4, outPoint: 14 });
    expect(project.tracks[0].clips?.[0]).toMatchObject({ inPoint: 4, outPoint: 14 });
    expect(project.tracks[0].clips?.[1].start).toBeCloseTo(20, 5);
    expect(projectDuration(project)).toBeCloseTo(28, 5);
    project = applyTimelineAction(project, { type: "reorder-video", trackId: "v1", clipId: second.id, direction: -1 });
    expect(project.tracks[0].clips?.[0].name).toBe("Kitchen");
    project = applyTimelineAction(project, { type: "split-video", clipId: project.tracks[0].clips?.[1].id || "", time: 12 });
    expect(project.tracks[0].clips).toHaveLength(3);
    const splitLeft = project.tracks[0].clips?.[1];
    expect(splitLeft?.outPoint).toBeLessThan(14);
    project = applyTimelineAction(project, {
      type: "set-ramp",
      clipId: splitLeft?.id || "",
      ramp: [{ at: 0, speed: 1 }, { at: 1, speed: 2.2 }],
    });
    const segments = rampSegments(project.tracks[0].clips?.[1] as NonNullable<typeof splitLeft>);
    expect(segments.length).toBeGreaterThan(0);
    expect(Math.abs(segments[0].speed)).toBeCloseTo(1.6, 5);
    project = applyTimelineAction(project, { type: "toggle-reverse", clipId: splitLeft?.id || "" });
    expect(project.tracks[0].clips?.[1].reverse).toBe(true);
    project = applyTimelineAction(project, { type: "set-grade", clipId: splitLeft?.id || "", grade: { preset: "twilight", exposure: 0.2 } });
    expect(project.tracks[0].clips?.[1].grade.preset).toBe("twilight");
    project = applyTimelineAction(project, { type: "set-transition", clipId: splitLeft?.id || "", transition: "whip" });
    expect(project.tracks[0].clips?.[1].transitionIn).toBe("whip");
    project = applyTimelineAction(project, { type: "set-audio-mix", clipId: splitLeft?.id || "", mute: true, fadeIn: 0.2 });
    expect(project.tracks[0].clips?.[1].mute).toBe(true);
    project = applyTimelineAction(project, { type: "add-text", text: "Just Listed" });
    project = applyTimelineAction(project, { type: "add-shape", shape: "rect" });
    project = applyTimelineAction(project, { type: "add-audio", sourceId: "music", name: "Heartbeat", duration: 30 });
    expect(project.tracks.find((track) => track.type === "text")?.texts?.[0].text).toBe("Just Listed");
    expect(project.tracks.find((track) => track.type === "audio")?.audio?.[0].fadeOut).toBe(1);
  });
});
