import { STORE_KEY, defaultState } from "./data.js";

const STATE_API = "./api/state";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return clone(defaultState);
    return hydrate(JSON.parse(raw));
  } catch (error) {
    console.warn("Unable to load saved state", error);
    return clone(defaultState);
  }
}

export function saveState(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  saveServerState(state);
}

export function resetState() {
  localStorage.removeItem(STORE_KEY);
  saveServerState(defaultState);
  return clone(defaultState);
}

export async function loadServerState() {
  try {
    const response = await fetch(STATE_API, { cache: "no-store" });
    if (!response.ok || response.status === 204) return null;
    return hydrate(await response.json());
  } catch (error) {
    console.warn("Unable to load server state", error);
    return null;
  }
}

export async function saveServerState(state) {
  try {
    await fetch(STATE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
  } catch (error) {
    console.warn("Unable to save server state", error);
  }
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hydrate(saved) {
  const fresh = clone(defaultState);
  return {
    settings: { ...fresh.settings, ...(saved.settings || {}) },
    suites: hydrateSuites(saved.suites, fresh.suites),
    reservations: Array.isArray(saved.reservations) ? saved.reservations : fresh.reservations,
    breakfasts: Array.isArray(saved.breakfasts) ? saved.breakfasts : fresh.breakfasts,
    tasks: Array.isArray(saved.tasks) ? saved.tasks : fresh.tasks,
    events: Array.isArray(saved.events) ? saved.events : fresh.events,
    temperatures: hydrateTemperatures(saved.temperatures, fresh.temperatures),
    services: Array.isArray(saved.services) ? saved.services : fresh.services,
    messages: Array.isArray(saved.messages) ? saved.messages : fresh.messages
  };
}

function hydrateSuites(savedSuites, freshSuites) {
  if (!Array.isArray(savedSuites)) return freshSuites;

  return savedSuites.map(savedSuite => {
    const freshSuite = freshSuites.find(suite => Number(suite.id) === Number(savedSuite.id)) || {};
    return {
      ...freshSuite,
      ...savedSuite,
      clientLogin: {
        ...(freshSuite.clientLogin || {}),
        ...(savedSuite.clientLogin || {})
      }
    };
  });
}

function hydrateTemperatures(saved, fresh) {
  return {
    pool: { ...fresh.pool, ...(saved?.pool || {}) },
    air: { ...fresh.air, ...(saved?.air || {}) },
    sea: { ...fresh.sea, ...(saved?.sea || {}) },
    updatedAt: saved?.updatedAt || fresh.updatedAt || ""
  };
}

export function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
