import { Hono } from "hono";
import { cors } from "hono/cors";

// Single Worker: /api/* handled here (D1), everything else is served from ./frontend by the assets binding.
const app = new Hono();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ───────────── helpers ─────────────
const J = (s) => { try { return JSON.parse(s ?? "[]"); } catch { return []; } };
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : def);
const clean = (v, max) => String(v ?? "").trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const ip = (c) => c.req.header("cf-connecting-ip") || null;
const ok = (c, data, status = 200) => c.json(data === undefined ? { success: true } : { success: true, data }, status);

const mapProfile = (r) => r && ({ id: r.id, fullName: r.full_name, title: r.title, headline: r.headline, summary: r.summary, about: J(r.about), email: r.email, phone: r.phone, location: r.location, linkedin: r.linkedin, github: r.github, website: r.website, liveProject: r.live_project, availability: r.availability, updatedAt: r.updated_at });
const mapFile = (r) => r && ({ id: r.id, kind: r.kind, filename: r.filename, mimeType: r.mime_type, sizeBytes: r.size_bytes, sha256: r.sha256, version: r.version, isActive: !!r.is_active, createdAt: r.created_at });
const mapMessage = (r) => r && ({ id: r.id, name: r.name, email: r.email, subject: r.subject, message: r.message, isRead: !!r.is_read, ipAddress: r.ip_address, createdAt: r.created_at });

// Content tables: camelCase field → column + type. Only these fields can be written through the admin API.
const RESOURCES = {
  experiences: { table: "experiences", touch: true, order: "sort_order ASC, start_date DESC", fields: {
    company: ["company", "s"], role: ["role", "s"], location: ["location", "s"], startDate: ["start_date", "d"], endDate: ["end_date", "d"],
    isCurrent: ["is_current", "b"], bullets: ["bullets", "j"], tags: ["tags", "j"], sortOrder: ["sort_order", "i"] } },
  projects: { table: "projects", touch: true, order: "sort_order ASC", fields: {
    title: ["title", "s"], description: ["description", "s"], bullets: ["bullets", "j"], tags: ["tags", "j"], status: ["status", "s"],
    liveUrl: ["live_url", "s"], repoUrl: ["repo_url", "s"], sortOrder: ["sort_order", "i"] } },
  skills: { table: "skill_groups", order: "sort_order ASC", fields: {
    category: ["category", "s"], icon: ["icon", "s"], items: ["items", "j"], sortOrder: ["sort_order", "i"] } },
  education: { table: "education", order: "sort_order ASC", fields: {
    degree: ["degree", "s"], institution: ["institution", "s"], graduationYear: ["graduation_year", "i"], sortOrder: ["sort_order", "i"] } },
  certifications: { table: "certifications", order: "sort_order ASC", fields: {
    name: ["name", "s"], status: ["status", "s"], issuer: ["issuer", "s"], sortOrder: ["sort_order", "i"] } }
};
const PROFILE_FIELDS = { fullName: ["full_name", "s"], title: ["title", "s"], headline: ["headline", "s"], summary: ["summary", "s"], about: ["about", "j"], email: ["email", "s"], phone: ["phone", "s"], location: ["location", "s"], linkedin: ["linkedin", "s"], github: ["github", "s"], website: ["website", "s"], liveProject: ["live_project", "s"], availability: ["availability", "s"] };

const toDb = (type, v) => {
  if (v === null) return null;
  if (type === "j") return JSON.stringify(Array.isArray(v) ? v : []);
  if (type === "b") return v ? 1 : 0;
  if (type === "i") return Math.round(Number(v)) || 0;
  if (type === "d") return v ? new Date(v).toISOString() : null;
  return String(v);
};
const fromDb = (fields, row) => {
  if (!row) return row;
  const out = { id: row.id };
  for (const [k, [col, type]] of Object.entries(fields)) {
    const v = row[col];
    out[k] = type === "j" ? J(v) : type === "b" ? !!v : v;
  }
  return out;
};
const pick = (fields, body, forInsert) => {
  const cols = [], vals = [];
  for (const [k, [col, type]] of Object.entries(fields)) {
    if (body[k] === undefined) continue;
    cols.push(col); vals.push(toDb(type, body[k]));
  }
  return { cols, vals };
};

