const API_BASE =
  localStorage.getItem("knotboard_api_base") ||
  "https://knotboard-backend.onrender.com/api";
const state = {
  auth: readAuth(),
  boards: [],
  notes: [],
  dashboard: null,
  users: [],
  selectedBoardId: null,
  search: "",
  authMode: "login",
  drawer: null,
  editingBoard: null,
  editingNote: null,
  loading: false,
  error: "",
};

const app = document.querySelector("#app");

function readAuth() {
  try {
    return JSON.parse(localStorage.getItem("knotboard_auth")) || null;
  } catch {
    return null;
  }
}

function saveAuth(auth) {
  state.auth = auth;
  if (auth) {
    localStorage.setItem("knotboard_auth", JSON.stringify(auth));
  } else {
    localStorage.removeItem("knotboard_auth");
  }
}

function canManageBoards() {
  return ["ADMIN", "FACILITATOR"].includes(state.auth?.role);
}

function isAdmin() {
  return state.auth?.role === "ADMIN";
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (state.auth?.token) {
    headers.Authorization = `Bearer ${state.auth.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    if (response.status === 401) {
      saveAuth(null);
    }
    throw new Error(response.status === 403 ? "You do not have permission for that action." : "Session expired. Please sign in again.");
  }

  if (!response.ok) {
    let message = "Something went wrong.";
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      message = await response.text() || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function selectedBoard() {
  return state.boards.find((board) => board.id === state.selectedBoardId) || state.boards[0] || null;
}

function filteredBoards() {
  const needle = state.search.trim().toLowerCase();
  if (!needle) return state.boards;
  return state.boards.filter((board) =>
    [board.title, board.description, board.createdByUsername].some((value) =>
      String(value || "").toLowerCase().includes(needle),
    ),
  );
}

function render() {
  app.innerHTML = state.auth ? renderWorkspace() : renderAuth();
  bindEvents();
}

function renderAuth() {
  return `
    <main class="auth-layout">
      <section class="auth-showcase">
        <div>
          <div class="brand">
            <div class="brand-mark">KB</div>
            <div>
              <h1>KnotBoard</h1>
              <p>Virtual sticky-note workspace</p>
            </div>
          </div>
          <h2>Boards, notes, and team ideas in one tidy place.</h2>
          <p>Create shared boards, collect sticky notes, and keep admin roles close at hand with your Spring Boot backend.</p>
        </div>
        <div class="showcase-grid">
          <div class="showcase-stat"><strong>JWT</strong><span>Secure API sessions</span></div>
          <div class="showcase-stat"><strong>3 roles</strong><span>Admin, facilitator, contributor</span></div>
          <div class="showcase-stat"><strong>CRUD</strong><span>Boards and sticky notes</span></div>
        </div>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <div class="tabs" role="tablist">
            <button class="tab-button ${state.authMode === "login" ? "active" : ""}" data-auth-mode="login">Sign in</button>
            <button class="tab-button ${state.authMode === "register" ? "active" : ""}" data-auth-mode="register">Create account</button>
          </div>
          <form class="form" id="auth-form">
            <div class="alert ${state.error ? "show" : ""}">${escapeHtml(state.error)}</div>
            <div class="field">
              <label for="username">Username</label>
              <input id="username" name="username" autocomplete="username" required />
            </div>
            ${state.authMode === "register" ? `
              <div class="field">
                <label for="email">Email</label>
                <input id="email" name="email" type="email" autocomplete="email" required />
              </div>
            ` : ""}
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" autocomplete="${state.authMode === "login" ? "current-password" : "new-password"}" minlength="6" required />
            </div>
            <button class="primary-button" type="submit" ${state.loading ? "disabled" : ""}>
              ${state.loading ? "Working..." : state.authMode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </section>
    </main>
  `;
}

function renderWorkspace() {
  const board = selectedBoard();
  const boards = filteredBoards();
  const boardNotes = board ? state.notes.filter((note) => note.boardId === board.id) : [];

  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">KB</div>
          <div>
            <h1>KnotBoard</h1>
            <p>${escapeHtml(API_BASE)}</p>
          </div>
        </div>
        <div class="user-chip">
          <span class="role-pill">${escapeHtml(state.auth.username)} &middot; ${escapeHtml(state.auth.role)}</span>
          ${isAdmin() ? `<button class="ghost-button" data-action="open-users">Users</button>` : ""}
          <button class="logout-button" data-action="logout">Sign out</button>
        </div>
      </header>

      <div class="layout">
        <aside class="sidebar">
          <section class="panel">
            <div class="panel-title">
              <h2>Dashboard</h2>
              <button class="icon-button" title="Refresh" data-action="refresh">&#8635;</button>
            </div>
            <div class="stats">
              <div class="stat"><strong>${state.dashboard?.totalUsers ?? "-"}</strong><span>Users</span></div>
              <div class="stat"><strong>${state.dashboard?.totalBoards ?? "-"}</strong><span>Boards</span></div>
              <div class="stat"><strong>${state.dashboard?.totalNotes ?? "-"}</strong><span>Notes</span></div>
            </div>
          </section>

          <section class="form-panel">
            <div class="panel-title">
              <h3>${state.editingBoard ? "Edit board" : "New board"}</h3>
              ${state.editingBoard ? `<button class="icon-button" title="Cancel edit" data-action="cancel-board-edit">&times;</button>` : ""}
            </div>
            <form class="form" id="board-form">
              <div class="field">
                <label for="board-title">Title</label>
                <input id="board-title" name="title" value="${escapeHtml(state.editingBoard?.title || "")}" required />
              </div>
              <div class="field">
                <label for="board-description">Description</label>
                <textarea id="board-description" name="description">${escapeHtml(state.editingBoard?.description || "")}</textarea>
              </div>
              <button class="primary-button" type="submit">${state.editingBoard ? "Save board" : "Create board"}</button>
            </form>
          </section>

          <section class="panel">
            <div class="panel-title">
              <h3>Boards</h3>
              <span class="status-pill">${boards.length}</span>
            </div>
            <div class="board-list">
              ${boards.map((item) => `
                <button class="board-button ${item.id === board?.id ? "active" : ""}" data-board-id="${item.id}">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.createdByUsername || "Unknown")} &middot; ${formatDate(item.createdAt)}</span>
                </button>
              `).join("") || `<div class="empty">No boards match your search.</div>`}
            </div>
          </section>
        </aside>

        <main class="main">
          <div class="toolbar">
            <input id="search" placeholder="Search boards" value="${escapeHtml(state.search)}" />
            <button class="ghost-button" data-action="load-notes" ${board ? "" : "disabled"}>Load notes</button>
            <button class="primary-button" data-action="open-note" ${board ? "" : "disabled"}>New note</button>
          </div>
          ${state.error ? `<div class="alert show">${escapeHtml(state.error)}</div>` : ""}
          ${board ? `
            <section class="panel">
              <div class="board-header">
                <div>
                  <h2>${escapeHtml(board.title)}</h2>
                  <p>${escapeHtml(board.description || "No description yet.")}</p>
                  <p>Created by ${escapeHtml(board.createdByUsername || "Unknown")} &middot; ${formatDate(board.createdAt)}</p>
                </div>
                <div class="board-actions">
                  <button class="ghost-button" data-action="edit-board" ${canManageBoards() ? "" : "disabled"}>Edit</button>
                  <button class="danger-button" data-action="delete-board" ${canManageBoards() ? "" : "disabled"}>Delete</button>
                </div>
              </div>
            </section>
            <section class="note-grid">
              ${boardNotes.map(renderNote).join("") || `<div class="empty">No notes on this board yet. Add the first one.</div>`}
            </section>
          ` : `<div class="empty">Create a board to start collecting notes.</div>`}
        </main>
      </div>
      ${renderDrawer()}
    </div>
  `;
}

