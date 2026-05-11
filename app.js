/* ═══════════════════════════════════════════════════════
   GlassTENG Data Collection — app.js
   Features:
     • Sequential event timer with progress bar
     • Audio countdown (beep) for last 5 seconds of each activity
     • Drag-and-drop row reordering
     • Inline edit modal
     • JSON import / export
     • CSV session log export
═══════════════════════════════════════════════════════ */

// ── Default events ──────────────────────────────────────
const DEFAULT_EVENTS = [
  [
    {
      name: "Tap your frame 5 times when you hear the count down",
      duration: 10,
    },
    { name: "No activity - stay still and do not move", duration: 120 },
    { name: "Blink Every 5 seconds", duration: 60 },
    { name: "No activity - stay still and do not move", duration: 30 },
    { name: "Raise and lower eyebrows periodically", duration: 60 },
    { name: "No activity - stay still and do not move", duration: 30 },
    { name: "Eating chips periodically", duration: 180 },
    { name: "No activity - stay still and do not move", duration: 30 },
    { name: "Eat marshmallow periodically", duration: 180 },
    { name: "No activity - stay still and do not move", duration: 30 },
    { name: "Drink water", duration: 60 },
    { name: "No activity - stay still and do not move", duration: 30 },
    { name: "Clench teeth", duration: 60 },
    { name: "No activity - stay still and do not move", duration: 30 },
    { name: "Tap teeth", duration: 60 },
    { name: "No activity - stay still and do not move", duration: 30 },
    {
      name: "Talk: Read this: A astronaut named Leo landed on a distant planet covered in silver forests. He walked through the trees and discovered a glowing lake at the center. A creature rose from the water and stared at him. It did not speak but handed him a small stone. Leo looked at the stone and saw his home reflected in it. He smiled and placed it in his pocket. Then he turned and walked back to his ship knowing he would return one day.",
      duration: 60,
    },
    { name: "No activity - stay still and do not move", duration: 30 },
    { name: "Move head and shoulders (simulate walking)", duration: 180 },
    { name: "No activity - stay still and do not move", duration: 30 },
    {
      name: "Shake head and shoulders while talking: A astronaut named Leo landed on a distant planet covered in silver forests. He walked through the trees and discovered a glowing lake at the center. A creature rose from the water and stared at him. It did not speak but handed him a small stone. Leo looked at the stone and saw his home reflected in it. He smiled and placed it in his pocket. Then he turned and walked back to his ship knowing he would return one day.",
      duration: 180,
    },
    { name: "No activity - stay still and do not move", duration: 30 },
    { name: "Move your head faster", duration: 60 },
    { name: "No activity - stay still and do not move", duration: 30 },
  ],
];

// ── State ────────────────────────────────────────────────
let events = DEFAULT_EVENTS.map((e, i) => ({ ...e, id: i }));
let nextId = events.length;
let running = false;
let paused = false;
let currentIdx = -1;
let elapsed = 0; // seconds elapsed in current event
let intervalId = null;
let sessionLog = [];

let dragSrcIdx = null; // drag-and-drop state

let editingId = null; // modal state

// ── Audio context (Web Audio API) ────────────────────────
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/**
 * Play a short beep
 * @param {number} freq  - frequency in Hz
 * @param {number} dur   - duration in seconds
 * @param {'sine'|'square'} type
 */
function beep(freq = 880, dur = 0.12, type = "sine") {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch (e) {
    /* ignore */
  }
}

/**
 * Speak text via Web Speech API (optional, nice-to-have)
 */
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.1;
  utt.volume = 0.9;
  window.speechSynthesis.speak(utt);
}

// ── DOM refs ─────────────────────────────────────────────
const timerEl = document.getElementById("timer");
const currentName = document.getElementById("currentEventName");
const progressBar = document.getElementById("progressBar");
const countdownOvl = document.getElementById("countdownOverlay");
const countdownNum = document.getElementById("countdownNum");
const nextUpEl = document.getElementById("nextUp");
const nextNameEl = document.getElementById("nextName");
const eventsUl = document.getElementById("eventsUl");
const eventCount = document.getElementById("eventCount");
const logBody = document.getElementById("logBody");
const jsonArea = document.getElementById("importJsonText");

