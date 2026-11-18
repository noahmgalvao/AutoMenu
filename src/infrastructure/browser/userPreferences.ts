export const loadUserPreferences = <T extends Record<string, boolean>>(key: string, defaults: T): T => {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(defaults).map(([name, fallback]) => [name, typeof parsed[name] === 'boolean' ? parsed[name] : fallback]),
    ) as T;
  } catch {
    return defaults;
  }
};

export const saveUserPreferences = (key: string, preferences: Record<string, boolean>) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    // Preferences are optional when browser storage is unavailable.
  }
};