const resumeRow = (db) => db.prepare("SELECT * FROM files WHERE kind='RESUME' AND is_active=1 ORDER BY version DESC LIMIT 1").first();

// ───────────── middleware ─────────────
app.onError((err, c) => {
  let status = err.status || 500, message = err.message || "Internal Server Error";
  if (/FOREIGN KEY/i.test(message)) { status = 400; message = "Invalid reference (related record does not exist)"; }
  else if (/UNIQUE/i.test(message)) { status = 409; message = "Already exists"; }
  if (status >= 500) console.error(err.stack || err);
  return c.json({ success: false, error: status >= 500 ? "Internal Server Error" : message }, status);
});

app.use("/api/*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
});
// Same-origin in production; CORS only matters if you call the API from another origin (CORS_ORIGINS, comma-separated).
app.use("/api/*", (c, next) => {
  const list = (c.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? cors({ origin: list, exposeHeaders: ["Content-Disposition"] })(c, next) : next();
});

const admin = new Hono();
admin.use("*", async (c, next) => {
  const expected = c.env.ADMIN_API_KEY;
  if (!expected) throw new HttpError(503, "ADMIN_API_KEY is not configured");
  const given = c.req.header("x-admin-key") || "";
  const enc = new TextEncoder();
  const a = enc.encode(given), b = enc.encode(expected);
  if (a.length !== b.length || !crypto.subtle.timingSafeEqual(a, b)) throw new HttpError(401, "Unauthorized");
  await next();
});

// ───────────── health ─────────────
app.get("/api/health", (c) => c.json({ ok: true }));

// ───────────── public: profile ─────────────
app.get("/api/profile", async (c) => {
  const db = c.env.DB;
  const all = (t, order) => db.prepare(`SELECT * FROM ${t} ORDER BY ${order}`).all().then((r) => r.results);
  const [profile, exps, projs, skills, edu, certs, resume] = await Promise.all([
    db.prepare("SELECT * FROM profile LIMIT 1").first(),
    all("experiences", RESOURCES.experiences.order), all("projects", RESOURCES.projects.order),
    all("skill_groups", "sort_order ASC"), all("education", "sort_order ASC"), all("certifications", "sort_order ASC"),
    resumeRow(db)
  ]);
  c.header("Cache-Control", "public, max-age=60");
  return ok(c, {
    profile: mapProfile(profile),
    experiences: exps.map((r) => fromDb(RESOURCES.experiences.fields, r)),
    projects: projs.map((r) => fromDb(RESOURCES.projects.fields, r)),
    skillGroups: skills.map((r) => fromDb(RESOURCES.skills.fields, r)),
    education: edu.map((r) => fromDb(RESOURCES.education.fields, r)),
    certifications: certs.map((r) => fromDb(RESOURCES.certifications.fields, r)),
    resume: resume && { id: resume.id, filename: resume.filename, version: resume.version, sizeBytes: resume.size_bytes, createdAt: resume.created_at }
  });
});

// ───────────── public: resume ─────────────
app.get("/api/resume", async (c) => {
  const f = await resumeRow(c.env.DB);
  if (!f) throw new HttpError(404, "No resume uploaded yet");
  return ok(c, mapFile(f));
});

const fileBytes = async (db, file) => {
  const { results } = await db.prepare("SELECT data FROM file_chunks WHERE file_id=? ORDER BY idx").bind(file.id).all();
  const parts = results.map((r) => Uint8Array.from(atob(r.data), (ch) => ch.charCodeAt(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const fileResponse = (file, bytes, disposition) =>
  new Response(bytes, { headers: {
    "Content-Type": file.mime_type, "Content-Length": String(bytes.length),
    "Content-Disposition": `${disposition}; filename="${file.filename}"`, "Cache-Control": "no-cache", ETag: `"${file.sha256}"`
  } });

app.get("/api/resume/download", async (c) => {
  const db = c.env.DB;
  const file = await resumeRow(db);
  if (!file) throw new HttpError(404, "No resume uploaded yet");
  const inline = c.req.query("inline") === "1";
  const visitorId = Number(c.req.query("visitorId")) || -1;
  c.executionCtx.waitUntil(
    db.prepare("INSERT INTO downloads (visitor_id, file_id, download_type) VALUES ((SELECT id FROM visitors WHERE id=?), ?, ?)")
      .bind(visitorId, file.id, inline ? "resume_view" : "resume_download").run().catch((e) => console.error("download tracking failed:", e.message))
  );
  return fileResponse(file, await fileBytes(db, file), inline ? "inline" : "attachment");
});

// ───────────── public: contact form ─────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
app.post("/api/messages", async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const name = clean(body.name, 100), email = clean(body.email, 200), subject = clean(body.subject, 200) || null, message = clean(body.message, 5000);
  if (!name || !email || !message) throw new HttpError(400, "name, email and message are required");
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Please provide a valid email address");
  if (body.website) return c.json({ success: true }, 201); // honeypot

  const addr = ip(c);
  if (addr) { // 10 messages / hour / IP
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE ip_address=? AND created_at>?").bind(addr, since).first();
    if (n >= 10) throw new HttpError(429, "Too many requests, please try again later.");
  }
  const saved = await db.prepare("INSERT INTO messages (name,email,subject,message,ip_address) VALUES (?,?,?,?,?) RETURNING id, created_at")
    .bind(name, email, subject, message, addr).first();
  return ok(c, { id: saved.id, createdAt: saved.created_at }, 201);
});

// ───────────── public: visitors + analytics ─────────────
const cl = (v, max = 300) => (v == null ? null : String(v).slice(0, max));
app.post("/api/visitors", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const cf = c.req.raw.cf || {};
  const uuid = crypto.randomUUID();
  const r = await c.env.DB.prepare("INSERT INTO visitors (visitor_uuid, ip_address, browser, device, os, country, city) VALUES (?,?,?,?,?,?,?) RETURNING id, visitor_uuid, created_at")
    .bind(uuid, ip(c), cl(b.browser), cl(b.device, 50), cl(b.os, 100), cl(b.country || cf.country, 100), cl(b.city || cf.city, 100)).first();
  return ok(c, { id: r.id, visitorUuid: r.visitor_uuid, createdAt: r.created_at }, 201);
});

app.post("/api/analytics/page-view", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const visitorId = Number(b.visitorId), pageName = clean(b.pageName, 100);
  if (!visitorId || !pageName) throw new HttpError(400, "visitorId and pageName are required");
  const r = await c.env.DB.prepare("INSERT INTO page_visits (visitor_id, page_name, time_spent, click_count, referrer) VALUES (?,?,?,?,?) RETURNING *")
    .bind(visitorId, pageName, num(b.timeSpent), num(b.clickCount), b.referrer ? String(b.referrer).slice(0, 500) : null).first();
  return ok(c, r, 201);
});

app.post("/api/analytics/download", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const visitorId = Number(b.visitorId), downloadType = clean(b.downloadType, 50);
  if (!visitorId || !downloadType) throw new HttpError(400, "visitorId and downloadType are required");
  const r = await c.env.DB.prepare("INSERT INTO downloads (visitor_id, download_type) VALUES (?,?) RETURNING *").bind(visitorId, downloadType).first();
  return ok(c, r, 201);
});

// ───────────── admin: stats + inbox ─────────────
admin.get("/stats", async (c) => {
  const db = c.env.DB;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const count = (sql, ...b) => db.prepare(sql).bind(...b).first("n");
  const rows = (sql) => db.prepare(sql).all().then((r) => r.results);
  const [totalVisitors, totalMessages, unreadMessages, totalPageViews, totalDownloads, visitors7d, top, dl, dev, recent] = await Promise.all([
    count("SELECT COUNT(*) n FROM visitors"), count("SELECT COUNT(*) n FROM messages"), count("SELECT COUNT(*) n FROM messages WHERE is_read=0"),
    count("SELECT COUNT(*) n FROM page_visits"), count("SELECT COUNT(*) n FROM downloads"), count("SELECT COUNT(*) n FROM visitors WHERE created_at>=?", since),
    rows("SELECT page_name, COUNT(*) n FROM page_visits GROUP BY page_name ORDER BY n DESC LIMIT 10"),
    rows("SELECT download_type, COUNT(*) n FROM downloads GROUP BY download_type"),
    rows("SELECT device, COUNT(*) n FROM visitors GROUP BY device"),
    rows("SELECT id, name, email, subject, created_at, is_read FROM messages ORDER BY created_at DESC LIMIT 5")
  ]);
  return ok(c, {
    totalVisitors, totalMessages, unreadMessages, totalPageViews, totalDownloads, visitorsLast7Days: visitors7d,
    topSections: top.map((s) => ({ section: s.page_name, views: s.n })),
    downloadsByType: dl.map((d) => ({ type: d.download_type, count: d.n })),
    devices: dev.map((d) => ({ device: d.device || "unknown", count: d.n })),
    recentMessages: recent.map((m) => ({ id: m.id, name: m.name, email: m.email, subject: m.subject, createdAt: m.created_at, isRead: !!m.is_read }))
  });
});

admin.get("/messages", async (c) => {
  const where = c.req.query("unread") === "1" ? "WHERE is_read=0" : "";
  const { results } = await c.env.DB.prepare(`SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT 200`).all();
  return ok(c, results.map(mapMessage));
});
admin.patch("/messages/:id/read", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const r = await c.env.DB.prepare("UPDATE messages SET is_read=? WHERE id=? RETURNING *").bind(b.isRead === false ? 0 : 1, Number(c.req.param("id"))).first();
  if (!r) throw new HttpError(404, "Record not found");
  return ok(c, mapMessage(r));
});
admin.delete("/messages/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM messages WHERE id=?").bind(Number(c.req.param("id"))).run();
  if (!r.meta.changes) throw new HttpError(404, "Record not found");
  return ok(c);
});

