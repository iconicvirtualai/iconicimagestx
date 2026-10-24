/**
 * Free timeline project. Edits are rigid: trim, constant speed, segmented
 * speed ramps, reverse, grade, opacity, and whole-frame transitions.
 * No per-pixel warp.
 */

export type TimelineFps = 24 | 30 | 60;

export interface Grade {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  preset: GradePreset;
}

export type GradePreset = "none" | "teal_orange" | "twilight" | "clean" | "mono" | "warm" | "cool";

export const GRADE_PRESETS: readonly { id: GradePreset; label: string }[] = [
  { id: "none", label: "None" },
  { id: "teal_orange", label: "Teal and orange" },
  { id: "twilight", label: "Twilight" },
  { id: "clean", label: "Clean" },
  { id: "mono", label: "Black and white" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
];

export const RIGID_TRANSITIONS = [
  "none",
  "cut",
  "fade",
  "dip_black",
  "dip_white",
  "whip",
  "flash",
  "glitch",
  "zoom_through",
  "mask_wipe",
  "mirror_whip",
] as const;

export type RigidTransition = (typeof RIGID_TRANSITIONS)[number];

export interface SpeedKeyframe {
  at: number;
  speed: number;
}

export interface VideoClip {
  id: string;
  sourceId: string;
  name: string;
  inPoint: number;
  outPoint: number;
  start: number;
  speed: number;
  speedRamp: SpeedKeyframe[];
  reverse: boolean;
  grade: Grade;
  opacity: number;
  transitionIn: RigidTransition;
  mute: boolean;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface TextItem {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  size: number;
  color: string;
  font: "Inter" | "Sacramento" | "Georgia";
  animation: "none" | "fade" | "rise";
  opacity: number;
}

export interface ShapeItem {
  id: string;
  shape: "rect" | "ellipse";
  start: number;
  end: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity: number;
}

export interface OverlayItem {
  id: string;
  sourceId: string;
  name: string;
  start: number;
  end: number;
  x: number;
  y: number;
  w: number;
  opacity: number;
}

export interface AudioClip {
  id: string;
  sourceId: string;
  name: string;
  inPoint: number;
  outPoint: number;
  start: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface TimelineTrack {
  id: string;
  type: "video" | "overlay" | "text" | "shape" | "audio";
  name: string;
  z: number;
  clips?: VideoClip[];
  overlays?: OverlayItem[];
  texts?: TextItem[];
  shapes?: ShapeItem[];
  audio?: AudioClip[];
}

export interface TimelineProject {
  fps: TimelineFps;
  width: number;
  height: number;
  playhead: number;
  tracks: TimelineTrack[];
}

export function defaultGrade(): Grade {
  return { exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0, preset: "none" };
}

export function createEmptyTimeline(): TimelineProject {
  return {
    fps: 30,
    width: 1080,
    height: 1920,
    playhead: 0,
    tracks: [
      { id: "v1", type: "video", name: "Video 1", z: 1, clips: [] },
      { id: "v2", type: "video", name: "Video 2", z: 2, clips: [] },
      { id: "ov1", type: "overlay", name: "Overlays", z: 3, overlays: [] },
      { id: "tx1", type: "text", name: "Text", z: 4, texts: [] },
      { id: "sh1", type: "shape", name: "Shapes", z: 5, shapes: [] },
      { id: "a1", type: "audio", name: "Audio", z: 0, audio: [] },
    ],
  };
}

let seq = 1;
export function nextTimelineId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}`;
}

export function clipSourceLength(clip: Pick<VideoClip, "inPoint" | "outPoint">): number {
  return Math.max(0.05, clip.outPoint - clip.inPoint);
}

export function averageSpeed(clip: Pick<VideoClip, "speed" | "speedRamp">): number {
  if (clip.speedRamp.length >= 2) {
    const speeds = clip.speedRamp.map((key) => key.speed);
    return Math.max(0.05, speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length);
  }
  return Math.max(0.05, clip.speed || 1);
}

export function clipPlayLength(clip: VideoClip): number {
  return clipSourceLength(clip) / averageSpeed(clip);
}

export function projectDuration(project: TimelineProject): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips ?? []) end = Math.max(end, clip.start + clipPlayLength(clip));
    for (const item of track.texts ?? []) end = Math.max(end, item.end);
    for (const item of track.shapes ?? []) end = Math.max(end, item.end);
    for (const item of track.overlays ?? []) end = Math.max(end, item.end);
    for (const clip of track.audio ?? []) end = Math.max(end, clip.start + Math.max(0.05, clip.outPoint - clip.inPoint));
  }
  return end;
}

export function gradeCss(grade: Grade): string {
  const brightness = 1 + grade.exposure * 0.18;
  const hue = grade.temperature * 14 + grade.tint * 10;
  const extra = grade.preset === "mono"
    ? "grayscale(1)"
    : grade.preset === "teal_orange"
      ? "sepia(0.25) hue-rotate(-8deg)"
      : grade.preset === "twilight"
        ? "hue-rotate(12deg) brightness(0.92)"
        : grade.preset === "warm"
          ? "sepia(0.2)"
          : grade.preset === "cool"
            ? "hue-rotate(18deg)"
            : grade.preset === "clean"
              ? "contrast(1.04)"
              : "";
  return `brightness(${brightness.toFixed(3)}) contrast(${grade.contrast.toFixed(3)}) saturate(${grade.saturation.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg) ${extra}`.trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type TimelineAction =
  | { type: "set-playhead"; time: number }
  | { type: "set-frame"; width: number; height: number; fps: TimelineFps }
  | { type: "add-video"; trackId: string; sourceId: string; name: string; duration: number }
  | { type: "trim-video"; clipId: string; inPoint: number; outPoint: number }
  | { type: "move-video"; clipId: string; start: number }
  | { type: "reorder-video"; trackId: string; clipId: string; direction: -1 | 1 }
  | { type: "swap-video"; clipId: string; sourceId: string; name: string; duration: number }
  | { type: "split-video"; clipId: string; time: number }
  | { type: "delete-video"; clipId: string }
  | { type: "set-speed"; clipId: string; speed: number }
  | { type: "set-ramp"; clipId: string; ramp: SpeedKeyframe[] }
  | { type: "toggle-reverse"; clipId: string }
  | { type: "set-grade"; clipId: string; grade: Partial<Grade> }
  | { type: "set-opacity"; clipId: string; opacity: number }
  | { type: "set-transition"; clipId: string; transition: RigidTransition }
  | { type: "set-audio-mix"; clipId: string; mute?: boolean; volume?: number; fadeIn?: number; fadeOut?: number }
  | { type: "move-track"; trackId: string; direction: -1 | 1 }
  | { type: "add-text"; text?: string }
  | { type: "update-text"; id: string; patch: Partial<TextItem> }
  | { type: "delete-text"; id: string }
  | { type: "add-shape"; shape?: ShapeItem["shape"] }
  | { type: "update-shape"; id: string; patch: Partial<ShapeItem> }
  | { type: "delete-shape"; id: string }
  | { type: "add-overlay"; sourceId: string; name: string }
  | { type: "update-overlay"; id: string; patch: Partial<OverlayItem> }
  | { type: "delete-overlay"; id: string }
  | { type: "add-audio"; sourceId: string; name: string; duration: number }
  | { type: "update-audio"; id: string; patch: Partial<AudioClip> }
  | { type: "delete-audio"; id: string };

export function applyTimelineAction(project: TimelineProject, action: TimelineAction): TimelineProject {
  const next = structuredClone(project);
  switch (action.type) {
    case "set-playhead":
      next.playhead = Math.max(0, action.time);
      return next;
    case "set-frame":
      next.width = action.width;
      next.height = action.height;
      next.fps = action.fps;
      return next;
    case "add-video": {
      const track = videoTrack(next, action.trackId) ?? videoTrack(next);
      if (!track?.clips) return next;
      const end = track.clips.reduce((max, clip) => Math.max(max, clip.start + clipPlayLength(clip)), 0);
      track.clips.push({
        id: nextTimelineId("clip"),
        sourceId: action.sourceId,
        name: action.name,
        inPoint: 0,
        outPoint: Math.max(0.1, action.duration),
        start: end,
        speed: 1,
        speedRamp: [],
        reverse: false,
        grade: defaultGrade(),
        opacity: 1,
        transitionIn: "none",
        mute: false,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
      });
      return next;
    }
    case "trim-video": {
      const clip = findClip(next, action.clipId);
      if (!clip) return next;
      const inPoint = Math.max(0, action.inPoint);
      const outPoint = Math.max(inPoint + 0.05, action.outPoint);
      clip.inPoint = inPoint;
      clip.outPoint = outPoint;
      return next;
    }
    case "move-video": {
      const clip = findClip(next, action.clipId);
      if (!clip) return next;
      clip.start = Math.max(0, action.start);
      return next;
    }
    case "reorder-video": {
      const track = next.tracks.find((item) => item.id === action.trackId && item.clips);
      if (!track?.clips) return next;
      const index = track.clips.findIndex((clip) => clip.id === action.clipId);
      const swap = index + action.direction;
      if (index < 0 || swap < 0 || swap >= track.clips.length) return next;
      const [clip] = track.clips.splice(index, 1);
      track.clips.splice(swap, 0, clip);
      reflow(track.clips);
      return next;
    }
    case "swap-video": {
      const clip = findClip(next, action.clipId);
      if (!clip) return next;
      clip.sourceId = action.sourceId;
      clip.name = action.name;
      clip.inPoint = 0;
      clip.outPoint = Math.max(0.1, action.duration);
      return next;
    }
    case "split-video": {
      const located = findClipTrack(next, action.clipId);
      if (!located) return next;
      const { track, clip, index } = located;
      const play = clipPlayLength(clip);
      const local = action.time - clip.start;
      if (local <= 0.05 || local >= play - 0.05) return next;
      const speed = averageSpeed(clip);
      const originalIn = clip.inPoint;
      const originalOut = clip.outPoint;
      const sourceCut = clip.reverse
        ? originalOut - local * speed
        : originalIn + local * speed;
      const right: VideoClip = {
        ...structuredClone(clip),
        id: nextTimelineId("clip"),
        start: clip.start + local,
        transitionIn: "cut",
      };
      if (clip.reverse) {
        clip.inPoint = sourceCut;
        clip.outPoint = originalOut;
        right.inPoint = originalIn;
        right.outPoint = sourceCut;
      } else {
        clip.outPoint = sourceCut;
        right.inPoint = sourceCut;
        right.outPoint = originalOut;
      }
      track.clips?.splice(index + 1, 0, right);
      return next;
    }
    case "delete-video":
      for (const track of next.tracks) {
        if (!track.clips) continue;
        track.clips = track.clips.filter((clip) => clip.id !== action.clipId);
      }
      return next;
    case "set-speed": {
      const clip = findClip(next, action.clipId);
      if (!clip) return next;
      clip.speed = clamp(action.speed, 0.1, 8);
      return next;
    }
    case "set-ramp": {
      const clip = findClip(next, action.clipId);
      if (!clip) return next;
      clip.speedRamp = action.ramp
        .map((key) => ({ at: clamp(key.at, 0, 1), speed: clamp(key.speed, 0.1, 8) }))
        .sort((a, b) => a.at - b.at);
      return next;
    }
    case "toggle-reverse": {
      const clip = findClip(next, action.clipId);
      if (!clip) return next;
      clip.reverse = !clip.reverse;
      return next;
    }
    case "set-grade": {
      const clip = findClip(next, action.clipId);
      if (!clip) return next;
      clip.grade = { ...clip.grade, ...action.grade };
      clip.grade.exposure = clamp(clip.grade.exposure, -2, 2);
      clip.grade.contrast = clamp(clip.grade.contrast, 0.5, 2);
      clip.grade.saturation = clamp(clip.grade.saturation, 0, 2);
      clip.grade.temperature = clamp(clip.grade.temperature, -1, 1);
      clip.grade.tint = clamp(clip.grade.tint, -1, 1);
      return next;
    }
    case "set-opacity": {
      const clip = findClip(next, action.clipId);
      if (!clip) return next;
      clip.opacity = clamp(action.opacity, 0, 1);
      return next;
    }
    case "set-transition": {
      const clip = findClip(next, action.clipId);
      if (!clip || !RIGID_TRANSITIONS.includes(action.transition)) return next;
      clip.transitionIn = action.transition;
      return next;
    }
    case "set-audio-mix": {
      const clip = findClip(next, action.clipId);
      if (!clip) return next;
      if (action.mute != null) clip.mute = action.mute;
      if (action.volume != null) clip.volume = clamp(action.volume, 0, 1);
      if (action.fadeIn != null) clip.fadeIn = Math.max(0, action.fadeIn);
      if (action.fadeOut != null) clip.fadeOut = Math.max(0, action.fadeOut);
      return next;
    }
    case "move-track": {
      const index = next.tracks.findIndex((track) => track.id === action.trackId);
      const swap = index + action.direction;
      if (index < 0 || swap < 0 || swap >= next.tracks.length) return next;
      const [track] = next.tracks.splice(index, 1);
      next.tracks.splice(swap, 0, track);
      next.tracks.forEach((item, z) => {
        item.z = item.type === "audio" ? 0 : z + 1;
      });
      return next;
    }
    case "add-text": {
      const track = next.tracks.find((item) => item.type === "text");
      track?.texts?.push({
        id: nextTimelineId("text"),
        text: action.text || "Title",
        start: next.playhead,
        end: next.playhead + 3,
        x: 0.5,
        y: 0.42,
        size: 64,
        color: "#ffffff",
        font: "Inter",
        animation: "fade",
        opacity: 1,
      });
      return next;
    }
    case "update-text":
      return patchItem(next, "texts", action.id, action.patch);
    case "delete-text":
      return dropItem(next, "texts", action.id);
    case "add-shape": {
      const track = next.tracks.find((item) => item.type === "shape");
      track?.shapes?.push({
        id: nextTimelineId("shape"),
        shape: action.shape || "rect",
        start: next.playhead,
        end: next.playhead + 3,
        x: 0.1,
        y: 0.1,
        w: 0.8,
        h: 0.08,
        color: "#0d9488",
        opacity: 0.85,
      });
      return next;
    }
    case "update-shape":
      return patchItem(next, "shapes", action.id, action.patch);
    case "delete-shape":
      return dropItem(next, "shapes", action.id);
    case "add-overlay": {
      const track = next.tracks.find((item) => item.type === "overlay");
      track?.overlays?.push({
        id: nextTimelineId("overlay"),
        sourceId: action.sourceId,
        name: action.name,
        start: next.playhead,
        end: next.playhead + 4,
        x: 0.5,
        y: 0.82,
        w: 0.28,
        opacity: 1,
      });
      return next;
    }
    case "update-overlay":
      return patchItem(next, "overlays", action.id, action.patch);
    case "delete-overlay":
      return dropItem(next, "overlays", action.id);
    case "add-audio": {
      const track = next.tracks.find((item) => item.type === "audio");
      track?.audio?.push({
        id: nextTimelineId("audio"),
        sourceId: action.sourceId,
        name: action.name,
        inPoint: 0,
        outPoint: Math.max(0.1, action.duration),
        start: 0,
        volume: 0.8,
        fadeIn: 0.4,
        fadeOut: 1,
      });
      return next;
    }
    case "update-audio":
      return patchItem(next, "audio", action.id, action.patch);
    case "delete-audio":
      return dropItem(next, "audio", action.id);
    default:
      return next;
  }
}

function videoTrack(project: TimelineProject, id?: string): TimelineTrack | null {
  if (id) return project.tracks.find((track) => track.id === id && track.type === "video") ?? null;
  return project.tracks.find((track) => track.type === "video") ?? null;
}

function findClip(project: TimelineProject, id: string): VideoClip | null {
  return findClipTrack(project, id)?.clip ?? null;
}

function findClipTrack(project: TimelineProject, id: string): { track: TimelineTrack; clip: VideoClip; index: number } | null {
  for (const track of project.tracks) {
    const index = track.clips?.findIndex((clip) => clip.id === id) ?? -1;
    if (index >= 0 && track.clips) return { track, clip: track.clips[index], index };
  }
  return null;
}

function reflow(clips: VideoClip[]) {
  let cursor = 0;
  for (const clip of clips) {
    clip.start = cursor;
    cursor += clipPlayLength(clip);
  }
}

function patchItem<K extends "texts" | "shapes" | "overlays" | "audio">(
  project: TimelineProject,
  key: K,
  id: string,
  patch: Partial<NonNullable<TimelineTrack[K]>[number]>,
): TimelineProject {
  for (const track of project.tracks) {
    const list = track[key] as Array<{ id: string }> | undefined;
    const item = list?.find((entry) => entry.id === id);
    if (item) Object.assign(item, patch);
  }
  return project;
}

function dropItem(project: TimelineProject, key: "texts" | "shapes" | "overlays" | "audio", id: string): TimelineProject {
  for (const track of project.tracks) {
    const list = track[key] as Array<{ id: string }> | undefined;
    if (!list) continue;
    const next = list.filter((item) => item.id !== id);
    (track as TimelineTrack)[key] = next as never;
  }
  return project;
}

/** Segments of a speed ramp. Each segment plays at a constant speed so frames stay rigid. */
export function rampSegments(clip: VideoClip): Array<{ inPoint: number; outPoint: number; speed: number }> {
  const span = clipSourceLength(clip);
  if (clip.speedRamp.length < 2) {
    return [{ inPoint: clip.inPoint, outPoint: clip.outPoint, speed: clip.reverse ? -clip.speed : clip.speed }];
  }
  const keys = [...clip.speedRamp].sort((a, b) => a.at - b.at);
  const segments: Array<{ inPoint: number; outPoint: number; speed: number }> = [];
  for (let i = 0; i < keys.length - 1; i += 1) {
    const start = clip.inPoint + span * keys[i].at;
    const end = clip.inPoint + span * keys[i + 1].at;
    if (end - start < 0.02) continue;
    const speed = (keys[i].speed + keys[i + 1].speed) / 2;
    segments.push({
      inPoint: clip.reverse ? clip.outPoint - (end - clip.inPoint) : start,
      outPoint: clip.reverse ? clip.outPoint - (start - clip.inPoint) : end,
      speed: clip.reverse ? -Math.abs(speed) : speed,
    });
  }
  return segments.length ? segments : [{ inPoint: clip.inPoint, outPoint: clip.outPoint, speed: clip.speed }];
}
