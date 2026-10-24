/**
 * Template editor actions: assign, swap, clear, trim, animation point, text.
 * Coverage follows the render engine's drop and reuse rules.
 */

import {
  planFolderCoverage,
  planMappedCoverage,
  templateById,
  trackForTemplate,
  type VideoTemplate,
} from "@shared/studioVideoTemplates";

export interface SlotEdit {
  sourceIds: string[];
  inPoint: number;
  outPoint: number;
  point: number | null;
}

export interface TemplateEditorState {
  templateId: string | null;
  size: "1080x1920" | "1920x1080";
  musicId: string;
  text: Record<string, string>;
  slots: Record<string, SlotEdit>;
  logoName: string | null;
}

export type TemplateEditorAction =
  | { type: "select-template"; templateId: string }
  | { type: "assign"; slotId: string; sourceId: string; duration: number; index?: number }
  | { type: "clear"; slotId: string }
  | { type: "swap"; slotId: string; direction: -1 | 1 }
  | { type: "trim"; slotId: string; inPoint: number; outPoint: number }
  | { type: "set-point"; slotId: string; point: number }
  | { type: "auto-point"; slotId: string }
  | { type: "set-text"; layerId: string; text: string }
  | { type: "set-music"; musicId: string }
  | { type: "set-size"; size: "1080x1920" | "1920x1080" }
  | { type: "set-logo"; name: string | null }
  | { type: "import-all"; sourceIds: string[]; durations: Record<string, number> };

export function emptyTemplateEditor(): TemplateEditorState {
  return { templateId: null, size: "1080x1920", musicId: "heartbeat_mixkit1000", text: {}, slots: {}, logoName: null };
}

export function templateEditorReducer(state: TemplateEditorState, action: TemplateEditorAction): TemplateEditorState {
  switch (action.type) {
    case "select-template": {
      if (!action.templateId) return emptyTemplateEditor();
      const template = templateById(action.templateId);
      if (!template) return state;
      const text: Record<string, string> = {};
      for (const layer of template.layers ?? []) {
        if (layer.type === "text") text[layer.id] = layer.text || "";
      }
      return {
        ...emptyTemplateEditor(),
        templateId: template.id,
        musicId: trackForTemplate(template).id,
        text,
        size: "1080x1920",
      };
    }
    case "assign": {
      const current = state.slots[action.slotId] ?? { sourceIds: [], inPoint: 0, outPoint: action.duration, point: null };
      const sourceIds = [...current.sourceIds];
      const index = action.index ?? 0;
      sourceIds[index] = action.sourceId;
      return {
        ...state,
        slots: {
          ...state.slots,
          [action.slotId]: {
            sourceIds,
            inPoint: 0,
            outPoint: action.duration > 0 ? action.duration : current.outPoint || action.duration,
            point: null,
          },
        },
      };
    }
    case "clear": {
      const slots = { ...state.slots };
      delete slots[action.slotId];
      return { ...state, slots };
    }
    case "swap": {
      const template = currentTemplate(state);
      if (!template) return state;
      const ids = template.slots.map((slot) => slot.id);
      const index = ids.indexOf(action.slotId);
      const next = index + action.direction;
      if (index < 0 || next < 0 || next >= ids.length) return state;
      const slots = { ...state.slots };
      const a = slots[ids[index]];
      const b = slots[ids[next]];
      if (a) slots[ids[next]] = a;
      else delete slots[ids[next]];
      if (b) slots[ids[index]] = b;
      else delete slots[ids[index]];
      return { ...state, slots };
    }
    case "trim": {
      const current = state.slots[action.slotId] ?? { sourceIds: [], inPoint: 0, outPoint: 20, point: null };
      const inPoint = Math.max(0, Math.min(action.inPoint, action.outPoint - 0.05));
      const outPoint = Math.max(inPoint + 0.05, action.outPoint);
      let point = current.point;
      if (point != null) point = Math.min(Math.max(point, inPoint), outPoint);
      return { ...state, slots: { ...state.slots, [action.slotId]: { ...current, inPoint, outPoint, point } } };
    }
    case "set-point": {
      const current = state.slots[action.slotId] ?? { sourceIds: [], inPoint: 0, outPoint: Math.max(20, action.point), point: null };
      const point = Math.min(Math.max(action.point, current.inPoint), current.outPoint);
      return { ...state, slots: { ...state.slots, [action.slotId]: { ...current, point } } };
    }
    case "auto-point": {
      const current = state.slots[action.slotId];
      if (!current) return state;
      return { ...state, slots: { ...state.slots, [action.slotId]: { ...current, point: null } } };
    }
    case "set-text":
      return { ...state, text: { ...state.text, [action.layerId]: action.text } };
    case "set-music":
      return { ...state, musicId: action.musicId };
    case "set-size":
      return { ...state, size: action.size };
    case "set-logo":
      return { ...state, logoName: action.name };
    case "import-all": {
      const template = currentTemplate(state);
      if (!template || !action.sourceIds.length) return state;
      const plan = planFolderCoverage(template, action.sourceIds.length);
      const slots: Record<string, SlotEdit> = {};
      const assigned: string[] = [];
      for (const slot of template.slots) {
        if (plan.dropped.includes(slot.id)) continue;
        const sourceAt = plan.sourceIndex[slot.id];
        const sourceId = sourceAt == null
          ? assigned[assigned.length - 1]
          : action.sourceIds[Math.min(sourceAt, action.sourceIds.length - 1)];
        if (!sourceId) continue;
        assigned.push(sourceId);
        const duration = action.durations[sourceId] || 10;
        slots[slot.id] = { sourceIds: [sourceId], inPoint: 0, outPoint: duration, point: null };
      }
      return { ...state, slots };
    }
    default:
      return state;
  }
}

export function currentTemplate(state: TemplateEditorState): VideoTemplate | null {
  return state.templateId ? templateById(state.templateId) : null;
}

export function templateCoverage(state: TemplateEditorState): { message: string; dropped: string[]; reused: number } {
  const template = currentTemplate(state);
  if (!template) return { message: "", dropped: [], reused: 0 };
  const filled = new Set(Object.entries(state.slots).filter(([, slot]) => slot.sourceIds.some(Boolean)).map(([id]) => id));
  const plan = planMappedCoverage(template, filled);
  return { message: plan.message, dropped: plan.dropped, reused: plan.reused };
}
