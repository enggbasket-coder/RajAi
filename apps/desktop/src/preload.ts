import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("trackwise", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setApiUrl: (url: string) => ipcRenderer.invoke("config:setApiUrl", url),
  login: (email: string, password: string) => ipcRenderer.invoke("auth:login", email, password),
  logout: () => ipcRenderer.invoke("auth:logout"),
  setOrganization: (id: string) => ipcRenderer.invoke("auth:setOrganization", id),
  api: (method: string, route: string, body?: unknown) => ipcRenderer.invoke("api", method, route, body),
  setTracking: (label: string, tracking: boolean) => ipcRenderer.invoke("tracking:set", label, tracking),
  setIdleThreshold: (minutes: number) => ipcRenderer.invoke("idle:setThreshold", minutes),
  resolveIdle: (choice: "keep" | "discard", idleSeconds: number) => ipcRenderer.invoke("idle:resolve", choice, idleSeconds),
  onIdle: (cb: (info: { idleSeconds: number; thresholdMinutes: number }) => void) => ipcRenderer.on("idle-detected", (_e, info) => cb(info)),
});