// ───────────── admin: files (resume versions etc.) ─────────────
const KINDS = ["RESUME", "CERTIFICATE", "DOCUMENT", "IMAGE"];
const MAX_UPLOAD = 2 * 1024 * 1024; // D1 row/total limits make ~2 MB a sensible cap
const RAW_CHUNK = 30 * 1024;
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

admin.get("/files", async (c) => {
  const kind = c.req.query("kind");
  const stmt = kind ? c.env.DB.prepare("SELECT * FROM files WHERE kind=? ORDER BY created_at DESC").bind(kind.toUpperCase())
                    : c.env.DB.prepare("SELECT * FROM files ORDER BY created_at DESC");
  return ok(c, (await stmt.all()).results.map(mapFile));
});

// multipart/form-data: file=<binary>, kind=RESUME|CERTIFICATE|DOCUMENT|IMAGE
admin.post("/files", async (c) => {
  const db = c.env.DB;
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === "string") throw new HttpError(400, "Attach a file in the 'file' field");
  const kind = String(form.kind || "DOCUMENT").toUpperCase();
  if (!KINDS.includes(kind)) throw new HttpError(400, `kind must be one of ${KINDS.join(", ")}`);
  if (file.size > MAX_UPLOAD) throw new HttpError(413, "File too large (max 2 MB)");
  if (kind === "RESUME" && file.type !== "application/pdf") throw new HttpError(400, "Resume must be a PDF");

  const buf = new Uint8Array(await file.arrayBuffer());
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const last = await db.prepare("SELECT MAX(version) v FROM files WHERE kind=?").bind(kind).first("v");
  const makeActive = kind === "RESUME" ? 1 : 0;
  const filename = (file.name || "upload").replace(/[^\w.\- ]/g, "_");

  const saved = await db.prepare("INSERT INTO files (kind, filename, mime_type, size_bytes, sha256, version, is_active) VALUES (?,?,?,?,?,?,0) RETURNING *")
    .bind(kind, filename, file.type || "application/octet-stream", buf.length, sha256, (last || 0) + 1).first();
  const stmts = [];
  for (let i = 0, n = 0; i < buf.length; i += RAW_CHUNK, n++)
    stmts.push(db.prepare("INSERT INTO file_chunks (file_id, idx, data) VALUES (?,?,?)").bind(saved.id, n, b64(buf.subarray(i, i + RAW_CHUNK))));
  if (makeActive) {
    stmts.push(db.prepare("UPDATE files SET is_active=0 WHERE kind='RESUME'"));
    stmts.push(db.prepare("UPDATE files SET is_active=1 WHERE id=?").bind(saved.id));
  }
  if (stmts.length) await db.batch(stmts);
  return ok(c, mapFile({ ...saved, is_active: makeActive }), 201);
});

