// Main board page: fetches tasks/users, renders the three columns,
// and wires up drag-and-drop plus create/edit/delete/assign actions.

if (!Auth.isLoggedIn()) {
  location.href = "index.html";
}

const state = {
  user: Auth.getUser(),
  tasks: [],
  users: [], // admin only — used to populate the reassignment dropdown
  editingTaskId: null,
  pendingDeleteId: null,
};

const STATUS_LABEL = { todo: "To do", doing: "Doing", done: "Done" };

/* ------------------------------------------------------------------ */
/*  Bootstrapping                                                       */
/* ------------------------------------------------------------------ */

async function init() {
  try {
    const { user } = await Api.me();
    state.user = user;
    Auth.setSession(Auth.getToken(), user);
  } catch (err) {
    location.href = "index.html";
    return;
  }

  renderChrome();

  if (state.user.role === "admin") {
    document.getElementById("team-btn").hidden = false;
    try {
      const { users } = await Api.listUsers();
      state.users = users;
    } catch {
      /* non-fatal — assignment dropdowns just fall back to names we already have */
    }
  }

  await loadTasks();
  wireGlobalControls();
}

function renderChrome() {
  document.getElementById("user-name").textContent = state.user.name;
  document.getElementById("user-avatar").textContent = initials(state.user.name);
  const badge = document.getElementById("role-badge");
  badge.textContent = state.user.role === "admin" ? "Admin" : "Member";
  badge.classList.toggle("admin", state.user.role === "admin");

  document.getElementById("board-sub").textContent =
    state.user.role === "admin"
      ? "As an admin you can move, assign, and delete any task."
      : "Claim unassigned work, then drag your own cards across the board.";
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

async function loadTasks() {
  const stateBanner = document.getElementById("board-state");
  const board = document.getElementById("board");
  try {
    const { tasks } = await Api.listTasks();
    state.tasks = tasks;
    stateBanner.hidden = true;
    board.hidden = false;
    renderBoard();
  } catch (err) {
    stateBanner.hidden = false;
    board.hidden = true;
    stateBanner.textContent = err.message || "Couldn't load the board.";
  }
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function renderBoard() {
  for (const status of ["todo", "doing", "done"]) {
    const columnEl = document.getElementById(`col-${status}`);
    const tasksForStatus = state.tasks.filter((t) => t.status === status);
    document.getElementById(`count-${status}`).textContent = tasksForStatus.length;

    columnEl.innerHTML = "";
    if (tasksForStatus.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-col";
      empty.textContent = status === "todo" ? "Nothing queued up." : "No tasks here yet.";
      columnEl.appendChild(empty);
      continue;
    }
    for (const task of tasksForStatus) {
      columnEl.appendChild(renderCard(task));
    }
  }
}

function canDrag(task) {
  return state.user.role === "admin" || task.assignee?.id === state.user.id;
}
function canEdit(task) {
  return (
    state.user.role === "admin" ||
    task.creator.id === state.user.id ||
    task.assignee?.id === state.user.id
  );
}
function canDelete(task) {
  return state.user.role === "admin" || task.creator.id === state.user.id;
}

function renderCard(task) {
  const card = document.createElement("div");
  card.className = `card status-${task.status}`;
  card.dataset.id = task.id;

  const draggable = canDrag(task);
  card.draggable = draggable;
  if (!draggable) {
    card.title = "Only the assigned person or an admin can move this task";
  }

  const title = document.createElement("p");
  title.className = "card-title";
  title.textContent = task.title;
  card.appendChild(title);

  if (task.description) {
    const desc = document.createElement("p");
    desc.className = "card-desc";
    desc.textContent = task.description;
    card.appendChild(desc);
  }

  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.innerHTML = `
    <span>By ${escapeHtml(task.creator.name)}</span>
    <span>${task.assignee ? "Assigned to " + escapeHtml(task.assignee.name) : "Unassigned"}</span>
  `;
  card.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  // Normal user: claim an unassigned task
  if (!task.assignee && state.user.role !== "admin") {
    actions.appendChild(makeButton("Claim", "btn--sm btn--primary", () => claimTask(task.id)));
  }

  // Admin: reassign dropdown
  if (state.user.role === "admin") {
    actions.appendChild(makeAssignSelect(task));
  }

  if (canEdit(task)) {
    actions.appendChild(makeButton("Edit", "btn--sm btn--ghost", () => openEditModal(task)));
  }
  if (canDelete(task)) {
    actions.appendChild(makeButton("Delete", "btn--sm btn--danger", () => openDeleteModal(task.id)));
  }

  card.appendChild(actions);

  card.addEventListener("dragstart", (e) => {
    if (!draggable) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", String(task.id));
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  return card;
}

function makeButton(label, classes, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `btn ${classes}`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function makeAssignSelect(task) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Reassign task");

  const unassignedOpt = document.createElement("option");
  unassignedOpt.value = "";
  unassignedOpt.textContent = "Unassigned";
  select.appendChild(unassignedOpt);

  const roster = state.users.length ? state.users : [task.creator, task.assignee].filter(Boolean);
  const seen = new Set();
  for (const u of roster) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.name;
    select.appendChild(opt);
  }

  select.value = task.assignee ? String(task.assignee.id) : "";
  select.addEventListener("change", () => reassignTask(task.id, select.value || null));
  return select;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  Drag-and-drop wiring for the three columns                          */
/* ------------------------------------------------------------------ */

for (const columnEl of document.querySelectorAll(".column")) {
  columnEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    columnEl.classList.add("drop-target");
  });
  columnEl.addEventListener("dragleave", () => columnEl.classList.remove("drop-target"));
  columnEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    columnEl.classList.remove("drop-target");
    const taskId = e.dataTransfer.getData("text/plain");
    const newStatus = columnEl.dataset.status;
    if (!taskId) return;

    const task = state.tasks.find((t) => String(t.id) === taskId);
    if (!task || task.status === newStatus) return;

    try {
      const { task: updated } = await Api.setStatus(taskId, newStatus);
      state.tasks = state.tasks.map((t) => (t.id === updated.id ? updated : t));
      renderBoard();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Actions                                                             */
/* ------------------------------------------------------------------ */

async function claimTask(taskId) {
  try {
    const { task } = await Api.assignTask(taskId, state.user.id);
    state.tasks = state.tasks.map((t) => (t.id === task.id ? task : t));
    renderBoard();
    showToast("Task claimed.");
  } catch (err) {
    showToast(err.message, true);
  }
}

async function reassignTask(taskId, userId) {
  try {
    const { task } = await Api.assignTask(taskId, userId === null ? null : Number(userId));
    state.tasks = state.tasks.map((t) => (t.id === task.id ? task : t));
    renderBoard();
  } catch (err) {
    showToast(err.message, true);
    renderBoard(); // revert the <select> to the last known-good value
  }
}

/* ------------------------------------------------------------------ */
/*  New / edit task modal                                               */
/* ------------------------------------------------------------------ */

const taskModal = document.getElementById("task-modal-backdrop");
const taskForm = document.getElementById("task-form");

function openNewTaskModal() {
  state.editingTaskId = null;
  document.getElementById("task-modal-title").textContent = "New task";
  document.getElementById("task-modal-submit").textContent = "Create task";
  taskForm.reset();
  document.getElementById("task-modal-banner").innerHTML = "";
  taskModal.hidden = false;
  document.getElementById("task-title").focus();
}

function openEditModal(task) {
  state.editingTaskId = task.id;
  document.getElementById("task-modal-title").textContent = "Edit task";
  document.getElementById("task-modal-submit").textContent = "Save changes";
  document.getElementById("task-title").value = task.title;
  document.getElementById("task-description").value = task.description || "";
  document.getElementById("task-modal-banner").innerHTML = "";
  taskModal.hidden = false;
  document.getElementById("task-title").focus();
}

function closeTaskModal() {
  taskModal.hidden = true;
}

taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("task-title").value.trim();
  const description = document.getElementById("task-description").value.trim();
  const banner = document.getElementById("task-modal-banner");
  const submitBtn = document.getElementById("task-modal-submit");

  if (!title) {
    banner.innerHTML = `<div class="banner banner--error">Title is required.</div>`;
    return;
  }

  submitBtn.disabled = true;
  try {
    if (state.editingTaskId) {
      const { task } = await Api.updateTask(state.editingTaskId, { title, description });
      state.tasks = state.tasks.map((t) => (t.id === task.id ? task : t));
    } else {
      const { task } = await Api.createTask(title, description);
      state.tasks = [...state.tasks, task];
    }
    renderBoard();
    closeTaskModal();
  } catch (err) {
    banner.innerHTML = `<div class="banner banner--error">${escapeHtml(err.message)}</div>`;
  } finally {
    submitBtn.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/*  Delete confirmation modal                                           */
/* ------------------------------------------------------------------ */

const deleteModal = document.getElementById("delete-modal-backdrop");

function openDeleteModal(taskId) {
  state.pendingDeleteId = taskId;
  deleteModal.hidden = false;
}
function closeDeleteModal() {
  deleteModal.hidden = true;
  state.pendingDeleteId = null;
}

document.getElementById("delete-modal-confirm").addEventListener("click", async () => {
  if (!state.pendingDeleteId) return;
  try {
    await Api.deleteTask(state.pendingDeleteId);
    state.tasks = state.tasks.filter((t) => t.id !== state.pendingDeleteId);
    renderBoard();
    showToast("Task deleted.");
  } catch (err) {
    showToast(err.message, true);
  } finally {
    closeDeleteModal();
  }
});

/* ------------------------------------------------------------------ */
/*  Admin team roster modal                                             */
/* ------------------------------------------------------------------ */

const teamModal = document.getElementById("team-modal-backdrop");

async function openTeamModal() {
  const list = document.getElementById("team-list");
  list.innerHTML = "Loading…";
  teamModal.hidden = false;
  try {
    const { users } = await Api.listUsers();
    state.users = users;
    list.innerHTML = "";
    for (const u of users) {
      const row = document.createElement("div");
      row.className = "team-row";
      row.innerHTML = `
        <div>
          <div class="name">${escapeHtml(u.name)} ${u.role === "admin" ? "&middot; Admin" : ""}</div>
          <div class="email">${escapeHtml(u.email)}</div>
        </div>
      `;
      list.appendChild(row);
    }
  } catch (err) {
    list.innerHTML = `<div class="banner banner--error">${escapeHtml(err.message)}</div>`;
  }
}

/* ------------ */
/*  Toasts       */
/* ----------- */

let toastTimer = null;
function showToast(message, isError = false) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.className = `toast ${isError ? "toast--error" : ""}`;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 3200);
}

/* -------------- */
/*  Global controls         */
/* ------------ */

function wireGlobalControls() {
  document.getElementById("new-task-btn").addEventListener("click", openNewTaskModal);
  document.getElementById("task-modal-cancel").addEventListener("click", closeTaskModal);
  document.getElementById("delete-modal-cancel").addEventListener("click", closeDeleteModal);
  document.getElementById("team-btn").addEventListener("click", openTeamModal);
  document.getElementById("team-modal-close").addEventListener("click", () => (teamModal.hidden = true));

  document.getElementById("logout-btn").addEventListener("click", () => {
    Auth.clearSession();
    location.href = "index.html";
  });

  for (const backdrop of [taskModal, deleteModal, teamModal]) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.hidden = true;
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      taskModal.hidden = true;
      deleteModal.hidden = true;
      teamModal.hidden = true;
    }
  });
}
init();