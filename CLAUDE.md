# NZCS Forms – project notes

Field-staff forms app for NZ Conservation Services Ltd (Southland, NZ). Staff fill forms on their phones; each form becomes a PDF that is emailed to the office. This file records how it's built and the decisions the owner has made, so work can continue in any session.

**This repository is public.** Never commit share codes, API keys, client secrets or other private values. The two share codes live only as Cloudflare secrets (see below).

## Where things are

| What | Where |
|---|---|
| Live app (staff use this) | https://wade-14.github.io/nzcs-chargeout/ |
| Preview (test changes here first) | https://wade-14.github.io/nzcs-chargeout/preview/ |
| Storage API (Cloudflare Worker) | https://nzcs-chargeout-api.royal-dawn-9e17.workers.dev |
| Hosting | GitHub Pages from `main`, repo root. Pushing to `main` publishes within 1–2 minutes |

## Files

- `index.html`: the app shell. Share-code screen, NZCS Forms home screen (tiles), the **Charge Out** form (multi-day, uses the storage API), install-on-home-screen banner. `STAFF` and `SEND_TO` (Charge Out recipient) are near the top of the main script.
- `forms.js`: engine for **one-off forms** plus their definitions (`FORMS`). Each form is a list of sections and fields; the engine renders, validates, builds the PDF and shares it. New forms are added here.
- `sw.js`: service worker (network-first, offline fallback). **Bump `CACHE` on every release**, in both `sw.js` and `preview/sw.js`.
- `vendor/`: jsPDF 2.5.1 and jsPDF-AutoTable 3.8.2 (local copies; the app has no external script dependencies).
- `vendor/logo.js`: the NZCS logo (from their own PDFs, 225 × 233 px) as a data URL, printed top-left on page 1 of every PDF.
- `icon-*.png`: app icons made from the round emblem on white; `-maskable` versions keep the emblem inside the safe zone for Android shapes. A sharper original logo (512 px or larger) would give a crisper icon.
- `preview/`: a full copy of the app for testing. Same files.
- `worker/`: Cloudflare Worker (`src/index.js`), D1 schema (`schema.sql`), `wrangler.toml`.

## Release process

1. Edit files in `preview/`, test (see Testing), push, and let the owner try the preview if the change is big.
2. Copy `preview/index.html` and `preview/forms.js` to the root, bump `CACHE` in both service workers, commit and push to `main`.
3. Users get updates by fully closing and reopening the app.