admin.get("/files/:id/download", async (c) => {
  const file = await c.env.DB.prepare("SELECT * FROM files WHERE id=?").bind(Number(c.req.param("id"))).first();
  if (!file) throw new HttpError(404, "Record not found");
  return fileResponse(file, await fileBytes(c.env.DB, file), "attachment");
});
admin.patch("/files/:id/activate", async (c) => {
  const id = Number(c.req.param("id"));
  const file = await c.env.DB.prepare("SELECT * FROM files WHERE id=?").bind(id).first();
  if (!file) throw new HttpError(404, "Record not found");
  if (file.kind !== "RESUME") throw new HttpError(400, "Only resumes can be activated");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE files SET is_active=0 WHERE kind='RESUME'"),
    c.env.DB.prepare("UPDATE files SET is_active=1 WHERE id=?").bind(id)
  ]);
  return ok(c);
});
admin.delete("/files/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM files WHERE id=?").bind(Number(c.req.param("id"))).run();
  if (!r.meta.changes) throw new HttpError(404, "Record not found");
  return ok(c);
});

// ───────────── admin: profile + content CRUD ─────────────
admin.put("/profile", async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { cols, vals } = pick(PROFILE_FIELDS, body);
  const existing = await db.prepare("SELECT id FROM profile LIMIT 1").first();
  let row;
  if (existing) {
    if (cols.length) row = await db.prepare(`UPDATE profile SET ${cols.map((x) => `${x}=?`).join(", ")}, updated_at=? WHERE id=? RETURNING *`).bind(...vals, nowIso(), existing.id).first();
    else row = await db.prepare("SELECT * FROM profile WHERE id=?").bind(existing.id).first();
  } else {
    row = await db.prepare(`INSERT INTO profile (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING *`).bind(...vals).first();
  }
  return ok(c, mapProfile(row));
});