function renderNote(note) {
  return `
    <article class="note-card">
      <div class="note-content">${escapeHtml(note.content)}</div>
      <div class="note-meta">
        <span>${escapeHtml(note.createdByUsername || "Unknown")} &middot; ${formatDate(note.createdAt)}</span>
        <span class="note-actions">
          <button class="icon-button" title="Edit note" data-action="edit-note" data-note-id="${note.id}">&#9998;</button>
          <button class="icon-button" title="Delete note" data-action="delete-note" data-note-id="${note.id}">&times;</button>
        </span>
      </div>
    </article>
  `;
}

function renderDrawer() {
  if (state.drawer === "note") {
    const board = selectedBoard();
    return `
      <div class="drawer open">
        <aside class="drawer-panel">
          <div class="drawer-head">
            <h2>${state.editingNote ? "Edit note" : "New note"}</h2>
            <button class="icon-button" data-action="close-drawer">&times;</button>
          </div>
          <form class="form" id="note-form">
            <div class="field">
              <label for="note-content">Content</label>
              <textarea id="note-content" name="content" required>${escapeHtml(state.editingNote?.content || "")}</textarea>
            </div>
            <button class="primary-button" type="submit">${state.editingNote ? "Save note" : `Add to ${escapeHtml(board?.title || "board")}`}</button>
          </form>
        </aside>
      </div>
    `;
  }

  if (state.drawer === "users") {
    return `
      <div class="drawer open">
        <aside class="drawer-panel">
          <div class="drawer-head">
            <h2>User roles</h2>
            <button class="icon-button" data-action="close-drawer">&times;</button>
          </div>
          <table class="users-table">
            <thead><tr><th>User</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              ${state.users.map((user) => `
                <tr>
                  <td>${escapeHtml(user.username)}</td>
                  <td>${escapeHtml(user.email)}</td>
                  <td>
                    <select data-action="change-role" data-user-id="${user.id}">
                      ${["ADMIN", "FACILITATOR", "CONTRIBUTOR"].map((role) => `
                        <option value="${role}" ${role === user.role ? "selected" : ""}>${role}</option>
                      `).join("")}
                    </select>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="3">No users found.</td></tr>`}
            </tbody>
          </table>
        </aside>
      </div>
    `;
  }

  return "";
}