const btnStart = document.getElementById("startTimer");
const btnPause = document.getElementById("pauseTimer");
const btnReset = document.getElementById("resetTimer");
const btnAdd = document.getElementById("addEvent");
const btnImport = document.getElementById("importJson");
const btnExport = document.getElementById("exportCsv");
const btnCopyJson = document.getElementById("copyJson");

const editModal = document.getElementById("editModal");
const editNameInp = document.getElementById("editName");
const editDurInp = document.getElementById("editDuration");
const btnEditSave = document.getElementById("editSave");
const btnEditCancel = document.getElementById("editCancel");

// ── Format helpers ───────────────────────────────────────
function fmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function fmtDate(d) {
  return d.toLocaleString();
}

// ── Render activities list ───────────────────────────────
function renderEvents() {
  eventsUl.innerHTML = "";
  eventCount.textContent = events.length;

  events.forEach((ev, idx) => {
    const tr = document.createElement("tr");
    tr.className = "evt-row";
    tr.dataset.idx = idx;
    if (running && !paused && idx === currentIdx)
      tr.classList.add("active-row");

    tr.innerHTML = `
      <td><span class="drag-handle" title="Drag to reorder">⠿</span></td>
      <td class="evt-name-cell" title="${ev.name}">${ev.name.length > 60 ? ev.name.slice(0, 58) + "…" : ev.name}</td>
      <td style="font-family:var(--mono);color:var(--muted)">${ev.duration}s</td>
      <td style="display:flex;gap:4px;padding:6px 12px">
        <button class="act-btn edit-btn" data-id="${ev.id}" title="Edit">✎</button>
        <button class="act-btn del del-btn" data-id="${ev.id}" title="Delete">✕</button>
      </td>
    `;

    // Drag events
    tr.draggable = true;
    tr.addEventListener("dragstart", onDragStart);
    tr.addEventListener("dragover", onDragOver);
    tr.addEventListener("dragleave", onDragLeave);
    tr.addEventListener("drop", onDrop);
    tr.addEventListener("dragend", onDragEnd);

    eventsUl.appendChild(tr);
  });

  // Edit / delete button handlers
  eventsUl.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      openEditModal(parseInt(btn.dataset.id)),
    );
  });
  eventsUl.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteEvent(parseInt(btn.dataset.id)));
  });

  updateJson();
}

// ── Render session log ───────────────────────────────────
function renderLog() {
  if (sessionLog.length === 0) {
    logBody.innerHTML =
      '<tr><td colspan="3" class="empty-row">No data yet — start the timer to begin.</td></tr>';
    return;
  }
  logBody.innerHTML = sessionLog
    .map(
      (e) => `
    <tr>
      <td title="${e.name}">${e.name.length > 40 ? e.name.slice(0, 38) + "…" : e.name}</td>
      <td style="font-family:var(--mono);font-size:.75rem;white-space:nowrap">${fmtDate(e.start)}</td>
      <td style="font-family:var(--mono);font-size:.75rem;white-space:nowrap">${fmtDate(e.end)}</td>
    </tr>
  `,
    )
    .join("");
}

// ── JSON sync ────────────────────────────────────────────
function updateJson() {
  jsonArea.value = JSON.stringify(
    events.map((e) => ({ name: e.name, duration: e.duration })),
    null,
    2,
  );
}

// ── Timer core ───────────────────────────────────────────
let eventStartTime = null;

function startNextEvent() {
  currentIdx++;
  if (currentIdx >= events.length) {
    endSession();
    return;
  }
  elapsed = 0;
  eventStartTime = new Date();
  updateTimerDisplay();
  updateNextUp();
  renderEvents();
}

