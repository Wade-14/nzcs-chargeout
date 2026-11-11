// NZCS charge out API: stores jobs in progress and their days in Cloudflare D1.
// Access is by share code: WORKER_CODE (staff) or MANAGER_CODE (can also delete jobs).
// The codes are Cloudflare secrets, never stored in this repository.

import { sendMail, mailReady, MAIL_TO_ALLOWED, MAX_PDF } from "./mail.js";

const ALLOWED_ORIGINS = ["https://wade-14.github.io"];
const MAX_BODY = 600_000;          // bytes; a day with a signature is ~30 KB
const MAX_SIG = 250_000;           // characters of signature data URL
const KEEP_COMPLETED_DAYS = 365;
const JOB_KINDS = ["pest", "enviro"];   // Charge Out – Pest Control / Environmental Enhancement   // completed jobs are removed after a year

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
    ? d.materials.map(m => ({ item: str(m && m.item, 250), qty: str(m && m.qty, 60) })).filter(m => m.item).slice(0, 50) : [];
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
    `SELECT j.id, j.job_name, j.kind, j.status, j.created_at, j.updated_at, j.completed_at,
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

// A tracked day's timer is removed in the same batch that saves the day.
const timerCleanup = (env, body) => body && body.timer_id ? [env.DB.prepare("DELETE FROM timers WHERE id = ?1").bind(str(body.timer_id, 40))] : [];

async function getJob(env, id) {
  const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?1").bind(id).first();
  if (!job) return null;
  const { results } = await env.DB.prepare("SELECT id, day_date, data, signature, created_at, updated_at FROM days WHERE job_id = ?1 ORDER BY day_date, created_at").bind(id).all();
  job.days = results.map(r => ({ id: r.id, date: r.day_date, ...JSON.parse(r.data), signature: r.signature, created_at: r.created_at, updated_at: r.updated_at }));
  return job;
}

/* ---------- Incident alerts (Web Push, no message body) ----------
   Phones subscribe with their push address; when an incident is submitted we "ping" each one.
   The app's service worker then shows "Incident reported – needs investigation".
   Signed with the VAPID key pair: public key in VAPID_PUBLIC (var), private JWK in VAPID_PRIVATE_JWK (secret). */
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.apple\.com$/, /\.mozilla\.com$/, /\.notify\.windows\.com$/, /^fcm\.googleapis\.com$/];
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = str => b64url(new TextEncoder().encode(str));
async function vapidJWT(env, aud){
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey("jwk", jwk, {name:"ECDSA", namedCurve:"P-256"}, false, ["sign"]);
  const head = b64urlText(JSON.stringify({typ:"JWT", alg:"ES256"}));
  const body = b64urlText(JSON.stringify({aud, exp: Math.floor(Date.now()/1000) + 12*3600, sub:"https://wade-14.github.io/nzcs-chargeout/"}));
  const sig = await crypto.subtle.sign({name:"ECDSA", hash:"SHA-256"}, key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(sig);
}
async function notifyManagers(env){
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC) return;
  const { results } = await env.DB.prepare("SELECT endpoint FROM push_subs").all();
  await Promise.all(results.map(async ({endpoint}) => {
    try{
      const jwt = await vapidJWT(env, new URL(endpoint).origin);
      const r = await fetch(endpoint, {method:"POST", headers:{"Authorization":`vapid t=${jwt}, k=${env.VAPID_PUBLIC}`, "TTL":"86400", "Urgency":"high", "Content-Length":"0"}});
      if (r.status === 404 || r.status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?1").bind(endpoint).run();
    }catch(e){ /* one bad subscription shouldn't stop the others */ }
  }));
}
function okEndpoint(u){
  try{ const url = new URL(u); return url.protocol === "https:" && PUSH_HOSTS.some(rx => rx.test(url.hostname)); }catch(e){ return false; }
}
function cleanIncidentPart(obj){
  if (!obj || typeof obj !== "object") throw new Error("Missing incident details.");
  const text = JSON.stringify(obj);
  if (text.length > 500000) throw new Error("That's too much to save in one go. Remove a photo or two and try again.");
  return text;
}

async function handle(req, env, ctx) {
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
  /* ---------- Email sending (PDF from the forms Gmail account) ---------- */
  if (path === "/api/mail" && req.method === "GET") return json(req, env, { ready: mailReady(env) });
  if (path === "/api/mail" && req.method === "POST") {
    if (!mailReady(env)) return fail(req, env, 503, "Email sending isn't set up yet.");
    const len = Number(req.headers.get("Content-Length") || 0);
    if (len > MAX_PDF * 1.4) return fail(req, env, 413, "The PDF is too big to email. Take out some photos and try again.");
    let body; try { body = JSON.parse(await req.text()); } catch { return fail(req, env, 400, "The app sent something unreadable. Reload and try again."); }
    const to = Array.from(new Set((Array.isArray(body.to) ? body.to : []).map(t => String(t).trim().toLowerCase())));
    if (!to.length || to.some(t => !MAIL_TO_ALLOWED.includes(t))) return fail(req, env, 400, "The app can only email the office addresses.");
    const subject = str(body.subject, 200).replace(/[\r\n]+/g, " ").trim() || "NZCS form";
    const filename = (str(body.filename, 200).replace(/[\r\n"\\/:*?<>|]+/g, "-").trim() || "NZCS form") .replace(/(\.pdf)?$/i, ".pdf");
    const pdfB64 = String(body.pdf || "").replace(/\s+/g, "");
    if (!/^JVBER/.test(pdfB64) || pdfB64.length > MAX_PDF * 1.37) return fail(req, env, 400, "The PDF didn't come through. Try again.");
    const text = str(body.text, 4000).trim();
    try { await sendMail(env, { to, subject, filename, pdfB64, text }); }
    catch (err) { return fail(req, env, 502, "The email didn't send (" + String(err && err.message || "unknown problem").replace(/\.$/, "") + ")."); }
    return json(req, env, { sent: true, to });
  }
  /* ---------- Incident reports ---------- */
  // Anyone with a code can submit the employee's part; managers are alerted.
  if (path === "/api/incidents" && req.method === "POST") {
    const body = await readBody(req);
    const report = cleanIncidentPart(body.report);
    const t = now(), id = uid();
    await env.DB.prepare("INSERT INTO incidents (id, status, reported_by, summary, report, created_at, updated_at) VALUES (?1, 'open', ?2, ?3, ?4, ?5, ?5)")
      .bind(id, str(body.reported_by, 120), str(body.summary, 200), report, t).run();
    if (ctx && ctx.waitUntil) ctx.waitUntil(notifyManagers(env)); else await notifyManagers(env);
    return json(req, env, { id }, 201);
  }
  // Everything else about incidents is managers only (they can hold injury and medical details).
  if (path.startsWith("/api/incidents") && role !== "manager") return fail(req, env, 403, "Only managers can open incident reports.");
  if (path === "/api/incidents" && req.method === "GET") {
    const status = url.searchParams.get("status") === "complete" ? "complete" : "open";
    const { results } = await env.DB.prepare("SELECT id, status, reported_by, summary, created_at, updated_at, completed_at FROM incidents WHERE status = ?1 ORDER BY created_at DESC LIMIT 200").bind(status).all();
    return json(req, env, { incidents: results });
  }
  if ((m = path.match(/^\/api\/incidents\/([\w-]{36})$/))) {
    const id = m[1];
    if (req.method === "GET") {
      const r = await env.DB.prepare("SELECT * FROM incidents WHERE id = ?1").bind(id).first();
      if (!r) return fail(req, env, 404, "That incident no longer exists. It may have been deleted.");
      return json(req, env, { incident: { ...r, report: JSON.parse(r.report), investigation: JSON.parse(r.investigation || "{}") } });
    }
    if (req.method === "PUT") {
      const body = await readBody(req);
      const inv = cleanIncidentPart(body.investigation);
      const complete = !!body.complete, t = now();
      const r = await env.DB.prepare("UPDATE incidents SET investigation = ?2, status = ?3, completed_at = ?4, updated_at = ?5 WHERE id = ?1")
        .bind(id, inv, complete ? "complete" : "open", complete ? t : null, t).run();
      if (!r.meta || !r.meta.changes) return fail(req, env, 404, "That incident no longer exists. It may have been deleted.");
      return json(req, env, { id, status: complete ? "complete" : "open" });
    }
    if (req.method === "DELETE") {
      await env.DB.prepare("DELETE FROM incidents WHERE id = ?1").bind(id).run();
      return json(req, env, { deleted: id });
    }
  }
  /* ---------- Alert subscriptions (managers) ---------- */
  if (path === "/api/push/key" && req.method === "GET") return json(req, env, { key: env.VAPID_PUBLIC || "" });
  if (path === "/api/push/subscribe" && req.method === "POST") {
    if (role !== "manager") return fail(req, env, 403, "Only managers can turn on incident alerts.");
    const body = await readBody(req), endpoint = str(body.endpoint, 1000);
    if (!okEndpoint(endpoint)) return fail(req, env, 400, "This phone's notification service isn't supported.");
    await env.DB.prepare("INSERT OR REPLACE INTO push_subs (endpoint, created_at) VALUES (?1, ?2)").bind(endpoint, now()).run();
    return json(req, env, { subscribed: true });
  }
  if (path === "/api/push/unsubscribe" && req.method === "POST") {
    const body = await readBody(req);
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?1").bind(str(body.endpoint, 1000)).run();
    return json(req, env, { subscribed: false });
  }
  /* ---------- Time tracking (Environmental Enhancement Charge Out) ---------- */
  // Running and stopped timers that haven't been saved into a day yet. Any crew phone can see and stop them.
  if (path === "/api/timers" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM timers ORDER BY started_at DESC LIMIT 100").all();
    return json(req, env, { timers: results });
  }
  if (path === "/api/timers" && req.method === "POST") {
    const body = await readBody(req);
    const kind = JOB_KINDS.includes(body.kind) ? body.kind : "enviro";
    let jobId = null, jobName = str(body.job_name, 200).trim();
    if (body.job_id) {
      const job = await env.DB.prepare("SELECT id, job_name, status FROM jobs WHERE id = ?1").bind(str(body.job_id, 40)).first();
      if (!job) return fail(req, env, 404, "That job no longer exists. It may have been deleted.");
      if (job.status !== "open") return fail(req, env, 409, "That job has already been finished and sent for charging.");
      jobId = job.id; jobName = job.job_name;
    }
    if (!jobName) return fail(req, env, 400, "Type the job name first.");
    const t = now(), id = uid();
    await env.DB.prepare("INSERT INTO timers (id, kind, job_id, job_name, started_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)").bind(id, kind, jobId, jobName, t).run();
    return json(req, env, { timer: await env.DB.prepare("SELECT * FROM timers WHERE id = ?1").bind(id).first() }, 201);
  }
  if ((m = path.match(/^\/api\/timers\/([\w-]{36})(\/stop)?$/))) {
    const id = m[1];
    const timer = await env.DB.prepare("SELECT * FROM timers WHERE id = ?1").bind(id).first();
    if (req.method === "DELETE") { await env.DB.prepare("DELETE FROM timers WHERE id = ?1").bind(id).run(); return json(req, env, { deleted: id }); }
    if (!timer) return fail(req, env, 404, "This tracked day has already been saved or cancelled on another phone.");
    if (m[2] && req.method === "POST") {
      if (!timer.stopped_at) { timer.stopped_at = now(); await env.DB.prepare("UPDATE timers SET stopped_at = ?2 WHERE id = ?1").bind(id, timer.stopped_at).run(); }
      return json(req, env, { timer });
    }
    if (!m[2] && req.method === "GET") return json(req, env, { timer });
    // Fix a start or finish time that was tapped late or early.
    if (!m[2] && req.method === "PUT") {
      const body = await readBody(req);
      const ok = v => v && !isNaN(Date.parse(v)) && Date.parse(v) <= Date.now() + 5 * 60000;
      const start = body.started_at !== undefined ? body.started_at : timer.started_at;
      const stop = body.stopped_at !== undefined ? body.stopped_at : timer.stopped_at;
      if (!ok(start) || (stop && !ok(stop))) return fail(req, env, 400, "That time isn't valid, or it's in the future.");
      if (stop && Date.parse(stop) <= Date.parse(start)) return fail(req, env, 400, "The finish time must be after the start time.");
      const s2 = new Date(start).toISOString(), e2 = stop ? new Date(stop).toISOString() : null;
      await env.DB.prepare("UPDATE timers SET started_at = ?2, stopped_at = ?3 WHERE id = ?1").bind(id, s2, e2).run();
      return json(req, env, { timer: { ...timer, started_at: s2, stopped_at: e2 } });
    }
  }
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
    const kind = JOB_KINDS.includes(body.kind) ? body.kind : "pest";
    const t = now(), jobId = uid(), dayId = uid();
    const complete = !!body.complete;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO jobs (id, job_name, kind, status, created_at, updated_at, completed_at) VALUES (?1, ?2, ?6, ?3, ?4, ?4, ?5)")
        .bind(jobId, jobName, complete ? "complete" : "open", t, complete ? t : null, kind),
      env.DB.prepare("INSERT INTO days (id, job_id, day_date, data, signature, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)")
        .bind(dayId, jobId, day.date, JSON.stringify(day.data), day.signature, t),
      ...timerCleanup(env, body),
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
      ...timerCleanup(env, body),
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
  async fetch(req, env, ctx) {
    try { return await handle(req, env, ctx); }
    catch (err) { return fail(req, env, 400, err && err.message ? err.message : "Something went wrong."); }
  },
  // Daily tidy-up: remove completed jobs older than a year (they're in Sam's email as PDFs).
  async scheduled(_event, env) {
    const cutoff = new Date(Date.now() - KEEP_COMPLETED_DAYS * 86400000).toISOString();
    await env.DB.prepare("DELETE FROM incidents WHERE status = 'complete' AND completed_at < ?1").bind(cutoff).run();
    // Timers nobody saved into a day within a fortnight are forgotten.
    await env.DB.prepare("DELETE FROM timers WHERE started_at < ?1").bind(new Date(Date.now() - 14 * 86400000).toISOString()).run();
    const { results } = await env.DB.prepare("SELECT id FROM jobs WHERE status = 'complete' AND completed_at < ?1").bind(cutoff).all();
    for (const r of results) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM days WHERE job_id = ?1").bind(r.id),
        env.DB.prepare("DELETE FROM jobs WHERE id = ?1").bind(r.id),
      ]);
    }
  },
};