Worker deploy (the Cloudflare token is injected by the session's network proxy, never stored here):

```bash
cd worker && WRANGLER_SEND_METRICS=false CLOUDFLARE_API_TOKEN=proxy-injected CLOUDFLARE_ACCOUNT_ID=dc50d269d55490062b7b588156ed2fa1 npx wrangler deploy
```

## Storage (Cloudflare, owner's account)

- D1 database `nzcs-chargeout`, Oceania region. Tables `jobs`, `days`, `incidents`, `push_subs` (`worker/schema.sql`).
- Only the **Charge Out** (jobs in progress) and **Incident Report** (awaiting investigation) use it. Other one-off forms are never stored online.
- Access by share code: secrets `WORKER_CODE` (staff) and `MANAGER_CODE` (can also delete jobs). Change with `npx wrangler secret put <NAME>` in `worker/`. The codes are not written anywhere in the repo.
- A daily cron removes completed jobs older than 365 days.
- Free-plan limits (500 MB per database, 100k writes a day) are far above expected use (~20 charge outs a day at most).

## People

- **Wade McSoriley**: owner, team@nzconservation.nz
- **Gareth Coyle**: operations@nzconservation.nz
- **Sam Haliday**: admin, Admin@nzconservation.nz. Receives Charge Outs and enters them into Xero.
- Manager code holders: Wade, Sam, Gareth, Toby, plus others Wade chooses.

## Staff lists

- `STAFF` (index.html): Gareth Coyle, Wade McSoriley, Nigel Spencer, Dave Spedding, Dave Walker, Rob Grant, Jonathan Poll, Ruby Young, Brandon Muller, Tad Schultz, Toby Haliday.
- Charge Out, Spray Diary, Kill Sheet, Quad check use `STAFF`. **Sam is not on these.**
- Toolbox Meeting adds Sam Haliday (and "Other").
- Spelling is "Haliday" (as on their paper forms).

## Forms and decisions

All one-off forms go to **team@ and operations@** (Wade and Gareth). Charge Out goes to **Admin@** (Sam).

- **Charge Out** (`#charge-out`): **no pricing, rates or GST anywhere.** Date (today), job/farm typed (no suggestion lists), people from a tick list, hours worked and travelled **per person**, KM total, materials as typed item + quantity, job complete Yes/No, comments, "Filled in by" + finger signature. "No" saves to **Jobs in progress** so any phone can add the next day; "Yes" finishes and sends one PDF (job totals first, then each day with its signature). Edit past days via an Edit button. Delete jobs only with the manager code.
- **Toolbox Meeting** (`#toolbox`): mirrors their paper form. Temperature Cold/Warm/Hot; risk Low/Medium/High; "Do you feel safe" Yes/No + explain. Follow-up questions appear when trained / PPE / plant / instructed is "No". Two office notices (bird flu, Matariki tractors) are text in `forms.js`; update when Wade sends new ones. Signatures per person + visitors; photos allowed.
- **Spray Diary** (`#spray-diary`): equipment list (Knapsack 1–8, solo 1–3, quad boom / hand gun, drill and fill, cut and paste, LUV boom / hand gun, Other), PPE list. Chemicals and additives as rows: product, amount with **mL or g** switch, litres of water → rate shown as mL/L or g/L (amount ÷ litres of water). Wade saves PDFs to OneDrive (legal record).
- **Kill Sheet** (`#kill-sheet`): "Are you…" Shooting / Counting / **Filling bait stations**. Animal tally grid: Deer, Possums, Pigs, Hares, Goats, Rats, Mice. Shooting/counting columns Seen / Shot / Confirmed kills (deer only). Bait-station mode columns Seen / Found under bait stations (possums, hares, rats, mice) + Bait station notes, and hides the gun-cleaning notice. **No photo option on the kill sheet.**
- **Poison (Pesticide) Use** (`#poison-use`, Job Records): date/time, forest/farm/property (and company), location, person + staff (STAFF), poisons as rows ("+ Add another poison"): dropdown Feratox pills / Feratox bio bags / Feratox paste / Brodifacoum / Magtoxin / Double Tap / Contrac / Storm / Pindone / Other (→ type it) + quantity applied (typed, with units); signature.
- **Quad / LUV Check** (`#quad-check`): inspector from `STAFF` (no Sam), vehicles Quad 1–6, DR200 two-wheeler, Red LUV 570, Green LUV XP 1000. Tick list; unticked items print as "NOT TICKED" (sending is still allowed). Damage notes + photos. Service hours with "hours until service" / red "overdue". Red flagging like the vehicle check: unticked items and an overdue service print red and go in the "Needs attention" box.

- **Hazard Report** (`#hazard-report`): date/time, location + map, name (STAFF + Sam), photo of hazard, hazard type (tick all that apply: unsafe track, underrunner, unsafe bridge, mine shaft, weather, tree felling, black ice, steep terrain, high wind, fences/gates, access tracks, stock, wild animals, other → explain), description, GPS taken Yes/No, precautions (notified team, flagging/taped area, GPS location taken, notified landowner, other → explain), mitigation, signature. File name uses the first part of the address.
- **Vehicle Pre Start Check** (`#vehicle-check`): person from `STAFF` (no Sam), vehicle dropdown (Mitsubishi Triton LNC560, Mazda BT50 GTK24, Ford Ranger Flat Deck HLR533, Isuzu Elf Tip Truck HGY173, Mazda BT50 Flat Deck LPA794, Ford Ranger Double Cab EYB719, Nissan Navara LCU877, Toyota ToyoAce EEE422, Other → type it). WOF/rego/service due, KMs to service, RUC, odometer, photo of rego + RUC, photo of service sticker + WOF, then Yes/No checks for engine, tyres, body, lights (+ trailer plug OK / Needs attention / No trailer plug) and safety gear; notice "If anything needs attention, please see management."; comments; signature. **Problem answers** (fields with `alertIf`, e.g. WOF/rego/service due Yes, leaks Yes, damage Yes, lights/brakes/safety gear No, trailer plug Needs attention; **not** fuel or cleanliness) turn red on screen, print red with "(needs attention)", and are listed in a red "Needs attention" box at the top of the PDF.
- **Trailer Pre Start Check** (`#trailer-check`, Vehicle & Equipment Checks folder): person from `STAFF`, trailer dropdown (Jobmate 7x4 143G7, Jobmate 7x4 cage trailer 97F53, Red Briford trailer P301G, Briford 846M3, Briford tip trailer 6BR70, T Choice T989U, Single horse float 23F21, Double horse float, Other → type it). Registered Y/N + rego expiry date, WOF current Y/N + WOF expiry month, photo of labels; lights, wheels, couplings Yes/No ("Not fitted" / "Not applicable" options where the form says "if fitted / if applicable"); damage notes + damage photos; management notice; signature. Red flagging: any "No", and an expiry date already past.
- **Incident / Accident Report** (`#incident-report`, Health & Safety Forms): two parts. The employee's part (details, event type dropdown, description, injury/illness incl. treatment No treatment / First aid / Doctor → clinic, damage, employee signature) is **submitted and stored** in D1 (`incidents` table), and managers with alerts on get a phone notification. Managers (manager code) see "Incidents to investigate" on the incident page + red badges, open `#investigate-<id>`, see the employee part read-only, fill the investigation (who was contacted – multi, details, witnesses, accident/incident/near miss, training Y/N → what, controls, actions, future action, comments, date/time, manager signature), Save for later or Finish, then send one combined PDF to **team@, operations@ and toby@nzconservation.nz**. Workers can submit but never read incidents (API returns 403). Completed incidents are deleted after 365 days.
- **Staff Audit** (`#staff-audit`, **Audit Forms** folder): auditor (Toby, Wade, Gareth, Tad + Other), staff (STAFF + Jimmy Sycamore + Other, no Sam). Sections Staff preparation / Licences, equipment and PPE / Safe work practices / Field work, each with "Is this area part of the audit?" (No hides the section). Every Yes/No question uses the `ap()` helper: a "No" shows an **Action point** box and is listed in the PDF's red "Action points" box. Every audit question offers Yes / No / N/A. Field work: work method is **tick all that apply** (Trapping, Toxins, Bait stations, Detoxing share the trapping questions + work type Deploying / Checking / Removing; Planting; Spraying; Chainsaw / scrub bar (notice lists the 9 chainsaw safety features); Quad bike / LUV; Weed control), each method with a heading and its own comments box. Sign off: signature + "Area to be addressed".
- **Incident alerts**: Web Push without a message body (the service worker shows a fixed "Incident reported" notification that opens `#incident-report`). Managers turn it on per phone in the ☰ drawer. Worker endpoints `/api/push/key|subscribe|unsubscribe`; `push_subs` table; VAPID public key in `wrangler.toml` `[vars]`, private JWK in the `VAPID_PRIVATE_JWK` secret. iPhone needs the app installed to the home screen (iOS 16.4+).

## App-wide conventions

- **Home screen folders** (`FOLDERS` in index.html): Charge Out Forms (Charge Out), Job Records (Spray Diary, Kill Sheet, Poison Use), Health & Safety Forms (Toolbox, Hazard Report, Incident Report), Audit Forms (Staff Audit), Vehicle & Equipment Checks (Vehicle Check, Quad check, Trailer Check). New forms must be added to a folder (an unlisted form falls into the last folder). Folder links are `#folder-<id>`; a form's Back button returns to its folder. Folder tiles show "jobs in progress" and "Form started" badges.

- **Settings drawer** (☰ on the home screen): "Share the app" shares the live link + worker share code + install steps. The code comes from the Worker (`GET /api/share-code`, needs a valid code, only ever returns `WORKER_CODE`), so it is never in the public files.

- One-off forms live in memory only: kept while the app is open, wiped when closed or cleared. Charge Out keeps its draft on the phone.
- **PDF file name / email subject**: form type – property – **staff initials** – date, e.g. `NZCS Spray Diary - Willowbank farm - GC WM 10-11-2026.pdf`. Initials in the order ticked.
- Sending uses the phone's share menu with **only the PDF and subject** (no body text). Download PDF and "Open email" are fallbacks.
- Location: "Use my location" fills address (OpenStreetMap Nominatim) and GPS, draws a street map with a pin (OpenStreetMap tiles, credit shown), and links to Google Maps in the PDF.
- Photos: "Take photo" (camera) and "Choose from gallery" buttons; shrunk to 1280 px JPEG.
- Field prompts are plain and short (e.g. "Farm name, landowner or location"); no "e.g." brand examples in job/material boxes.
- Dates shown dd-mm-yyyy; NZ English.
- Ask Wade before adding fields or features he didn't ask for.

## Testing

- Serve the repo with `python3 -m http.server 8765` and drive it with Playwright (Chromium is preinstalled).
- Charge Out needs the API: run `npx wrangler dev --local --port 8787` in `worker/` with a `.dev.vars` file (gitignored) holding test codes and `EXTRA_ORIGINS=http://localhost:8765`. On localhost the app talks to `http://localhost:8787`.
- One-off forms: mock the API and the OpenStreetMap hosts with Playwright routes; check the generated PDF with `pdftotext`.

## Not done yet / ideas

- **Automatic email sending** (one tap, no share menu): waiting on Wade's IT company to set up a shared mailbox `forms@nzconservation.nz` + a Microsoft Graph app allowed to send as it. Then the Worker sends the PDF via Graph. A note for IT was written (Claude Doc "NZCS Forms app – email sending request for IT").
- Once automatic sending exists: Hazard Reports should alert Wade and Gareth immediately (agreed, waiting on IT).
- Aerial map instead of street map: needs a LINZ Basemaps developer key (email basemaps@linz.govt.nz). On hold; the Google Maps link is used for now.
- Later: a Microsoft 365 list for Sam with an "Entered in Xero" column; possible Xero integration.
- Hazard Report alerts could reuse the same push alerts if Wade wants them.
- More forms to come.