function endSession() {
  clearInterval(intervalId);
  running = false;
  paused = false;
  intervalId = null;
  timerEl.classList.remove("warn", "pulse");
  countdownOvl.classList.add("hidden");
  currentName.textContent = "✓ Session complete";
  progressBar.style.width = "100%";
  nextUpEl.classList.add("hidden");
  btnStart.disabled = false;
  btnPause.disabled = true;
  btnStart.textContent = "▶ Start";
  speak("Session complete");
  beep(1047, 0.2);
  setTimeout(() => beep(1319, 0.25), 220);
  setTimeout(() => beep(1568, 0.4), 450);
}

function tick() {
  if (!running || paused) return;
  elapsed++;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const ev = events[currentIdx];
  if (!ev) return;
  const rem = ev.duration - elapsed;

  currentName.textContent = ev.name;
  timerEl.textContent = fmtTime(Math.max(0, rem));

  // Progress bar
  const pct = Math.min(100, (elapsed / ev.duration) * 100);
  progressBar.style.width = pct + "%";

  // Colour / warn state
  if (rem <= 5 && rem > 0) {
    timerEl.classList.add("warn");
    timerEl.classList.remove("pulse");
    // Show countdown overlay
    countdownOvl.classList.remove("hidden");
    countdownNum.textContent = rem;
    // Beep on each second of countdown
    beep(rem === 1 ? 1320 : 880, 0.1, "square");
  } else if (rem === 0) {
    // Event done
    timerEl.classList.remove("warn");
    countdownOvl.classList.add("hidden");
    // Log it
    sessionLog.push({ name: ev.name, start: eventStartTime, end: new Date() });
    renderLog();
    startNextEvent();
    return;
  } else {
    timerEl.classList.remove("warn", "pulse");
    countdownOvl.classList.add("hidden");
  }
}

function updateNextUp() {
  const next = events[currentIdx + 1];
  if (next) {
    nextUpEl.classList.remove("hidden");
    nextNameEl.textContent =
      next.name.length > 50 ? next.name.slice(0, 48) + "…" : next.name;
  } else {
    nextUpEl.classList.add("hidden");
  }
}

// ── Control buttons ──────────────────────────────────────
btnStart.addEventListener("click", () => {
  if (!running) {
    // Fresh start
    running = true;
    paused = false;
    currentIdx = -1;
    sessionLog = [];
    renderLog();
    startNextEvent();
    intervalId = setInterval(tick, 1000);
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnPause.textContent = "⏸ Pause";
    speak("Session started");
  }
});

btnPause.addEventListener("click", () => {
  if (!running) return;
  paused = !paused;
  if (paused) {
    btnPause.textContent = "▶ Resume";
    timerEl.classList.add("pulse");
  } else {
    btnPause.textContent = "⏸ Pause";
    timerEl.classList.remove("pulse");
  }
});

btnReset.addEventListener("click", () => {
  clearInterval(intervalId);
  running = false;
  paused = false;
  intervalId = null;
  currentIdx = -1;
  elapsed = 0;
  timerEl.textContent = "00:00:00";
  timerEl.classList.remove("warn", "pulse");
  currentName.textContent = "—";
  progressBar.style.width = "0%";
  countdownOvl.classList.add("hidden");
  nextUpEl.classList.add("hidden");
  btnStart.disabled = false;
  btnPause.disabled = true;
  btnStart.textContent = "▶ Start";
  renderEvents();
});

// ── Add event ────────────────────────────────────────────
btnAdd.addEventListener("click", () => {
  const name = document.getElementById("eventName").value.trim();
  const dur = parseInt(document.getElementById("eventDuration").value);
  if (!name || isNaN(dur) || dur <= 0) {
    alert("Please enter a valid name and duration (> 0 seconds).");
    return;
  }
  events.push({ name, duration: dur, id: nextId++ });
  document.getElementById("eventName").value = "";
  document.getElementById("eventDuration").value = "";
  renderEvents();
});

