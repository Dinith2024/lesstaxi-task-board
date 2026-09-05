import { db } from "../db.js";
import { sendJson, HttpError } from "../utils/http.js";
import { requireAuth } from "../middleware.js";

const VALID_STATUSES = ["todo", "doing", "done"];

const TASK_SELECT = `
  SELECT
    t.id, t.title, t.description, t.status,
    t.created_at, t.updated_at,
    t.creator_id, creator.name AS creator_name,
    t.assigned_user_id, assignee.name AS assignee_name
  FROM tasks t
  JOIN users creator ON creator.id = t.creator_id
  LEFT JOIN users assignee ON assignee.id = t.assigned_user_id
`;

function serializeTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creator: { id: row.creator_id, name: row.creator_name },
    assignee: row.assigned_user_id
      ? { id: row.assigned_user_id, name: row.assignee_name }
      : null,
  };
}

function getTaskOr404(id) {
  const row = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);
  if (!row) throw new HttpError(404, "Task not found");
  return row;
}

function touchTask(id) {
  db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function registerTaskRoutes(router) {
  // The board is shared: every authenticated user can see every task,
  // then client-side columns group them by status. Permission checks
  // happen on the write endpoints below, per the assignment spec.
  router.get("/api/tasks", requireAuth, async (req, res) => {
    const rows = db.prepare(`${TASK_SELECT} ORDER BY t.created_at ASC`).all();
    sendJson(res, 200, { tasks: rows.map(serializeTask) });
  });

  router.post("/api/tasks", requireAuth, async (req, res) => {
    const { title, description } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      throw new HttpError(400, "Title is required");
    }

    const result = db
      .prepare(
        "INSERT INTO tasks (title, description, status, creator_id) VALUES (?, ?, 'todo', ?)"
      )
      .run(title.trim(), (description || "").trim(), req.user.id);

    const row = getTaskOr404(result.lastInsertRowid);
    sendJson(res, 201, { task: serializeTask(row) });
  });

  // Edit title/description — creator, current assignee, or admin.
  router.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    const row = getTaskOr404(req.params.id);
    const isOwner = row.creator_id === req.user.id || row.assigned_user_id === req.user.id;
    if (req.user.role !== "admin" && !isOwner) {
      throw new HttpError(403, "You can only edit tasks you created or are assigned to");
    }

    const { title, description } = req.body;
    const nextTitle = title !== undefined ? String(title).trim() : row.title;
    const nextDescription =
      description !== undefined ? String(description).trim() : row.description;

    if (!nextTitle) throw new HttpError(400, "Title cannot be empty");

    db.prepare("UPDATE tasks SET title = ?, description = ? WHERE id = ?").run(
      nextTitle,
      nextDescription,
      row.id
    );
    touchTask(row.id);

    sendJson(res, 200, { task: serializeTask(getTaskOr404(row.id)) });
  });

  // Drag-and-drop status changes. Normal users may only move tasks
  // currently assigned to them; admins may move any task.
  router.patch("/api/tasks/:id/status", requireAuth, async (req, res) => {
    const row = getTaskOr404(req.params.id);
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      throw new HttpError(400, `Status must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const isAssignee = row.assigned_user_id === req.user.id;
    if (req.user.role !== "admin" && !isAssignee) {
      throw new HttpError(403, "Only the assigned user or an admin can move this task");
    }

    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, row.id);
    touchTask(row.id);

    sendJson(res, 200, { task: serializeTask(getTaskOr404(row.id)) });
  });

  // Assignment. Normal users may only *claim* an unassigned task for
  // themselves. Admins may assign/reassign/unassign any task to anyone.
  router.patch("/api/tasks/:id/assign", requireAuth, async (req, res) => {
    const row = getTaskOr404(req.params.id);
    const { userId } = req.body;

    if (req.user.role === "admin") {
      if (userId === null) {
        db.prepare("UPDATE tasks SET assigned_user_id = NULL WHERE id = ?").run(row.id);
      } else {
        const target = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
        if (!target) throw new HttpError(400, "No such user to assign the task to");
        db.prepare("UPDATE tasks SET assigned_user_id = ? WHERE id = ?").run(
          userId,
          row.id
        );
      }
    } else {
      if (row.assigned_user_id !== null) {
        throw new HttpError(409, "This task is already assigned");
      }
      if (Number(userId) !== req.user.id) {
        throw new HttpError(403, "Normal users can only assign unassigned tasks to themselves");
      }
      db.prepare("UPDATE tasks SET assigned_user_id = ? WHERE id = ?").run(
        req.user.id,
        row.id
      );
    }

    touchTask(row.id);
    sendJson(res, 200, { task: serializeTask(getTaskOr404(row.id)) });
  });

  // Delete — creator or admin only.
  router.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    const row = getTaskOr404(req.params.id);
    if (req.user.role !== "admin" && row.creator_id !== req.user.id) {
      throw new HttpError(403, "Only the creator or an admin can delete this task");
    }
    db.prepare("DELETE FROM tasks WHERE id = ?").run(row.id);
    sendJson(res, 200, { success: true });
  });
}