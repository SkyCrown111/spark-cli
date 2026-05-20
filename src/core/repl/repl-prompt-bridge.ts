/**
 * REPL modal prompt bridge — routes stdin keypress to permission menus
 * without spawning a second readline interface.
 */

export interface ReplKeypress {
  name?: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export type ReplModalKeyHandler = (
  chunk: string | undefined,
  key: ReplKeypress,
) => boolean;

let modalHandler: ReplModalKeyHandler | null = null;
let modalHooks: { onOpen?: () => void; onClose?: () => void } = {};

export function registerReplModalHooks(hooks: {
  onOpen?: () => void;
  onClose?: () => void;
}): void {
  modalHooks = hooks;
}

export function setReplModalHandler(handler: ReplModalKeyHandler | null): void {
  if (handler && !modalHandler) modalHooks.onOpen?.();
  if (!handler && modalHandler) modalHooks.onClose?.();
  modalHandler = handler;
}

/** Returns true when a modal consumed the key. */
export function dispatchReplModalKey(
  chunk: string | undefined,
  key: ReplKeypress,
): boolean {
  return modalHandler?.(chunk, key) ?? false;
}

/** Force-clear a stuck permission menu handler (safe if none active). */
export function clearReplModalHandler(): void {
  setReplModalHandler(null);
}