// ── Delete event ─────────────────────────────────────────
function deleteEvent(id) {
  events = events.filter((e) => e.id !== id);
  renderEvents();
}

// ── Edit modal ───────────────────────────────────────────
function openEditModal(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  editingId = id;
  editNameInp.value = ev.name;
  editDurInp.value = ev.duration;
  editModal.classList.remove("hidden");
  editNameInp.focus();
}

btnEditSave.addEventListener("click", () => {
  const ev = events.find((e) => e.id === editingId);
  if (!ev) return;
  const name = editNameInp.value.trim();
  const dur = parseInt(editDurInp.value);
  if (!name || isNaN(dur) || dur <= 0) {
    alert("Please enter a valid name and duration.");
    return;
  }
  ev.name = name;
  ev.duration = dur;
  editModal.classList.add("hidden");
  editingId = null;
  renderEvents();
});

btnEditCancel.addEventListener("click", () => {
  editModal.classList.add("hidden");
  editingId = null;
});

editModal.addEventListener("click", (e) => {
  if (e.target === editModal) {
    editModal.classList.add("hidden");
    editingId = null;
  }
});

// ── JSON import / export ─────────────────────────────────
btnImport.addEventListener("click", () => {
  try {
    const parsed = JSON.parse(jsonArea.value);
    if (!Array.isArray(parsed)) throw new Error("Expected array");
    events = parsed.map((e, i) => ({
      name: String(e.name || "Unnamed"),
      duration: parseInt(e.duration) || 30,
      id: nextId++,
    }));
    renderEvents();
  } catch (err) {
    alert("Invalid JSON: " + err.message);
  }
});

btnCopyJson.addEventListener("click", () => {
  navigator.clipboard.writeText(jsonArea.value).then(() => {
    btnCopyJson.textContent = "Copied!";
    setTimeout(() => (btnCopyJson.textContent = "Copy"), 1500);
  });
});

// ── CSV export ───────────────────────────────────────────
btnExport.addEventListener("click", () => {
  if (sessionLog.length === 0) {
    alert("No session data to export yet.");
    return;
  }
  const header = "Name,Start,End\n";
  const rows = sessionLog
    .map(
      (e) =>
        `"${e.name.replace(/"/g, '""')}",${e.start.getTime()},${e.end.getTime()}`,
    )
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glassteng_session_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Drag & Drop (HTML5 native) ───────────────────────────
function getRowIdx(el) {
  return parseInt(el.closest("tr").dataset.idx);
}

function onDragStart(e) {
  dragSrcIdx = getRowIdx(e.target);
  e.dataTransfer.effectAllowed = "move";
  setTimeout(() => e.target.closest("tr").classList.add("dragging"), 0);
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const tr = e.target.closest("tr");
  if (tr) tr.classList.add("drag-over");
}

function onDragLeave(e) {
  const tr = e.target.closest("tr");
  if (tr) tr.classList.remove("drag-over");
}

function onDrop(e) {
  e.preventDefault();
  const destIdx = getRowIdx(e.target);
  if (dragSrcIdx === null || dragSrcIdx === destIdx) return;

  const moved = events.splice(dragSrcIdx, 1)[0];
  events.splice(destIdx, 0, moved);

  // If timer is running, adjust currentIdx if needed
  if (running) {
    if (dragSrcIdx === currentIdx) currentIdx = destIdx;
    else if (dragSrcIdx < currentIdx && destIdx >= currentIdx) currentIdx--;
    else if (dragSrcIdx > currentIdx && destIdx <= currentIdx) currentIdx++;
  }

  renderEvents();
}

function onDragEnd(e) {
  dragSrcIdx = null;
  document.querySelectorAll(".evt-row").forEach((tr) => {
    tr.classList.remove("dragging", "drag-over");
  });
}

// ── Boot ─────────────────────────────────────────────────
renderEvents();
renderLog();
