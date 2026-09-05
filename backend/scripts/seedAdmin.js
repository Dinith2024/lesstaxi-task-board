// Creates (or updates) the single administrator account from ADMIN_* env
// vars. Run with `npm run seed`. This is the ONLY way an admin account
// is ever created — there is no admin option on the public registration
// endpoint, per the assignment's role-security requirement

import { loadEnv } from "../src/utils/loadEnv.js";
loadEnv();

import { db } from "../src/db.js";
import { hashPassword } from "../src/auth.js";

const name = process.env.ADMIN_NAME || "Administrator";
const email = (process.env.ADMIN_EMAIL || "").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";

if (!email || !password) {
  console.error(
    "ADMIN_EMAIL and ADMIN_PASSWORD must be set in backend/.env before seeding."
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const passwordHash = hashPassword(password);
const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

if (existing) {
  db.prepare(
    "UPDATE users SET name = ?, password_hash = ?, role = 'admin' WHERE id = ?"
  ).run(name, passwordHash, existing.id);
  console.log(`Updated existing account (${email}) to administrator.`);
} else {
  db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
  ).run(name, email, passwordHash);
  console.log(`Administrator account created: ${email}`);
}