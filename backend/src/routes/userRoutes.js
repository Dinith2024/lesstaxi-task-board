import { db } from "../db.js";
import { sendJson } from "../utils/http.js";
import { requireAuth, requireAdmin } from "../middleware.js";

export function registerUserRoutes(router) {
  // Admins can view every user (needed to reassign tasks across the system).
  router.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
    const rows = db
      .prepare("SELECT id, name, email, role, created_at FROM users ORDER BY name ASC")
      .all();
    sendJson(res, 200, {
      users: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        createdAt: r.created_at,
      })),
    });
  });
}