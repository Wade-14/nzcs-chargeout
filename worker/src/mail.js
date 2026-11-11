// Sends a form's PDF by email through Gmail's SMTP server, from the forms Gmail account.
// Secrets (never in this repo): MAIL_USER (the Gmail address) and MAIL_PASSWORD (a Google "app password").
// MAIL_HOST / MAIL_PORT / MAIL_TLS can point at a local test server.
import { connect } from "cloudflare:sockets";

// The app can only ever send to these addresses, so a share code can't be used to email anyone else.
export const MAIL_TO_ALLOWED = [
  "team@nzconservation.nz", "operations@nzconservation.nz", "toby@nzconservation.nz", "admin@nzconservation.nz",
];
export const MAX_PDF = 18_000_000; // bytes; Gmail's limit is 25 MB including encoding

const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const encWord = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
const wrap = (s, n = 76) => s.replace(new RegExp(`(.{${n}})`, "g"), "$1\r\n");

export const mailReady = env => !!(env.MAIL_USER && env.MAIL_PASSWORD);

function buildMessage({ from, to, subject, filename, pdfB64 }) {
  const boundary = "nzcs-" + crypto.randomUUID();
  const name = encWord(filename).replace(/"/g, "");
  return [
    `From: "NZCS Forms" <${from}>`,
    `To: ${to.join(", ")}`,
    `Subject: ${encWord(subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@nzcs-forms>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${name}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${name}"`,
    "",
    wrap(pdfB64),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendMail(env, { to, subject, filename, pdfB64 }) {
  const host = env.MAIL_HOST || "smtp.gmail.com", port = Number(env.MAIL_PORT || 465);
  const tls = (env.MAIL_TLS || "on") !== "off";
  const sock = connect({ hostname: host, port }, { secureTransport: tls ? "on" : "off", allowHalfOpen: false });
  const writer = sock.writable.getWriter(), reader = sock.readable.getReader();
  const enc = new TextEncoder(), dec = new TextDecoder();
  let buf = "";
  async function reply() {            // one SMTP reply, which may span several "250-" lines
    for (;;) {
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
          buf = lines.slice(i + 1).join("\r\n");
          return { code: Number(lines[i].slice(0, 3)), text: lines.slice(0, i + 1).join(" ") };
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("The email server closed the connection.");
      buf += dec.decode(value, { stream: true });
    }
  }
  const send = s => writer.write(enc.encode(s + "\r\n"));
  async function step(cmd, want, what) {
    if (cmd !== null) await send(cmd);
    const r = await reply();
    if (r.code !== want) throw new Error(`${what} failed (${r.code}).` + (r.code === 535 ? " The Gmail app password isn't right." : ""));
    return r;
  }
  try {
    await step(null, 220, "Connecting to the email server");
    await step("EHLO nzcs-forms", 250, "Greeting the email server");
    await step("AUTH LOGIN", 334, "Signing in");
    await step(b64(String(env.MAIL_USER).trim()), 334, "Signing in");
    await step(b64(String(env.MAIL_PASSWORD).replace(/\s+/g, "")), 235, "Signing in");
    await step(`MAIL FROM:<${String(env.MAIL_USER).trim()}>`, 250, "Sending");
    for (const t of to) await step(`RCPT TO:<${t}>`, 250, "Adding " + t);
    await step("DATA", 354, "Sending");
    const msg = buildMessage({ from: String(env.MAIL_USER).trim(), to, subject, filename, pdfB64 }).replace(/\r\n\./g, "\r\n..");
    await writer.write(enc.encode(msg + "\r\n.\r\n"));
    await step(null, 250, "Sending the email");
    try { await send("QUIT"); } catch {}
  } finally {
    try { await sock.close(); } catch {}
  }
}
