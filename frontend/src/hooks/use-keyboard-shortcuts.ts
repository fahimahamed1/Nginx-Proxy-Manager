// Global keyboard shortcut registration for focus search and open create

type ShortcutHandler = () => void;

const handlers = {
  focusSearch: null as ShortcutHandler | null,
  openCreate: null as ShortcutHandler | null,
};

export function registerShortcutHandler(type: "focusSearch" | "openCreate", handler: ShortcutHandler | null) {
  handlers[type] = handler;
}

export function getShortcutHandler(type: "focusSearch" | "openCreate"): ShortcutHandler | null {
  return handlers[type];
}
