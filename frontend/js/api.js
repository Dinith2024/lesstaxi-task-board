// Thin fetch wrapper shared by every page. Keeps the JWT in
// localStorage (survives refresh) and centralizes error handling so
// every call site doesn't repeat the same try/catch

const TOKEN_KEY = "taskboard.token";
const USER_KEY = "taskboard.user";

const Auth = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn() {
    return Boolean(this.getToken());
  },
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && Auth.getToken()) {
    headers.Authorization = `Bearer ${Auth.getToken()}`;
  }

  let response;
  try {
    response = await fetch(`${window.API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError(
      "Couldn't reach the server. Check your connection and that the API is running.",
      0
    );
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    // No/invalid JSON body — fall through with an empty object.
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      Auth.clearSession();
    }
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  }

  return data;
}

const Api = {
  register: (name, email, password) =>
    request("/api/auth/register", { method: "POST", body: { name, email, password }, auth: false }),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: { email, password }, auth: false }),
  me: () => request("/api/auth/me"),

  listTasks: () => request("/api/tasks"),
  createTask: (title, description) =>
    request("/api/tasks", { method: "POST", body: { title, description } }),
  updateTask: (id, fields) => request(`/api/tasks/${id}`, { method: "PATCH", body: fields }),
  setStatus: (id, status) =>
    request(`/api/tasks/${id}/status`, { method: "PATCH", body: { status } }),
  assignTask: (id, userId) =>
    request(`/api/tasks/${id}/assign`, { method: "PATCH", body: { userId } }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: "DELETE" }),

  listUsers: () => request("/api/users"),
};