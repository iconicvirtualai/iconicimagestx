/**
 * Studio video templates.
 * Slot timing, speed curves, coverage, and the animation-point window match
 * workers/video-render/templates_engine/render.py. Transitions stay rigid.
 */

import { z } from "zod";
import agentIntro from "./videoTemplates/agent_intro_tour.json";
import glamping from "./videoTemplates/glamping_whip_tour.json";
import luxury from "./videoTemplates/luxury_slow_glide.json";
import social from "./videoTemplates/social_teaser_15.json";
import twilight from "./videoTemplates/twilight_aerial_drone.json";

const rampSchema = z.object({
  peak: z.number().optional(),
  beats: z.number().optional(),
}).passthrough();

const speedSchema = z.object({
  base: z.number().optional(),
  auto_ramps: z.boolean().optional(),
  curve: z.string().optional(),
  edge: z.number().optional(),
  in_ramp: rampSchema.optional(),
  out_ramp: rampSchema.optional(),
}).passthrough();

const slotSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  kind: z.string().optional(),
  beats: z.number().positive().optional(),
  hit_beat: z.number().optional(),
  clips: z.number().int().positive().optional(),
  layout: z.string().optional(),
  optional: z.boolean().optional(),
  drop_priority: z.number().optional(),
  speed: speedSchema.optional(),
  out: z.object({
    type: z.string(),
    dir: z.string().optional(),
    beats: z.number().optional(),
    rot: z.number().optional(),
    zoom: z.number().optional(),
    hit: z.string().optional(),
    fallback: z.string().optional(),
  }).passthrough().optional(),
  effects: z.array(z.record(z.unknown())).optional(),
  point: z.string().optional(),
}).passthrough();

const layerSchema = z.object({
  type: z.enum(["text", "logo"]),
  id: z.string().min(1),
  label: z.string().optional(),
  style: z.string().optional(),
  text: z.string().optional(),
  font: z.string().optional(),
  slot: z.string().optional(),
  start_beat: z.number().optional(),
  end_beat: z.number().optional(),
  pos: z.array(z.number()).optional(),
  size: z.number().optional(),
  track: z.boolean().optional(),
  path: z.string().nullable().optional(),
}).passthrough();