function bindEvents() {
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      state.error = "";
      render();
    });
  });

  document.querySelector("#auth-form")?.addEventListener("submit", handleAuth);
  document.querySelector("#board-form")?.addEventListener("submit", handleBoardSubmit);
  document.querySelector("#note-form")?.addEventListener("submit", handleNoteSubmit);
  document.querySelector("#search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  document.querySelectorAll("[data-board-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedBoardId = Number(button.dataset.boardId);
      state.error = "";
      render();
      await loadNotes();
    });
  });

  document.querySelectorAll("[data-action]").forEach((element) => {
    if (element.tagName === "SELECT") {
      element.addEventListener("change", handleAction);
    } else {
      element.addEventListener("click", handleAction);
    }
  });
}

async function handleAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  const path = state.authMode === "login" ? "/auth/login" : "/auth/register";
  state.loading = true;
  state.error = "";
  render();

  try {
    const auth = await api(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    saveAuth(auth);
    await hydrate();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function handleBoardSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    title: form.get("title").trim(),
    description: form.get("description").trim(),
  };

  try {
    if (state.editingBoard) {
      await api(`/boards/${state.editingBoard.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      state.editingBoard = null;
    } else {
      const created = await api("/boards", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.selectedBoardId = created.id;
    }
    await hydrate();
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function handleNoteSubmit(event) {
  event.preventDefault();
  const board = selectedBoard();
  if (!board) return;

  const form = new FormData(event.currentTarget);
  const payload = {
    content: form.get("content").trim(),
    boardId: board.id,
  };

  try {
    if (state.editingNote) {
      await api(`/notes/${state.editingNote.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await api("/notes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    state.drawer = null;
    state.editingNote = null;
    await loadNotes();
    await loadDashboard();
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  const board = selectedBoard();

  try {
    if (action === "logout") {
      saveAuth(null);
      state.boards = [];
      state.notes = [];
      state.dashboard = null;
      state.error = "";
      render();
      return;
    }

    if (action === "refresh") await hydrate();
    if (action === "load-notes") await loadNotes();
    if (action === "open-note") {
      state.drawer = "note";
      state.editingNote = null;
      render();
    }
    if (action === "edit-note") {
      state.editingNote = state.notes.find((note) => note.id === Number(event.currentTarget.dataset.noteId));
      state.drawer = "note";
      render();
    }
    if (action === "delete-note") {
      if (!confirm("Delete this note?")) return;
      await api(`/notes/${event.currentTarget.dataset.noteId}`, { method: "DELETE" });
      await loadNotes();
      await loadDashboard();
    }
    if (action === "edit-board" && board) {
      state.editingBoard = board;
      render();
    }
    if (action === "cancel-board-edit") {
      state.editingBoard = null;
      render();
    }
    if (action === "delete-board" && board) {
      if (!confirm(`Delete "${board.title}" and its notes?`)) return;
      await api(`/boards/${board.id}`, { method: "DELETE" });
      state.selectedBoardId = null;
      state.notes = [];
      await hydrate();
    }
    if (action === "close-drawer") {
      state.drawer = null;
      state.editingNote = null;
      render();
    }
    if (action === "open-users") {
      await loadUsers();
      state.drawer = "users";
      render();
    }
    if (action === "change-role") {
      await api(`/users/${event.currentTarget.dataset.userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: event.currentTarget.value }),
      });
      await loadUsers();
    }
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function hydrate() {
  state.error = "";
  await Promise.all([loadDashboard(), loadBoards()]);
  if (!state.selectedBoardId && state.boards.length) {
    state.selectedBoardId = state.boards[0].id;
  }
  await loadNotes();
}

async function loadDashboard() {
  state.dashboard = await api("/dashboard");
}

async function loadBoards() {
  state.boards = await api("/boards");
}

async function loadNotes() {
  const board = selectedBoard();
  if (!board) {
    state.notes = [];
    render();
    return;
  }
  const notes = await api(`/notes/board/${board.id}`);
  state.notes = [
    ...state.notes.filter((note) => note.boardId !== board.id),
    ...notes,
  ];
  render();
}

async function loadUsers() {
  if (!isAdmin()) return;
  state.users = await api("/users");
}

render();

if (state.auth) {
  hydrate().catch((error) => {
    state.error = error.message;
    render();
  });
}
