/**
 * Trackwise Desktop Agent — minimal Electron timer.
 * The server is the source of truth: every start/stop/switch is an API call, and the
 * running state is re-fetched on launch so a restart never loses or duplicates time.
 * Idle detection uses powerMonitor.getSystemIdleTime() only (no keystrokes, no content).
 */
import { app, BrowserWindow, ipcMain, powerMonitor, Tray, Menu, nativeImage } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

interface Config { apiUrl: string; token: string | null; organizationId: string | null }

const configPath = () => path.join(app.getPath("userData"), "config.json");
function loadConfig(): Config {
  try {
    return { apiUrl: "http://localhost:3000", token: null, organizationId: null, ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
  } catch {
    return { apiUrl: process.env.TRACKWISE_API_URL || "http://localhost:3000", token: null, organizationId: null };
  }
}
function saveConfig(c: Config) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(c));
}

let config = loadConfig();
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let idlePromptOpen = false;
let idleThresholdSeconds = 600;
let tracking = false;

async function api(method: string, route: string, body?: unknown) {
  const res = await fetch(`${config.apiUrl}${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      ...(config.organizationId ? { "x-organization-id": config.organizationId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function updateTray(label: string, isTracking: boolean) {
  tracking = isTracking;
  if (!tray) return;
  tray.setToolTip(`Trackwise — ${label}`);
  tray.setTitle(isTracking ? `● ${label}` : "");
  tray.setContextMenu(Menu.buildFromTemplate([{ label: isTracking ? `Tracking: ${label}` : "Not tracking", enabled: false }, { type: "separator" }, { label: "Open Trackwise", click: () => win?.show() }, { label: "Quit", click: () => app.quit() }]));
}

function startIdleWatch() {
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    if (!tracking || idlePromptOpen) return;
    const idle = powerMonitor.getSystemIdleTime(); // seconds without keyboard/mouse input — aggregate only
    if (idle >= idleThresholdSeconds) {
      idlePromptOpen = true;
      win?.show();
      win?.webContents.send("idle-detected", { idleSeconds: idle, thresholdMinutes: Math.round(idleThresholdSeconds / 60) });
    }
  }, 15_000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 640,
    title: "Trackwise",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.on("close", (e) => {
    if (tracking) {
      e.preventDefault();
      win?.hide(); // keep the visible tray indicator while tracking
    }
  });
}

app.whenReady().then(() => {
  const icon = nativeImage.createEmpty();
  try {
    tray = new Tray(icon);
    updateTray("Not tracking", false);
  } catch {
    tray = null;
  }
  createWindow();
  startIdleWatch();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("config:get", () => ({ apiUrl: config.apiUrl, loggedIn: !!config.token, organizationId: config.organizationId }));
ipcMain.handle("config:setApiUrl", (_e, url: string) => {
  config = { ...config, apiUrl: url.replace(/\/$/, "") };
  saveConfig(config);
});
ipcMain.handle("auth:login", async (_e, email: string, password: string) => {
  const data = await api("POST", "/api/auth/login", { email, password, client: "desktop" });
  config = { ...config, token: data.token, organizationId: data.organizations[0]?.id ?? null };
  saveConfig(config);
  return data;
});
ipcMain.handle("auth:logout", async () => {
  try {
    await api("POST", "/api/auth/logout");
  } catch {
    /* ignore */
  }
  config = { ...config, token: null };
  saveConfig(config);
});
ipcMain.handle("auth:setOrganization", (_e, id: string) => {
  config = { ...config, organizationId: id };
  saveConfig(config);
});
ipcMain.handle("api", async (_e, method: string, route: string, body?: unknown) => api(method, route, body));
ipcMain.handle("tracking:set", (_e, label: string, isTracking: boolean) => updateTray(label, isTracking));
ipcMain.handle("idle:setThreshold", (_e, minutes: number) => {
  idleThresholdSeconds = Math.max(60, minutes * 60);
});
ipcMain.handle("idle:resolve", async (_e, choice: "keep" | "discard", idleSeconds: number) => {
  idlePromptOpen = false;
  if (choice === "discard") {
    // Discarding = stop the timer at (now - idle). The server computes the entry; nothing is deleted silently.
    await api("POST", "/api/timer/stop", { discardIdleSeconds: idleSeconds });
    return { stopped: true };
  }
  return { stopped: false };
});
