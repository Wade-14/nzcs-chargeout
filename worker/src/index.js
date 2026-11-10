// NZCS charge out API: stores jobs in progress and their days in Cloudflare D1.
// Access is by share code: WORKER_CODE (staff) or MANAGER_CODE (can also delete jobs).
// The codes are Cloudflare secrets, never stored in this repository.

const ALLOWED_ORIGINS = ["https://wade-14.github.io"];
const MAX_BODY = 600_000;          // bytes; a day with a signature is ~30 KB
const MAX_SIG = 250_000;           // characters of signature data URL
const KEEP_COMPLETED_DAYS = 365;   // completed jobs are removed after a year

function cors(req, env) {
  const origin = req.headers.get("Origin") || "";
  const extra = (env.EXTRA_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = ALLOWED_ORIGINS.concat(extra).includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (req, env, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req, env) } });
const fail = (req, env, status, message) => json(req, env, { error: message }, status);

function roleFor(code, env) {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return null;
  if (env.MANAGER_CODE && c === String(env.MANAGER_CODE).toLowerCase()) return "manager";
  if (env.WORKER_CODE && c === String(env.WORKER_CODE).toLowerCase()) return "worker";
  return null;
}

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const str = (v, max = 2000) => String(v ?? "").slice(0, max);
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

// Keep only the fields the app uses, trimmed to sensible sizes.
function cleanDay(d) {
  if (!d || typeof d !== "object") throw new Error("Missing day details.");
  if (!isDate(d.date)) throw new Error("The day needs a date.");
  const people = Array.isArray(d.people) ? d.people.map(p => str(p, 80)).filter(Boolean).slice(0, 40) : [];
  if (!people.length) throw new Error("Tick at least one person.");
  const hours = {};
  for (const p of people) {
    const h = (d.hours && d.hours[p]) || {};
    hours[p] = { work: str(h.work, 10), travel: str(h.travel, 10) };
  }
  const materials = Array.isArray(d.materials)
    ? d.materials.map(m => ({ item: str(m && m.item, 120), qty: str(m && m.qty, 60) })).filter(m => m.item).slice(0, 50) : [];
  const signature = str(d.signature, MAX_SIG + 1);
  if (!str(d.signedBy, 80).trim()) throw new Error("Pick who filled in this day.");
  if (!signature.startsWith("data:image/png;base64,")) throw new Error("The day needs a signature.");
  if (signature.length > MAX_SIG) throw new Error("The signature is too large. Clear it and sign again.");
  return {
    date: d.date,
    data: { people, hours, km: str(d.km, 12), materials, tasks: str(d.tasks, 4000), comments: str(d.comments, 4000), signedBy: str(d.signedBy, 80) },
    signature,
  };
}

async function readBody(req) {
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > MAX_BODY) throw new Error("That's too much data to save in one go.");
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Error("That's too much data to save in one go.");
  try { return JSON.parse(text || "{}"); } catch { throw new Error("The app sent something unreadable. Reload and try again."); }
}

async function jobSummaries(env, status) {
  const { results } = await env.DB.prepare(
    `SELECT j.id, j.job_name, j.status, j.created_at, j.updated_at, j.completed_at,
            COUNT(d.id) AS day_count, MAX(d.day_date) AS last_date
       FROM jobs j LEFT JOIN days d ON d.job_id = j.id
      WHERE j.status = ?1
      GROUP BY j.id ORDER BY j.updated_at DESC LIMIT 200`).bind(status).all();
  // Totals for the list, without sending signatures.
  const ids = results.map(r => r.id);
  const totals = {};
  if (ids.length) {
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
    const days = await env.DB.prepare(`SELECT job_id, data FROM days WHERE job_id IN (${placeholders})`).bind(...ids).all();
    for (const row of days.results) {
      const d = JSON.parse(row.data);
      const t = totals[row.job_id] || (totals[row.job_id] = { work: 0, travel: 0, km: 0 });
      for (const p of d.people) { t.work += parseFloat(d.hours[p]?.work) || 0; t.travel += parseFloat(d.hours[p]?.travel) || 0; }
      t.km += parseFloat(d.km) || 0;
    }
  }
  return results.map(r => ({ ...r, totals: totals[r.id] || { work: 0, travel: 0, km: 0 } }));
}

async function getJob(env, id) {
  const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?1").bind(id).first();
  if (!job) return null;
  const { results } = await env.DB.prepare("SELECT id, day_date, data, signature, created_at, updated_at FROM days WHERE job_id = ?1 ORDER BY day_date, created_at").bind(id).all();
  job.days = results.map(r => ({ id: r.id, date: r.day_date, ...JSON.parse(r.data), signature: r.signature, created_at: r.created_at, updated_at: r.updated_at }));
  return job;
}