export const videoTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().optional(),
  description: z.string().optional(),
  output: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    fps: z.number().positive(),
    alt_sizes: z.array(z.array(z.number())).optional(),
    crf: z.number().optional(),
  }).passthrough(),
  music: z.object({
    track: z.string(),
    bpm: z.number().positive(),
    beat_offset: z.number().optional(),
    start: z.number().optional(),
    first_cut_beat: z.number().optional(),
    fade_out_beats: z.number().optional(),
    gain: z.number().optional(),
    license: z.string().optional(),
  }).passthrough(),
  grade: z.record(z.unknown()).optional(),
  defaults: z.object({
    trans_beats: z.number().optional(),
    out: z.record(z.unknown()).optional(),
    speed: speedSchema.optional(),
    whip_out_ramp: rampSchema.optional(),
    whip_in_ramp: rampSchema.optional(),
  }).passthrough().optional(),
  slots: z.array(slotSchema).min(1),
  layers: z.array(layerSchema).optional(),
  sfx: z.record(z.unknown()).optional(),
  reuse_max_frac: z.number().optional(),
}).passthrough().superRefine((template, ctx) => {
  template.slots.forEach((slot, index) => {
    if (index > 0 && typeof slot.beats !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${slot.id} is missing beats`,
        path: ["slots", index, "beats"],
      });
    }
  });
});

export type VideoTemplate = z.infer<typeof videoTemplateSchema>;
export type TemplateSlot = VideoTemplate["slots"][number];
export type TemplateLayer = NonNullable<VideoTemplate["layers"]>[number];

export const templateJobRequestSchema = z.object({
  templateId: z.string().min(1),
  listingId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  slots: z.record(z.union([
    z.string().min(1),
    z.array(z.string().min(1)).min(1).max(3),
  ])),
  points: z.record(z.number().finite()).optional(),
  trims: z.record(z.object({
    in: z.number().min(0),
    out: z.number().positive(),
  })).optional(),
  text: z.record(z.string().max(240)).optional(),
  musicId: z.string().optional(),
  size: z.enum(["1080x1920", "1920x1080"]),
  logoPath: z.string().optional(),
});

export type TemplateJobRequest = z.infer<typeof templateJobRequestSchema>;

export const LICENSED_TRACKS = [
  {
    id: "heartbeat_mixkit1000",
    title: "I Can Hear Your Heartbeat",
    artist: "Michael Ramir C.",
    bpm: 123.05,
    file: "music/heartbeat_mixkit1000.mp3",
    license: "Mixkit Stock Music Free License",
  },
  {
    id: "offmymind_mixkit1210",
    title: "Can't Get You Off My Mind",
    artist: "Michael Ramir C.",
    bpm: 152,
    file: "music/offmymind_mixkit1210.mp3",
    license: "Mixkit Stock Music Free License",
  },
] as const;

export type LicensedTrackId = (typeof LICENSED_TRACKS)[number]["id"];

const WHIP = new Set(["whip", "mirror_whip", "zoom_through", "mask_wipe"]);

function loadTemplate(raw: unknown): VideoTemplate {
  return videoTemplateSchema.parse(raw);
}

export const VIDEO_TEMPLATES: readonly VideoTemplate[] = [
  loadTemplate(glamping),
  loadTemplate(luxury),
  loadTemplate(agentIntro),
  loadTemplate(social),
  loadTemplate(twilight),
];

export function templateById(id: string): VideoTemplate | null {
  return VIDEO_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function trackForTemplate(template: VideoTemplate) {
  const file = template.music.track;
  return LICENSED_TRACKS.find((track) => file.endsWith(track.file) || file.endsWith(track.id + ".mp3"))
    ?? LICENSED_TRACKS[0];
}

export function trackById(id: string | undefined) {
  return LICENSED_TRACKS.find((track) => track.id === id) ?? null;
}

/** Python 3 round: halves go to the even integer. */
export function pythonRound(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const floor = Math.floor(abs);
  const frac = abs - floor;
  if (Math.abs(frac - 0.5) < 1e-10) {
    return sign * (floor % 2 === 0 ? floor : floor + 1);
  }
  return sign * Math.round(abs);
}

function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export interface SpeedSpec {
  base?: number;
  auto_ramps?: boolean;
  curve?: string;
  edge?: number;
  in_ramp?: { peak?: number; beats?: number };
  out_ramp?: { peak?: number; beats?: number };
}

export function speedAt(spec: SpeedSpec, period: number, slotLength: number, dt: number): number {
  const base = spec.base ?? 1;
  let x = base;
  if (spec.curve === "slow_mid") {
    const u = Math.min(1, Math.max(0, dt / Math.max(slotLength, 1e-3)));
    const edge = spec.edge ?? 2.5;
    x = base * (1 + (edge - 1) * (1 - Math.sin(Math.PI * u)) ** 2);
  }
  const rampIn = spec.in_ramp;
  if (rampIn) {
    const length = (rampIn.beats ?? 0.6) * period;
    if (dt < length) {
      const k = dt > 0 ? 1 - smootherstep(dt / length) : 1;
      x = x + ((rampIn.peak ?? 2) * base - x) * k;
    }
  }
  const rampOut = spec.out_ramp;
  if (rampOut) {
    const length = (rampOut.beats ?? 0.75) * period;
    const remain = slotLength - dt;
    if (remain < length) {
      const k = remain > 0 ? 1 - smootherstep(remain / length) : 1;
      x = x + ((rampOut.peak ?? 2.4) * base - x) * k;
    }
  }
  return Math.max(0.05, x);
}

export function clipDemand(template: VideoTemplate): number {
  return template.slots.reduce((sum, slot) => sum + (slot.clips ?? 1), 0);
}

export interface SlotTiming {
  id: string;
  index: number;
  label: string;
  kind: string;
  beats: number;
  seconds: number;
  t0: number;
  t1: number;
  optional: boolean;
  clips: number;
  layout: string | null;
  outType: string;
  outDir: string | null;
  relMin: number;
  relMax: number;
  hitBeat: number;
}

export interface TemplateTiming {
  total: number;
  period: number;
  phase: number;
  bpm: number;
  fps: number;
  slots: SlotTiming[];
}

function beatPeriod(bpm: number): number {
  return 60 / bpm;
}

export function templateDuration(template: VideoTemplate, bpm?: number): number {
  return planTemplateTiming(template, bpm).total;
}

function resolvedOut(template: VideoTemplate, slot: TemplateSlot, last: boolean): { type: string; dir?: string; beats?: number } {
  if (last) return { type: "none" };
  const defaults = (template.defaults?.out ?? { type: "cut" }) as { type?: string; dir?: string; beats?: number };
  return { ...defaults, ...(slot.out ?? {}), type: slot.out?.type ?? defaults.type ?? "cut" };
}

function resolvedSpeed(
  template: VideoTemplate,
  slot: TemplateSlot,
  outType: string,
  previousOut: string | null,
): SpeedSpec {
  const defaults = template.defaults?.speed ?? {};
  const spec: SpeedSpec = { ...defaults, ...(slot.speed ?? {}) };
  if (spec.auto_ramps !== false) {
    if (WHIP.has(outType) && !spec.out_ramp) {
      spec.out_ramp = template.defaults?.whip_out_ramp ?? { peak: 2.2, beats: 0.6 };
    }
    if (previousOut && WHIP.has(previousOut) && !spec.in_ramp) {
      spec.in_ramp = template.defaults?.whip_in_ramp ?? { peak: 2, beats: 0.5 };
    }
  }
  return spec;
}

export function planTemplateTiming(template: VideoTemplate, bpm?: number): TemplateTiming {
  const fps = template.output.fps || 60;
  const tempo = bpm ?? template.music.bpm;
  const period = beatPeriod(tempo);
  const phase = (template.music.beat_offset ?? 0) % period;
  const btime = (beat: number) => phase + beat * period;
  const first = template.music.first_cut_beat ?? 4;
  const cuts = [0];
  const beatPos: Array<number | null> = [null];
  template.slots.forEach((slot, index) => {
    const beat = index === 0 ? first : (beatPos[beatPos.length - 1] as number) + (slot.beats as number);
    beatPos.push(beat);
    cuts.push(pythonRound(btime(beat) * fps) / fps);
  });
  const transitionFrames: number[] = [];
  const outs = template.slots.map((slot, index) => resolvedOut(template, slot, index === template.slots.length - 1));
  outs.forEach((out) => {
    let frames = out.type === "cut" || out.type === "none"
      ? 0
      : pythonRound((out.beats ?? template.defaults?.trans_beats ?? 0.4) * period * fps);
    if (frames) frames = Math.max(frames, 2);
    frames += frames % 2;
    transitionFrames.push(frames);
  });
  const slots: SlotTiming[] = template.slots.map((slot, index) => {
    const t0 = cuts[index];
    const t1 = cuts[index + 1];
    const length = t1 - t0;
    const incoming = index ? transitionFrames[index - 1] : 0;
    const outgoing = transitionFrames[index];
    const start = t0 - incoming / 2 / fps;
    const end = t1 + outgoing / 2 / fps;
    const spec = resolvedSpeed(template, slot, outs[index].type, index ? outs[index - 1].type : null);
    const hit = t0 + (slot.hit_beat ?? 0) * period;
    const n0 = pythonRound(start * fps);
    const n1 = pythonRound(end * fps);
    const rel: number[] = [];
    let acc = 0;
    for (let frame = n0; frame < n1; frame += 1) {
      acc += speedAt(spec, period, length, frame / fps - t0) / fps;
      rel.push(acc);
    }
    const hitIndex = Math.max(0, Math.min(rel.length - 1, pythonRound((hit - start) * fps)));
    const base = rel[hitIndex] ?? 0;
    const shifted = rel.map((value) => value - base);
    const beats = index === 0 ? first : (slot.beats as number);
    return {
      id: slot.id,
      index,
      label: slot.label || slot.id,
      kind: slot.kind || "clip",
      beats,
      seconds: length,
      t0,
      t1,
      optional: Boolean(slot.optional),
      clips: slot.clips ?? 1,
      layout: slot.layout ?? null,
      outType: outs[index].type,
      outDir: outs[index].dir ?? null,
      relMin: shifted.length ? Math.min(...shifted) : 0,
      relMax: shifted.length ? Math.max(...shifted) : length,
      hitBeat: slot.hit_beat ?? 0,
    };
  });
  return { total: cuts[cuts.length - 1], period, phase, bpm: tempo, fps, slots };
}

export interface AnimationWindow {
  point: number;
  scale: number;
  windowStart: number;
  windowEnd: number;
  note: string;
  auto: boolean;
}

export interface MotionAnalysis {
  duration: number;
  rate: number;
  mag: number[];
  sharp?: number[];
}

/**
 * Fit the slot's source window inside the user's in/out trim.
 * A 20s clip trimmed to seconds 4–14 keeps the animation point, and the
 * frames the slot needs, inside that range. The slot length stays fixed.
 */
export function fitAnimationPoint(input: {
  inPoint: number;
  outPoint: number;
  relMin: number;
  relMax: number;
  userPoint: number | null;
  analysis?: MotionAnalysis | null;
  used?: Array<[number, number]>;
}): AnimationWindow {
  const inPoint = Math.max(0, input.inPoint);
  const outPoint = Math.max(inPoint + 0.05, input.outPoint);
  const span = outPoint - inPoint;
  const margin = Math.min(0.06, span / 10);
  const need = Math.max(0.05, input.relMax - input.relMin);
  const avail = span - 2 * margin;
  let scale = 1;
  if (need > avail) scale = Math.max(0.35, avail / Math.max(need, 1e-6));
  let loOk = inPoint + margin - input.relMin * scale;
  let hiOk = outPoint - margin - input.relMax * scale;
  if (hiOk < loOk) {
    const point = (loOk + hiOk) / 2;
    return windowFrom(point, scale, input, "clip too short: holding ends", input.userPoint == null);
  }
  if (input.userPoint != null && Number.isFinite(input.userPoint)) {
    const point = Math.min(Math.max(input.userPoint, loOk), hiOk);
    const note = Math.abs(point - input.userPoint) < 1e-3
      ? ""
      : `point moved ${input.userPoint.toFixed(2)}->${point.toFixed(2)}s to fit`;
    return windowFrom(point, scale, input, note, false);
  }
  const analysis = input.analysis;
  if (!analysis || !analysis.mag.length) {
    return windowFrom((loOk + hiOk) / 2, scale, input, "auto: center of the trimmed range", true);
  }
  const rate = analysis.rate || 10;
  const mag = analysis.mag;
  const sharp = analysis.sharp ?? [];
  const median = medianOf(sharp.length ? sharp : [1]);
  let best = -1e9;
  let picked = loOk;
  const used = input.used ?? [];
  for (let point = loOk; point <= hiOk + 1e-6; point += 0.05) {
    const a = point + input.relMin * scale;
    const b = point + input.relMax * scale;
    const i0 = Math.max(0, Math.floor(a * rate));
    const i1 = Math.min(mag.length, Math.max(i0 + 1, Math.floor(b * rate)));
    const slice = mag.slice(i0, i1);
    const sharpSlice = sharp.slice(i0, i1);
    const meanMag = slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : 0;
    const meanSharp = sharpSlice.length
      ? sharpSlice.reduce((sum, value) => sum + Math.min(1.5, Math.max(0.3, value / (median + 1e-6))), 0) / sharpSlice.length
      : 1;
    let score = meanMag * meanSharp ** 0.4;
    if (slice.length > 2) {
      const diffs: number[] = [];
      for (let i = 1; i < slice.length; i += 1) diffs.push(slice[i] - slice[i - 1]);
      score -= 0.6 * stddev(diffs);
    }
    if (a < inPoint + 0.25) score -= 0.05 * (inPoint + 0.25 - a);
    for (const [ua, ub] of used) {
      const overlap = Math.max(0, Math.min(b, ub) - Math.max(a, ua));
      score -= 2 * overlap / Math.max(need, 1e-3);
    }
    if (score > best) {
      best = score;
      picked = point;
    }
  }
  return windowFrom(picked, scale, input, "", true);
}

function windowFrom(
  point: number,
  scale: number,
  input: { relMin: number; relMax: number },
  note: string,
  auto: boolean,
): AnimationWindow {
  return {
    point,
    scale,
    windowStart: point + input.relMin * scale,
    windowEnd: point + input.relMax * scale,
    note,
    auto,
  };
}

function medianOf(values: number[]): number {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export interface CoveragePlan {
  dropped: string[];
  reused: number;
  active: string[];
  message: string;
  /** Folder mode: source index per active slot, or null when that slot reuses another. */
  sourceIndex: Record<string, number | null>;
}

export function coverageMessage(dropped: number, reused: number): string {
  const skip = dropped === 1 ? "1 optional slot will be skipped" : `${dropped} optional slots will be skipped`;
  const reuse = reused === 1 ? "1 slot will reuse a clip" : `${reused} slots will reuse clips`;
  if (dropped && reused) return `${skip}; ${reuse}`;
  if (dropped) return `${skip}.`;
  if (reused) return `${reuse}.`;
  return "Every slot has its own clip.";
}

type WorkingSlot = TemplateSlot & { _reuse?: boolean; _source?: number | null };

export function planFolderCoverage(template: VideoTemplate, clipCount: number, keepAll = false): CoveragePlan {
  const slots: WorkingSlot[] = template.slots.map((slot) => ({ ...slot }));
  const demand = (list: WorkingSlot[]) => list.reduce((sum, slot) => sum + (slot.clips ?? 1), 0);
  const dropped: WorkingSlot[] = [];
  const reuseMax = keepAll ? 0.99 : template.reuse_max_frac ?? 0.25;
  if (clipCount < demand(slots)) {
    const optional = slots.filter((slot) => slot.optional).sort((a, b) => (b.drop_priority ?? 1) - (a.drop_priority ?? 1));
    const budget = clipCount / Math.max(0.01, 1 - reuseMax);
    for (const slot of optional) {
      if (demand(slots.filter((item) => !dropped.includes(item))) <= budget) break;
      dropped.push(slot);
    }
  }
  const active = slots.filter((slot) => !dropped.includes(slot));
  const sideReuse = new Set<string>();
  if (clipCount < demand(active)) {
    for (const slot of active) {
      if ((slot.clips ?? 1) > 1 && clipCount < demand(active) * (1 - reuseMax) - sideReuse.size * 2) {
        sideReuse.add(slot.id);
      }
    }
  }
  const need = active.reduce((sum, slot) => sum + (sideReuse.has(slot.id) ? 1 : (slot.clips ?? 1)), 0);
  const reuseCount = Math.max(0, need - clipCount);
  const candidates = active
    .map((slot, index) => ({ slot, index }))
    .filter((item) => item.index >= 2 && item.index < active.length - 1 && (item.slot.clips ?? 1) === 1);
  const reuseIdx = new Set<number>();
  if (reuseCount && candidates.length) {
    const step = candidates.length / (reuseCount + 1);
    for (let j = 0; j < reuseCount; j += 1) {
      const picked = candidates[Math.min(candidates.length - 1, Math.floor(step * (j + 1)))];
      reuseIdx.add(picked.index);
    }
  }
  const sourceIndex: Record<string, number | null> = {};
  let cursor = 0;
  active.forEach((slot, index) => {
    if (reuseIdx.has(index)) {
      slot._reuse = true;
      sourceIndex[slot.id] = null;
      return;
    }
    const take = sideReuse.has(slot.id) ? 1 : (slot.clips ?? 1);
    sourceIndex[slot.id] = Math.min(cursor, Math.max(0, clipCount - 1));
    cursor += take;
    if (sideReuse.has(slot.id)) slot._reuse = true;
  });
  const reused = reuseIdx.size + 2 * sideReuse.size;
  const droppedIds = dropped.map((slot) => slot.id);
  return {
    dropped: droppedIds,
    reused,
    active: active.map((slot) => slot.id),
    message: coverageMessage(droppedIds.length, reused),
    sourceIndex,
  };
}

export function planMappedCoverage(template: VideoTemplate, filled: ReadonlySet<string>, keepAll = false): CoveragePlan {
  const active: TemplateSlot[] = [];
  const dropped: string[] = [];
  for (const slot of template.slots) {
    if (filled.has(slot.id)) active.push(slot);
    else if (slot.optional && !keepAll) dropped.push(slot.id);
    else active.push(slot);
  }
  const filledIndexes = active.map((slot, index) => (filled.has(slot.id) ? index : -1)).filter((index) => index >= 0);
  let reused = 0;
  const sourceIndex: Record<string, number | null> = {};
  active.forEach((slot) => {
    if (filled.has(slot.id)) sourceIndex[slot.id] = 0;
    else {
      sourceIndex[slot.id] = null;
      reused += 1;
    }
  });
  if (!filledIndexes.length) reused = 0;
  return {
    dropped,
    reused: filledIndexes.length ? reused : 0,
    active: active.map((slot) => slot.id),
    message: filledIndexes.length
      ? coverageMessage(dropped.length, reused)
      : "Add a clip to at least one slot.",
    sourceIndex,
  };
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  duration: number;
  clipCount: number;
  slotCount: number;
  optionalCount: number;
  bpm: number;
  musicId: string;
  previewUrl: null;
  slots: Array<{
    id: string;
    label: string;
    kind: string;
    beats: number;
    seconds: number;
    optional: boolean;
    clips: number;
    layout: string | null;
    outType: string;
    outDir: string | null;
  }>;
  layers: Array<{ id: string; type: string; label: string; text: string; slot: string }>;
}

export function summarizeTemplate(template: VideoTemplate): TemplateSummary {
  const timing = planTemplateTiming(template);
  const music = trackForTemplate(template);
  return {
    id: template.id,
    name: template.name,
    description: template.description || "",
    duration: round3(timing.total),
    clipCount: clipDemand(template),
    slotCount: template.slots.length,
    optionalCount: template.slots.filter((slot) => slot.optional).length,
    bpm: template.music.bpm,
    musicId: music.id,
    previewUrl: null,
    slots: timing.slots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      kind: slot.kind,
      beats: slot.beats,
      seconds: round3(slot.seconds),
      optional: slot.optional,
      clips: slot.clips,
      layout: slot.layout,
      outType: slot.outType,
      outDir: slot.outDir,
    })),
    layers: (template.layers ?? [])
      .filter((layer) => layer.type === "text")
      .map((layer) => ({
        id: layer.id,
        type: layer.type,
        label: layer.label || layer.id,
        text: layer.text || "",
        slot: layer.slot || "",
      })),
  };
}

export function listTemplateSummaries(): TemplateSummary[] {
  return VIDEO_TEMPLATES.map(summarizeTemplate);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const DROPBOX_HOSTS = new Set(["dropbox.com", "www.dropbox.com", "dl.dropboxusercontent.com"]);

export function isDropboxFileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.pathname.includes("/scl/fo/") || url.pathname.includes("/sh/")) return false;
    return DROPBOX_HOSTS.has(url.hostname) || url.hostname.endsWith(".dropboxusercontent.com");
  } catch {
    return false;
  }
}

export function isDriveFileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return url.hostname === "drive.google.com" || url.hostname === "docs.google.com";
  } catch {
    return false;
  }
}

/** Clips must live on this listing, in the staff upload folder, or be an imported Drive/Dropbox file. */
export function clipReferenceAllowed(value: string, listingId: string): boolean {
  if (!value || value.includes("..") || value.startsWith("/") || value.includes("\\")) return false;
  if (value.startsWith(`studio-video/uploads/${listingId}/`)) return true;
  if (value.startsWith(`galleries/`) && value.includes(`/${listingId}/`)) return true;
  if (isDropboxFileUrl(value) || isDriveFileUrl(value)) return true;
  return false;
}

export function validateTemplateJob(input: unknown): { ok: true; request: TemplateJobRequest } | { ok: false; error: string } {
  const parsed = templateJobRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Invalid template job." };
  const request = parsed.data;
  if (!templateById(request.templateId)) return { ok: false, error: "Unknown template." };
  const entries = Object.entries(request.slots);
  if (!entries.length) return { ok: false, error: "Add a clip to at least one slot." };
  for (const [slotId, value] of entries) {
    const paths = Array.isArray(value) ? value : [value];
    for (const path of paths) {
      if (!clipReferenceAllowed(path, request.listingId)) {
        return { ok: false, error: `${slotId} must use this listing's media, the staff upload folder, Dropbox, or Google Drive.` };
      }
    }
  }
  if (request.trims) {
    for (const [slotId, trim] of Object.entries(request.trims)) {
      if (trim.out <= trim.in) return { ok: false, error: `${slotId} out point must be after the in point.` };
    }
  }
  return { ok: true, request };
}
