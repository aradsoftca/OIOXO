/**
 * Image quick-edit actions — the contract between the chat's in-image edit surface
 * (IN_CHAT_STUDIO.md, Phase 1) and the existing image tools. Each action is a
 * one-tap edit on an image already in the conversation; the same tools the NL router
 * already reaches ("remove the background" -> image-remove-bg) power the buttons.
 *
 * feasibility: 'instant' = pure client-side pixel op · 'cv' = on-device computer
 * vision (heavier but still local) · 'manual' = opens the canvas editor for control.
 * Pure / Node-testable (validateActions checks every toolId is real).
 */
import { getTool } from '../registry';

export type EditFeasibility = 'instant' | 'cv' | 'manual';
export type EditValue = 'amount' | 'angle' | 'size' | 'text' | 'format' | 'none';

export interface EditAction {
  id: string;
  label: string;
  toolId: string;
  feasibility: EditFeasibility;
  /** What the UI must collect before running (a slider, a text box, …), if any. */
  needs: EditValue;
}

/** The default quick-action bar shown on an in-chat image, in display order. */
export const IMAGE_EDIT_ACTIONS: EditAction[] = [
  { id: 'remove-bg', label: 'Remove background', toolId: 'image-remove-bg', feasibility: 'cv', needs: 'none' },
  { id: 'crop', label: 'Crop', toolId: 'image-crop', feasibility: 'manual', needs: 'size' },
  { id: 'rotate', label: 'Rotate', toolId: 'image-rotate', feasibility: 'instant', needs: 'angle' },
  { id: 'flip', label: 'Flip', toolId: 'image-flip', feasibility: 'instant', needs: 'none' },
  { id: 'grayscale', label: 'B & W', toolId: 'image-grayscale', feasibility: 'instant', needs: 'none' },
  { id: 'brightness', label: 'Brightness', toolId: 'image-brightness', feasibility: 'instant', needs: 'amount' },
  { id: 'contrast', label: 'Contrast', toolId: 'image-contrast', feasibility: 'instant', needs: 'amount' },
  { id: 'blur', label: 'Blur', toolId: 'image-blur', feasibility: 'instant', needs: 'amount' },
  { id: 'sharpen', label: 'Sharpen', toolId: 'image-sharpen', feasibility: 'instant', needs: 'none' },
  { id: 'resize', label: 'Resize', toolId: 'image-resize', feasibility: 'instant', needs: 'size' },
  { id: 'compress', label: 'Compress', toolId: 'image-compress', feasibility: 'instant', needs: 'none' },
  { id: 'convert', label: 'Convert', toolId: 'image-convert-format', feasibility: 'instant', needs: 'format' },
  { id: 'watermark', label: 'Watermark', toolId: 'image-watermark', feasibility: 'instant', needs: 'text' },
  { id: 'add-text', label: 'Add text', toolId: 'image-add-text', feasibility: 'instant', needs: 'text' },
];

export function actionById(id: string): EditAction | undefined {
  return IMAGE_EDIT_ACTIONS.find((a) => a.id === id);
}

/** Verify every action maps to a real registry tool (run by image-edit-eval). */
export function validateActions(): { id: string; toolId: string; ok: boolean }[] {
  return IMAGE_EDIT_ACTIONS.map((a) => ({ id: a.id, toolId: a.toolId, ok: !!getTool(a.toolId) }));
}