async function handle(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req, env) });
  if (path === "" || path === "/") return json(req, env, { ok: true, service: "nzcs-chargeout" });

  const role = roleFor(req.headers.get("X-Access-Code"), env);
  if (path === "/api/login" && req.method === "POST") {
    let code = req.headers.get("X-Access-Code");
    if (!code) { try { code = (await readBody(req)).code; } catch {} }
    const r = roleFor(code, env);
    return r ? json(req, env, { role: r }) : fail(req, env, 401, "That code isn't right. Check it and try again.");
  }
  if (!role) return fail(req, env, 401, "Your share code isn't valid any more. Enter the current code.");

  let m;
  // The worker share code, for the app's "Share the app" message (never the manager code)
  if (path === "/api/share-code" && req.method === "GET") return json(req, env, { code: env.WORKER_CODE || "" });
  // List jobs: /api/jobs?status=open|complete
  if (path === "/api/jobs" && req.method === "GET") {
    const status = url.searchParams.get("status") === "complete" ? "complete" : "open";
    return json(req, env, { jobs: await jobSummaries(env, status), role });
  }
  // Start a charge out with its first day
  if (path === "/api/jobs" && req.method === "POST") {
    const body = await readBody(req);
    const jobName = str(body.job_name, 200).trim();
    if (!jobName) return fail(req, env, 400, "Type the job name.");
    const day = cleanDay(body.day);
    const t = now(), jobId = uid(), dayId = uid();
    const complete = !!body.complete;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO jobs (id, job_name, status, created_at, updated_at, completed_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5)")
        .bind(jobId, jobName, complete ? "complete" : "open", t, complete ? t : null),
      env.DB.prepare("INSERT INTO days (id, job_id, day_date, data, signature, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)")
        .bind(dayId, jobId, day.date, JSON.stringify(day.data), day.signature, t),
    ]);
    return json(req, env, { job: await getJob(env, jobId) }, 201);
  }
  // One job with all its days
  if ((m = path.match(/^\/api\/jobs\/([\w-]{36})$/))) {
    const id = m[1];
    if (req.method === "GET") {
      const job = await getJob(env, id);
      return job ? json(req, env, { job, role }) : fail(req, env, 404, "That job no longer exists. It may have been deleted.");
    }
    if (req.method === "DELETE") {
      if (role !== "manager") return fail(req, env, 403, "Only managers can delete jobs.");
      await env.DB.batch([
        env.DB.prepare("DELETE FROM days WHERE job_id = ?1").bind(id),
        env.DB.prepare("DELETE FROM jobs WHERE id = ?1").bind(id),
      ]);
      return json(req, env, { deleted: id });
    }
  }
  // Add a day to a job in progress
  if ((m = path.match(/^\/api\/jobs\/([\w-]{36})\/days$/)) && req.method === "POST") {
    const id = m[1];
    const job = await env.DB.prepare("SELECT status FROM jobs WHERE id = ?1").bind(id).first();
    if (!job) return fail(req, env, 404, "That job no longer exists. It may have been deleted.");
    if (job.status !== "open") return fail(req, env, 409, "That job has already been finished and sent for charging.");
    const body = await readBody(req);
    const day = cleanDay(body.day);
    const t = now(), complete = !!body.complete;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO days (id, job_id, day_date, data, signature, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)")
        .bind(uid(), id, day.date, JSON.stringify(day.data), day.signature, t),
      env.DB.prepare("UPDATE jobs SET updated_at = ?2, status = ?3, completed_at = ?4 WHERE id = ?1")
        .bind(id, t, complete ? "complete" : "open", complete ? t : null),
    ]);
    return json(req, env, { job: await getJob(env, id) }, 201);
  }
  // Finish a job in progress without adding another day
  if ((m = path.match(/^\/api\/jobs\/([\w-]{36})\/complete$/)) && req.method === "POST") {
    const id = m[1];
    const job = await env.DB.prepare("SELECT status FROM jobs WHERE id = ?1").bind(id).first();
    if (!job) return fail(req, env, 404, "That job no longer exists. It may have been deleted.");
    if (job.status === "open") { const t = now(); await env.DB.prepare("UPDATE jobs SET status = 'complete', completed_at = ?2, updated_at = ?2 WHERE id = ?1").bind(id, t).run(); }
    return json(req, env, { job: await getJob(env, id) });
  }
  // Edit a past day (and optionally finish the job)
  if ((m = path.match(/^\/api\/jobs\/([\w-]{36})\/days\/([\w-]{36})$/)) && req.method === "PUT") {
    const [, id, dayId] = m;
    const existing = await env.DB.prepare("SELECT d.id, j.status FROM days d JOIN jobs j ON j.id = d.job_id WHERE d.id = ?1 AND d.job_id = ?2").bind(dayId, id).first();
    if (!existing) return fail(req, env, 404, "That day no longer exists.");
    if (existing.status !== "open") return fail(req, env, 409, "That job has already been finished and sent for charging.");
    const body = await readBody(req);
    const day = cleanDay(body.day);
    const t = now(), complete = !!body.complete;
    await env.DB.batch([
      env.DB.prepare("UPDATE days SET day_date = ?2, data = ?3, signature = ?4, updated_at = ?5 WHERE id = ?1")
        .bind(dayId, day.date, JSON.stringify(day.data), day.signature, t),
      env.DB.prepare("UPDATE jobs SET updated_at = ?2, status = ?3, completed_at = ?4 WHERE id = ?1")
        .bind(id, t, complete ? "complete" : "open", complete ? t : null),
    ]);
    return json(req, env, { job: await getJob(env, id) });
  }
  return fail(req, env, 404, "Not found.");
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (err) { return fail(req, env, 400, err && err.message ? err.message : "Something went wrong."); }
  },
  // Daily tidy-up: remove completed jobs older than a year (they're in Sam's email as PDFs).
  async scheduled(_event, env) {
    const cutoff = new Date(Date.now() - KEEP_COMPLETED_DAYS * 86400000).toISOString();
    const { results } = await env.DB.prepare("SELECT id FROM jobs WHERE status = 'complete' AND completed_at < ?1").bind(cutoff).all();
    for (const r of results) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM days WHERE job_id = ?1").bind(r.id),
        env.DB.prepare("DELETE FROM jobs WHERE id = ?1").bind(r.id),
      ]);
    }
  },
};
