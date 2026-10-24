/* global window, document */
const tw = window.trackwise;
const $ = (id) => document.getElementById(id);
let current = null; // { taskId, taskTitle, projectName, startedAt }
let serverOffset = 0;
let tickHandle = null;
let lastIdle = null;

function showError(msg) {
  const el = $("error");
  if (!msg) return el.classList.add("hidden");
  el.textContent = msg;
  el.classList.remove("hidden");
}
function fmt(s) {
  s = Math.max(0, Math.floor(s));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}
function tick() {
  if (!current) return ($("clock").textContent = "00:00:00");
  $("clock").textContent = fmt((Date.now() + serverOffset - new Date(current.startedAt).getTime()) / 1000);
}

async function syncTimer() {
  const data = await tw.api("GET", "/api/timer/current");
  serverOffset = new Date(data.serverTime).getTime() - Date.now();
  current = data.timer;
  const tracking = !!current;
  $("currentTask").textContent = tracking ? `${current.taskTitle} · ${current.projectName}` : "No timer running";
  $("indicator").classList.toggle("hidden", !tracking);
  $("stopBtn").classList.toggle("hidden", !tracking);
  tw.setTracking(tracking ? current.taskTitle : "Not tracking", tracking);
  tick();
}

async function loadTasks() {
  const { tasks } = await tw.api("GET", "/api/tasks?mine=1");
  const accepted = [];
  const pending = [];
  for (const t of tasks) {
    const mine = t.assignments.find((a) => a.userId === window.__userId);
    if (!mine || mine.status === "CANCELLED" || t.status === "COMPLETED" || t.status === "CANCELLED") continue;
    (mine.status === "ACCEPTED" ? accepted : pending).push({ task: t, assignment: mine });
  }
  $("tasks").innerHTML = accepted.length ? "" : '<div class="muted">No accepted tasks.</div>';
  for (const { task } of accepted) {
    const row = document.createElement("div");
    row.className = "task";
    const running = current && current.taskId === task.id;
    row.innerHTML = `<div><div class="t">${task.title}</div><div class="muted">${task.project.name}</div></div>`;
    const btn = document.createElement("button");
    btn.textContent = running ? "■ Stop" : current ? "⇄ Switch" : "▶ Start";
    btn.className = running ? "danger" : "primary";
    btn.onclick = async () => {
      try {
        if (running) await tw.api("POST", "/api/timer/stop", {});
        else await tw.api("POST", current ? "/api/timer/switch" : "/api/timer/start", { taskId: task.id, source: "DESKTOP" });
        await refresh();
      } catch (e) {
        showError(e.message);
      }
    };
    row.appendChild(btn);
    $("tasks").appendChild(row);
  }
  $("pending").innerHTML = pending.length ? "" : '<div class="muted">No pending assignments.</div>';
  for (const { task, assignment } of pending) {
    const row = document.createElement("div");
    row.className = "task";
    row.innerHTML = `<div><div class="t">${task.title}</div><div class="muted">${task.project.name}</div></div>`;
    const acc = document.createElement("button");
    acc.textContent = "Accept";
    acc.className = "primary";
    acc.onclick = async () => {
      try {
        await tw.api("POST", `/api/assignments/${assignment.id}/respond`, { action: "ACCEPT" });
        await refresh();
      } catch (e) {
        showError(e.message);
      }
    };
    row.appendChild(acc);
    $("pending").appendChild(row);
  }
}

async function refresh() {
  showError(null);
  try {
    await syncTimer();
    await loadTasks();
    const org = await tw.api("GET", "/api/organizations/current");
    tw.setIdleThreshold(org.organization.idleTimeoutMinutes);
    $("idleInfo").textContent = `Idle prompt after ${org.organization.idleTimeoutMinutes} min without input. Only aggregate idle duration is measured locally.`;
  } catch (e) {
    showError(e.message);
    if (/401|Not authenticated/.test(e.message)) showLogin();
  }
}

function showLogin() {
  $("login").classList.remove("hidden");
  $("app").classList.add("hidden");
}
async function showApp(user, organizations) {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  window.__userId = user.id;
  $("who").textContent = `${user.name}`;
  const sel = $("orgSelect");
  sel.innerHTML = "";
  for (const o of organizations) {
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = o.name;
    sel.appendChild(opt);
  }
  sel.onchange = async () => {
    await tw.setOrganization(sel.value);
    await refresh();
  };
  await refresh();
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tick, 1000);
  setInterval(() => syncTimer().catch(() => {}), 30000);
  setInterval(() => tw.api("POST", "/api/timer/heartbeat").catch(() => {}), 45000);
}

$("loginBtn").onclick = async () => {
  showError(null);
  try {
    await tw.setApiUrl($("apiUrl").value.trim());
    const data = await tw.login($("email").value.trim(), $("password").value);
    await showApp(data.user, data.organizations);
  } catch (e) {
    showError(e.message);
  }
};
$("logoutBtn").onclick = async () => {
  await tw.logout();
  showLogin();
};
$("stopBtn").onclick = async () => {
  try {
    await tw.api("POST", "/api/timer/stop", {});
    await refresh();
  } catch (e) {
    showError(e.message);
  }
};
$("refreshBtn").onclick = refresh;
$("keepIdle").onclick = async () => {
  $("idleModal").classList.add("hidden");
  await tw.resolveIdle("keep", lastIdle.idleSeconds);
};
$("discardIdle").onclick = async () => {
  $("idleModal").classList.add("hidden");
  try {
    await tw.resolveIdle("discard", lastIdle.idleSeconds);
  } catch (e) {
    showError(e.message);
  }
  await refresh();
};
tw.onIdle((info) => {
  lastIdle = info;
  $("idleMin").textContent = String(info.thresholdMinutes);
  $("idleModal").classList.remove("hidden");
});

(async () => {
  const cfg = await tw.getConfig();
  $("apiUrl").value = cfg.apiUrl;
  if (cfg.loggedIn) {
    // Recover running state after restart: the server knows whether a timer is running.
    try {
      const me = await tw.api("GET", "/api/auth/me");
      await showApp(me.user, me.organizations);
      if (me.currentOrganizationId) $("orgSelect").value = me.currentOrganizationId;
    } catch (e) {
      showLogin();
    }
  } else showLogin();
})();
