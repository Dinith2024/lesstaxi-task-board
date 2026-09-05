import { db } from "../db.js";
import { hashPassword, verifyPassword, signToken } from "../auth.js";
import { sendJson, HttpError } from "../utils/http.js";
import { requireAuth } from "../middleware.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

function issueTokenFor(row) {
  const expiresIn = Number(process.env.JWT_EXPIRES_IN_SECONDS) || 86400;
  return signToken(
    { id: row.id, name: row.name, email: row.email, role: row.role },
    process.env.JWT_SECRET,
    expiresIn
  );
}

export function registerAuthRoutes(router) {
  // Public registration always creates a normal user. Admins are only
  // ever created via scripts/seedAdmin.js — see README for rationale.
  router.post("/api/auth/register", async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      throw new HttpError(400, "Name must be at least 2 characters");
    }
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      throw new HttpError(400, "A valid email is required");
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      throw new HttpError(400, "Password must be at least 8 characters");
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email.toLowerCase());
    if (existing) {
      throw new HttpError(409, "An account with that email already exists");
    }

    const passwordHash = hashPassword(password);
    const result = db
      .prepare(
        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')"
      )
      .run(name.trim(), email.toLowerCase(), passwordHash);

    const row = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(result.lastInsertRowid);

    sendJson(res, 201, { token: issueTokenFor(row), user: publicUser(row) });
  });

  router.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new HttpError(400, "Email and password are required");
    }

    const row = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(String(email).toLowerCase());

    // Same generic error whether the email or the password was wrong,
    // so we don't leak which emails are registered.
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, "Invalid email or password");
    }

    sendJson(res, 200, { token: issueTokenFor(row), user: publicUser(row) });
  });

  router.get("/api/auth/me", requireAuth, async (req, res) => {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!row) throw new HttpError(404, "User no longer exists");
    sendJson(res, 200, { user: publicUser(row) });
  });
}