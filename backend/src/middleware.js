import { verifyToken } from "./auth.js";
import { readJsonBody, HttpError } from "./utils/http.js";

/** Parses a JSON request body into req.body for POST/PATCH/PUT requests. */
export async function jsonBodyParser(req, res, next) {
  if (["POST", "PATCH", "PUT"].includes(req.method)) {
    req.body = await readJsonBody(req);
  } else {
    req.body = {};
  }
  await next();
}

/**
 * Applies CORS headers based on CORS_ORIGIN
 * Short-circuits OPTIONS preflight requests with 204.
 */
export function cors(req, res, next) {
  const allowedOrigins = (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((o) => o.trim());

  const origin = req.headers.origin;
  if (allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  return next();
}

/** Requires a valid Bearer token; attaches the decoded payload to req.user */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "Missing or malformed Authorization header");
  }

  try {
    const payload = verifyToken(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, role, name }
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }

  await next();
}

/** Requires req.user (set by requireAuth) to have the admin role. */
export async function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    throw new HttpError(403, "Administrator privileges required");
  }
  await next();
}