for (const [path, def] of Object.entries(RESOURCES)) {
  admin.get(`/${path}`, async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${def.table} ORDER BY ${def.order}`).all();
    return ok(c, results.map((r) => fromDb(def.fields, r)));
  });
  admin.post(`/${path}`, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { cols, vals } = pick(def.fields, body);
    if (!cols.length) throw new HttpError(400, "No valid fields provided");
    const row = await c.env.DB.prepare(`INSERT INTO ${def.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING *`).bind(...vals).first();
    return ok(c, fromDb(def.fields, row), 201);
  });
  admin.put(`/${path}/:id`, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { cols, vals } = pick(def.fields, body);
    const sets = cols.map((x) => `${x}=?`); const extra = [];
    if (def.touch) { sets.push("updated_at=?"); extra.push(nowIso()); }
    if (!sets.length) throw new HttpError(400, "No valid fields provided");
    const row = await c.env.DB.prepare(`UPDATE ${def.table} SET ${sets.join(", ")} WHERE id=? RETURNING *`).bind(...vals, ...extra, Number(c.req.param("id"))).first();
    if (!row) throw new HttpError(404, "Record not found");
    return ok(c, fromDb(def.fields, row));
  });
  admin.delete(`/${path}/:id`, async (c) => {
    const r = await c.env.DB.prepare(`DELETE FROM ${def.table} WHERE id=?`).bind(Number(c.req.param("id"))).run();
    if (!r.meta.changes) throw new HttpError(404, "Record not found");
    return ok(c);
  });
}

app.route("/api/admin", admin);
app.all("/api/*", (c) => c.json({ success: false, error: "Not found" }, 404));

export default app;
