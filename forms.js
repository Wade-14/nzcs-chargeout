/* NZCS Forms: one-off forms (filled in and sent in one go, nothing stored online).
   Each form is a list of sections and questions. The engine draws the form, checks it,
   builds the PDF (with signatures and photos) and hands it to email.
   Unfinished forms live only in memory: they're gone once the app is closed. */
(function(){
"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad2 = v => String(v).padStart(2, "0");
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const dmy = iso => iso ? iso.slice(0,10).split("-").reverse().join("-") : "";
const dmyTime = v => v ? dmy(v) + (v.length > 10 ? " " + v.slice(11,16) : "") : "";
const STAFF = () => (window.NZCS_STAFF || []);

/* ---------------- Form definitions ---------------- */
const YN = ["Yes", "No"];
const FORMS = {
  toolbox: {
    hash: "#toolbox",
    title: "Toolbox Meeting",
    pdfTitle: "NZCS Toolbox Meeting",
    blurb: "Daily pre-start: hazards, health, weather and activities, signed by the crew.",
    sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
    sendToLabel: "Wade and Gareth",
    icon: '<path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9 9V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><path d="M4 13h16"/>',
    titleFrom: v => `${v.job || "Job"} ${dmy(v.when)}`,
    extraPeople: ["Sam Haliday", "Toby Haliday"],
    sections: [
      { title: "Meeting information", fields: [
        { id:"when", type:"datetime", label:"Date & time", required:true },
        { id:"job", type:"text", label:"Job Name / Farm / PCA", placeholder:"Farm name, landowner or location", required:true },
        { id:"staff", type:"people", label:"Staff involved in meeting", other:true, required:true },
        { id:"otherWho", type:"textarea", label:"If other, please provide name and where they are from", showIf:v => (v.staff||[]).includes("Other") },
        { id:"location", type:"location", label:"Location" },
      ]},
      { title: "Bio-security", fields: [
        { type:"notice", text:"Please consider the new bird flu going around, talk about what signs to look for and how we can prevent possibly carrying this between farms (clean equipment, avoid touching bird droppings, make note and report sick or dead birds)." },
        { id:"bioIssues", type:"choice", options:YN, label:"Are there any bio-security issues at the moment?" },
        { id:"bioWhat", type:"textarea", label:"What are they and how to prevent transmission", showIf:v => v.bioIssues === "Yes" },
      ]},
      { title: "Site specific safety hazards", fields: [
        { id:"siteHazards", type:"textarea", label:"List site specific hazards" },
        { id:"mitigation", type:"textarea", label:"Hazard mitigation measures (what will you do about the hazards)" },
      ]},
      { title: "Health and fitness", fields: [
        { id:"fit", type:"choice", options:YN, label:"Is everyone fit for work?" },
        { id:"fatigued", type:"choice", options:YN, label:"Is anybody feeling fatigued?" },
        { id:"fatiguedWhy", type:"textarea", label:"Please elaborate. Who, how, why etc.", showIf:v => v.fatigued === "Yes" },
        { id:"meds", type:"choice", options:YN, label:"Anybody on medication that may affect their ability to perform today's work activities?" },
        { id:"medsWhat", type:"textarea", label:"Record details", showIf:v => v.meds === "Yes" },
      ]},
      { title: "Today's information", fields: [
        { id:"weather", type:"multi", label:"Weather for today", options:["Sunny","Windy","Rain","Stormy","Snow","Overcast","Foggy","Dark (working at night)","Morning frost"] },
        { id:"temp", type:"choice", label:"Temperature for the day", options:["Cold","Warm","Hot"] },
        { id:"activities", type:"multi", label:"Activities for the day", options:["Audits","Bait stations","Chemical use","Cut and Paste","Drill and fill","Handling Firearms","Landscaping","Making Feratox","Monitoring","Planting","Powertools","Regen thinning","Seed Collecting","Setback marking","Shooting","Signage checks","Signups","Spraying","Toxin use","Trapping","Using handtools","Weed control","Wilding pine control","Other"] },
        { id:"activitiesOther", type:"textarea", label:"Describe other activities", showIf:v => (v.activities||[]).includes("Other") },
      ]},
      { title: "General items / activity checklist", fields: [
        { id:"eventFree", type:"choice", options:YN, label:"Were the previous day's activities event free?" },
        { id:"eventLessons", type:"textarea", label:"Discuss the event/s and lessons learnt", showIf:v => v.eventFree === "No" },
        { id:"emergencyArea", type:"text", label:"Emergency area location discussed (please state where)" },
        { id:"notable", type:"textarea", label:"State some notable hazards or features of today's worksite" },
        { type:"notice", title:"New hazards for discussing", text:"Matariki Forests have raised a new hazard we encounter almost daily at this time of year: large tractors towing wagons and other implements. They drive slowly, are hard to see past, turn often and can take up a significant amount of the road. Please remain patient, allow extra following distance, and only overtake when it is safe to do so." },
        { id:"assessed", type:"choice", options:YN, label:"Assessment of work area complete?" },
        { id:"risks", type:"multi", label:"Based on assessment of the day's activities, what risks will people be exposed to today?", options:["Working Outside","Working Alone","People Interaction","Fatigue","Hazardous Substances","Risk of Falling","Guns and Hunters","Using handtools","Using powertools","Weather","Off Road Vehicle use"] },
        { id:"energy", type:"multi", label:"What energy hazards may you encounter onsite?", options:["Gravity","Mechanical","Motion","Electrical","Pressure","Sound","Radiation","Biological","Chemical","Temperature"] },
        { id:"stky", type:"textarea", label:"List the STKYs (stuff that can kill you) present onsite" },
        { id:"controls", type:"textarea", label:"List what controls you have in place to reduce the risk" },
        { id:"trained", type:"choice", options:YN, label:"All workers are trained to complete today's tasks?" },
        { id:"ppe", type:"choice", options:YN, label:"All workers have suitable PPE for all tasks to be performed?" },
        { id:"plant", type:"choice", options:YN, label:"Plant, equipment and materials are up to date and safe for use?" },
        { id:"instructed", type:"choice", options:YN, label:"All workers instructed and understand today's work requirements?" },
        { id:"riskRating", type:"choice", label:"Based on assessment of work area, staff experience and environmental conditions, what risk would you rate today's activities?", options:["Low","Medium","High"] },
        { id:"safe", type:"choice", options:YN, label:"Do you feel safe to work today?" },
        { id:"safeWhy", type:"textarea", label:"Explain why not", showIf:v => v.safe === "No" },
      ]},
      { title: "Sign on", fields: [
        { id:"signatures", type:"signatures", label:"Signatures of workers and visitors", required:true },
        { id:"photos", type:"photos", label:"Photo of sign-on sheet or the crew (optional)" },
      ]},
    ],
  },
  spray: {
    hash: "#spray-diary",
    title: "Spray Diary",
    pdfTitle: "NZCS Spray Diary",
    blurb: "Agrichemical application record: chemicals, rates, equipment, PPE and weather.",
    sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
    sendToLabel: "Wade and Gareth",
    icon: '<path d="M9 3h5v4H9z"/><path d="M8 7h7l1 3v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9z"/><path d="M14 4h3l2-1M17 4l2 1"/>',
    titleFrom: v => `${v.job || "Job"} ${dmy(v.when)}`,
    sections: [
      { title: "Job", fields: [
        { id:"when", type:"datetime", label:"Date & time", required:true },
        { id:"job", type:"text", label:"Property name / Job name", placeholder:"Farm name, landowner or location", required:true },
        { id:"applicators", type:"people", label:"Applicator's name", required:true },
        { id:"location", type:"location", label:"Location" },
        { id:"pests", type:"textarea", label:"Target pests", placeholder:"Weeds or pests being sprayed" },
      ]},
      { title: "Equipment and PPE", fields: [
        { id:"equipment", type:"multi", label:"Equipment used", options:["Knapsack 1","Knapsack 2","Knapsack 3","Knapsack 4","Knapsack 5","Knapsack 6","Knapsack 7","Knapsack 8","Knapsack (solo) 1","Knapsack (solo) 2","Knapsack (solo) 3","Quadbike boom sprayer","Quadbike hand gun","Drill and fill","Cut and paste","LUV boom sprayer","LUV hand gun","Other"] },
        { id:"equipmentOther", type:"textarea", label:"Other equipment used", showIf:v => (v.equipment||[]).includes("Other") },
        { id:"ppe", type:"multi", label:"PPE worn", options:["Gloves","Boots","Cotton overalls","Capes","Eye protection","Respirator","Leggings","Hat"] },
      ]},
      { title: "Chemicals and application", fields: [
        { id:"chemicals", type:"mixes", label:"Agrichemicals used and rate", noun:"chemical", productHint:"e.g. Glyphosate 360" },
        { id:"additives", type:"mixes", label:"Additives used and rate", noun:"additive", productHint:"e.g. penetrant or dye" },
        { id:"volume", type:"text", label:"Total volume applied", placeholder:"Litres of mix sprayed, e.g. 36 L" },
        { id:"weather", type:"textarea", label:"Weather (wind speed and direction, temperature, humidity)" },
        { id:"notes", type:"textarea", label:"Notes (sensitive areas, withholding, signage, notification, disposal)" },
      ]},
      { title: "Sign off", fields: [
        { id:"signatures", type:"signatures", label:"Signature", required:true },
      ]},
    ],
  },
};
window.NZCS_ONEOFF = FORMS;

/* ---------------- State (memory only) ---------------- */
const drafts = {};          // formKey -> values
let current = null;         // formKey being shown
const blankValues = form => {
  const v = {};
  form.sections.forEach(s => s.fields.forEach(f => {
    if (!f.id) return;
    v[f.id] = f.type === "multi" || f.type === "people" || f.type === "photos" ? [] :
              f.type === "signatures" ? [{name:"", sig:""}] :
              f.type === "mixes" ? [{product:"", ml:"", litres:"", unit:"mL"}] :
              f.type === "datetime" ? nowLocal() :
              f.type === "location" ? {address:"", lat:null, lng:null} : "";
  }));
  return v;
};
const values = () => drafts[current];
const isStarted = key => {
  const v = drafts[key]; if (!v) return false;
  const b = blankValues(FORMS[key]);
  return Object.keys(v).some(k => k !== "when" && JSON.stringify(v[k]) !== JSON.stringify(b[k]));
};

/* ---------------- Mix rates (mL of concentrate in litres of water -> mL/L) ---------------- */
const num = v => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : NaN; };
const trim = x => String(Math.round(x * 100) / 100);
function mixRate(m){ const ml = num(m.ml), l = num(m.litres); return ml >= 0 && l > 0 ? ml / l : NaN; }
const unitOf = m => m.unit === "g" ? "g" : "mL";
function mixRateText(m){ const r = mixRate(m); return isNaN(r) ? "" : trim(r) + " " + unitOf(m) + "/L"; }
function mixLine(m){
  const r = mixRate(m), u = unitOf(m), parts = [m.product.trim() || "Unnamed product"];
  if (m.ml !== "" || m.litres !== "") parts.push(`${m.ml || "?"} ${u} in ${m.litres || "?"} L water`);
  return parts.join(": ") + (isNaN(r) ? "" : ` = ${trim(r)} ${u}/L`);
}
const usedMixes = list => (list || []).filter(m => m.product.trim() || m.ml !== "" || m.litres !== "");

/* ---------------- Rendering ---------------- */
function peopleList(form){ return Array.from(new Set(STAFF().concat(form.extraPeople || []))); }
function fieldHTML(form, f, v){
  const id = f.id ? `g-${f.id}` : "";
  const req = f.required ? ` <span class="hint">(required)</span>` : "";
  const err = f.id ? `<span class="err" id="${id}-err" hidden>${f.type === "signatures" ? "Add at least one signature." : "This one is needed."}</span>` : "";
  switch (f.type){
    case "notice":
      return `<div class="notice">${f.title ? `<b>${esc(f.title)}</b>` : ""}<p>${esc(f.text)}</p></div>`;
    case "text":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><input type="text" id="${id}" data-g="${f.id}" autocomplete="off" value="${esc(v[f.id])}" placeholder="${esc(f.placeholder || "")}">${err}</div>`;
    case "textarea":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><textarea id="${id}" data-g="${f.id}" placeholder="${esc(f.placeholder || "")}">${esc(v[f.id])}</textarea>${err}</div>`;
    case "datetime":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><input type="datetime-local" id="${id}" data-g="${f.id}" value="${esc(v[f.id])}">${err}</div>`;
    case "choice":
      return `<div class="field"><span class="label">${esc(f.label)}${req}</span><div class="chips" role="group" aria-label="${esc(f.label)}">` +
        f.options.map((o,i) => `<button type="button" class="chip" id="${id}-${i}" data-gc="${f.id}" data-val="${esc(o)}" aria-pressed="${v[f.id] === o}">${esc(o)}</button>`).join("") + `</div>${err}</div>`;
    case "multi":
      return `<div class="field"><span class="label">${esc(f.label)}${req} <span class="hint">Tick all that apply</span></span><div class="chips" role="group" aria-label="${esc(f.label)}">` +
        f.options.map((o,i) => `<button type="button" class="chip multi" id="${id}-${i}" data-gm="${f.id}" data-val="${esc(o)}" aria-pressed="${(v[f.id]||[]).includes(o)}">${esc(o)}</button>`).join("") + `</div>${err}</div>`;
    case "people": {
      const names = peopleList(form).concat(f.other ? ["Other"] : []);
      const picked = v[f.id] || [];
      return `<div class="field"><span class="label" id="${id}-lbl">${esc(f.label)}${req}</span>
        <details class="dd" id="${id}-dd"><summary aria-labelledby="${id}-lbl">${picked.length ? esc(picked.join(", ")) : `<span class="ph">Tick who was there</span>`}</summary>
        <div class="dd-list">${names.map((nm,i) => `<label for="${id}-${i}"><input type="checkbox" id="${id}-${i}" data-gp="${f.id}" data-val="${esc(nm)}" ${picked.includes(nm) ? "checked" : ""}> ${esc(nm)}</label>`).join("")}
        <div class="dd-done"><button type="button" class="btn-small btn-primary" data-ddclose="${id}-dd">Done</button></div></div></details>${err}</div>`;
    }
    case "location": {
      const L = v[f.id] || {};
      return `<div class="field"><label for="${id}">${esc(f.label)}</label>
        <div class="loc-row"><input type="text" id="${id}" data-gl="${f.id}" autocomplete="off" value="${esc(L.address)}" placeholder="Address or place name"><button type="button" class="btn-small" data-locate="${f.id}">Use my location</button></div>
        <span class="hint" id="${id}-gps">${L.lat != null ? `GPS ${L.lat.toFixed(5)}, ${L.lng.toFixed(5)}` : "Tap Use my location to fill this in from your phone's GPS."}</span>
        <img class="loc-map" id="${id}-map" alt="Map of the meeting location" ${L.map ? `src="${L.map}"` : "hidden"}></div>`;
    }
    case "signatures": {
      const list = v[f.id] || [];
      const names = peopleList(form);
      return `<div class="field"><span class="label">${esc(f.label)}${req}</span><div class="sigs">` + list.map((s,i) => `
        <div class="sig-item">
          <div class="sig-item-head"><select id="${id}-${i}-name" data-gsn="${f.id}" data-i="${i}" aria-label="Who is signing"><option value="">Who is signing?</option>${names.map(nm => `<option ${s.name === nm ? "selected" : ""}>${esc(nm)}</option>`).join("")}<option value="__other" ${s.other || (s.name && !names.includes(s.name)) ? "selected" : ""}>Visitor / other</option></select>
            <button type="button" class="btn-small btn-ghost" data-sigclear="${i}">Clear</button>${list.length > 1 ? `<button type="button" class="icon-btn" data-sigdel="${i}" aria-label="Remove signature ${i+1}">×</button>` : ""}</div>
          ${s.name && !names.includes(s.name) || s.other ? `<input type="text" id="${id}-${i}-other" data-gso="${f.id}" data-i="${i}" placeholder="Visitor's name and company" value="${esc(names.includes(s.name) ? "" : s.name)}">` : ""}
          <div class="sig-wrap small"><div class="sig-line"></div><canvas data-gsig="${f.id}" data-i="${i}"></canvas><div class="sig-hint" ${s.sig ? "hidden" : ""}>Sign here</div></div>
        </div>`).join("") + `</div><button type="button" class="btn-small btn-ghost" data-sigadd="${f.id}" style="justify-self:start">+ Add signature</button>${err}</div>`;
    }
    case "mixes": {
      const list = v[f.id] || [];
      return `<div class="field"><span class="label">${esc(f.label)}</span><span class="hint">Enter how much product (mL for liquids, g for granules) and the litres of water. The rate per litre is worked out for you.</span>
        <div class="mixes">${list.map((m,i) => `<div class="mix">
          <div class="field mix-prod"><label for="${id}-${i}-product">${f.noun === "additive" ? "Additive" : "Chemical"}</label><input type="text" id="${id}-${i}-product" data-gx="${f.id}" data-i="${i}" data-k="product" autocomplete="off" value="${esc(m.product)}" placeholder="${esc(f.productHint || "")}"></div>
          <div class="field mix-amt"><label for="${id}-${i}-ml">Amount used</label><div class="amt"><input type="number" inputmode="decimal" min="0" step="any" id="${id}-${i}-ml" data-gx="${f.id}" data-i="${i}" data-k="ml" value="${esc(m.ml)}" placeholder="150">
            <span class="unit-seg" role="group" aria-label="Unit">${["mL","g"].map(u => `<button type="button" id="${id}-${i}-unit-${u}" data-mixunit="${f.id}" data-i="${i}" data-val="${u}" aria-pressed="${unitOf(m) === u}">${u}</button>`).join("")}</span></div></div>
          <div class="field"><label for="${id}-${i}-litres">Litres of water</label><input type="number" inputmode="decimal" min="0" step="any" id="${id}-${i}-litres" data-gx="${f.id}" data-i="${i}" data-k="litres" value="${esc(m.litres)}" placeholder="18"></div>
          <div class="mix-rate"><span class="hint">Rate</span><b id="${id}-${i}-rate">${esc(mixRateText(m)) || "–"}</b></div>
          ${list.length > 1 ? `<button type="button" class="icon-btn mix-del" data-mixdel="${f.id}" data-i="${i}" aria-label="Remove ${f.noun} ${i+1}">×</button>` : ""}
        </div>`).join("")}</div>
        <button type="button" class="btn-small btn-ghost" data-mixadd="${f.id}" style="justify-self:start">+ Add ${esc(f.noun)}</button></div>`;
    }
    case "photos": {
      const list = v[f.id] || [];
      return `<div class="field"><span class="label">${esc(f.label)}</span>
        <div class="photos">${list.map((p,i) => `<div class="photo"><img src="${p}" alt="Photo ${i+1}"><button type="button" class="icon-btn" data-photodel="${f.id}" data-i="${i}" aria-label="Remove photo ${i+1}">×</button></div>`).join("")}</div>
        <label class="btn btn-small photo-add" for="${id}-file">+ Add photo</label><input type="file" id="${id}-file" data-gph="${f.id}" accept="image/*" multiple hidden>
        <span class="hint" id="${id}-status">Photos are shrunk to keep the email small.</span></div>`;
    }
  }
  return "";
}
function render(){
  const form = FORMS[current], v = values(), host = $("#generic-body");
  $("#generic-title").textContent = form.title;
  host.innerHTML = form.sections.map((s, si) => {
    const inner = s.fields.map(f => (f.showIf && !f.showIf(v)) ? "" : fieldHTML(form, f, v)).join("");
    return `<section class="card" id="gs-${si}"><h2>${esc(s.title)}</h2>${inner}</section>`;
  }).join("") + `<section class="card" id="generic-send"><h2>Send</h2>${sendHTML(form)}</section>`;
  rerenderIfShapeChanged.last = shapeOf();
  initSigs();
}
function sendHTML(form){
  return `<div class="send"><div><span class="hint">To ${esc(form.sendToLabel)}:</span> <span class="addr">${form.sendTo.map(esc).join(", ")}</span></div>
    <div class="btns"><button type="button" class="btn-hivis" id="g-share">Send PDF</button><button type="button" id="g-pdf">Download PDF</button><a class="btn" id="g-mail" href="#">Open email</a></div>
    <span class="hint">${canShareFiles ? "Opens your phone's share menu with the PDF attached. Pick Gmail or Outlook, then paste the addresses into the To line (they're copied for you)." : "Download the PDF, then use Open email and attach it from your Downloads."}</span>
    <div class="status" id="g-status" role="status"></div>
    <div class="btns"><span id="g-clear-wrap"><button type="button" class="btn-small btn-ghost" id="g-clear">Clear form and start again</button></span></div></div>`;
}
// Re-draw only when a question appears or disappears, so typing isn't interrupted.
const shapeOf = () => FORMS[current].sections.map(s => s.fields.map(f => !f.showIf || f.showIf(values()) ? 1 : 0).join("")).join("|");
function rerenderIfShapeChanged(){
  if (shapeOf() !== rerenderIfShapeChanged.last){ const y = window.scrollY; render(); window.scrollTo(0, y); }
}

/* ---------------- Signature pads ---------------- */
function initSigs(){
  document.querySelectorAll("#generic-body canvas[data-gsig]").forEach(c => {
    const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!r.width) return;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#15211a";
    const item = values()[c.dataset.gsig][+c.dataset.i];
    if (item.sig){ const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = item.sig; }
    let drawing = false;
    const pos = e => { const b = c.getBoundingClientRect(); return {x:e.clientX - b.left, y:e.clientY - b.top}; };
    c.onpointerdown = e => { drawing = true; c.setPointerCapture(e.pointerId); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x+0.1,p.y+0.1); ctx.stroke(); c.nextElementSibling.hidden = true; };
    c.onpointermove = e => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); };
    c.onpointerup = c.onpointercancel = () => {
      if (!drawing) return; drawing = false;
      const w = Math.min(500, c.width), h = Math.round(c.height * w / c.width), t = document.createElement("canvas"); t.width = w; t.height = h;
      t.getContext("2d").drawImage(c, 0, 0, w, h); item.sig = t.toDataURL("image/png");
      const e = $("#g-signatures-err"); if (e) e.hidden = true;
    };
  });
}

/* ---------------- Photos ---------------- */
function shrinkPhoto(file){
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't a photo the app can read.")); };
    img.src = url;
  });
}

/* ---------------- Events ---------------- */
function bind(){
  const host = $("#generic-body");
  host.addEventListener("input", e => {
    const t = e.target, v = values(); if (!v) return;
    if (t.dataset.g){ v[t.dataset.g] = t.value; const er = $(`#g-${t.dataset.g}-err`); if (er) er.hidden = true; }
    else if (t.dataset.gl){ v[t.dataset.gl].address = t.value; }
    else if (t.dataset.gso){ const s = v[t.dataset.gso][+t.dataset.i]; s.name = t.value; s.other = true; }
    else if (t.dataset.gx){
      const m = v[t.dataset.gx][+t.dataset.i]; m[t.dataset.k] = t.value;
      const out = $(`#g-${t.dataset.gx}-${t.dataset.i}-rate`); if (out) out.textContent = mixRateText(m) || "–";
    }
  });
  host.addEventListener("change", async e => {
    const t = e.target, v = values(); if (!v) return;
    if (t.dataset.gp){
      const list = v[t.dataset.gp], val = t.dataset.val;
      v[t.dataset.gp] = t.checked ? list.concat(val) : list.filter(x => x !== val);
      const sum = t.closest("details").querySelector("summary");
      sum.innerHTML = v[t.dataset.gp].length ? esc(v[t.dataset.gp].join(", ")) : `<span class="ph">Tick who was there</span>`;
      const er = $(`#g-${t.dataset.gp}-err`); if (er) er.hidden = true;
      const ddId = t.closest("details").id;
      rerenderIfShapeChanged();
      const dd = document.getElementById(ddId); if (dd) dd.open = true;   // keep the list open while ticking
    } else if (t.dataset.gsn){
      const s = v[t.dataset.gsn][+t.dataset.i];
      if (t.value === "__other"){ s.other = true; s.name = ""; } else { s.other = false; s.name = t.value; }
      render();
    } else if (t.dataset.gph){
      const st = $(`#g-${t.dataset.gph}-status`);
      const files = Array.from(t.files || []); if (!files.length) return;
      st.textContent = "Adding photos…";
      try{ for (const f of files.slice(0, 10)) v[t.dataset.gph].push(await shrinkPhoto(f)); render(); }
      catch(err){ st.textContent = err.message; }
    }
  });
  host.addEventListener("click", async e => {
    const t = e.target, v = values(); if (!v) return;
    if (t.dataset.gc){ v[t.dataset.gc] = v[t.dataset.gc] === t.dataset.val ? "" : t.dataset.val;
      t.parentElement.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.val === v[t.dataset.gc]))); rerenderIfShapeChanged(); return; }
    if (t.dataset.gm){ const list = v[t.dataset.gm], val = t.dataset.val;
      v[t.dataset.gm] = list.includes(val) ? list.filter(x => x !== val) : list.concat(val);
      t.setAttribute("aria-pressed", String(v[t.dataset.gm].includes(val))); rerenderIfShapeChanged(); return; }
    if (t.dataset.ddclose){ $("#" + t.dataset.ddclose).open = false; return; }
    if (t.dataset.sigadd){ v[t.dataset.sigadd].push({name:"", sig:""}); render(); return; }
    if (t.dataset.sigdel){ v.signatures.splice(+t.dataset.sigdel, 1); render(); return; }
    if (t.dataset.sigclear){ v.signatures[+t.dataset.sigclear].sig = ""; render(); return; }
    if (t.dataset.mixadd){ const list = v[t.dataset.mixadd]; const last = list[list.length - 1] || {}; list.push({product:"", ml:"", litres:last.litres || "", unit:"mL"}); render(); const el = $(`#g-${t.dataset.mixadd}-${list.length - 1}-product`); if (el) el.focus(); return; }
    if (t.dataset.mixunit){
      const m = v[t.dataset.mixunit][+t.dataset.i]; m.unit = t.dataset.val === "g" ? "g" : "mL";
      t.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.val === unitOf(m))));
      const out = $(`#g-${t.dataset.mixunit}-${t.dataset.i}-rate`); if (out) out.textContent = mixRateText(m) || "–";
      return;
    }
    if (t.dataset.mixdel){ v[t.dataset.mixdel].splice(+t.dataset.i, 1); render(); return; }
    if (t.dataset.photodel){ v[t.dataset.photodel].splice(+t.dataset.i, 1); render(); return; }
    if (t.dataset.locate) return locate(t.dataset.locate, t);
    if (t.id === "g-share") return share();
    if (t.id === "g-pdf") return download();
    if (t.id === "g-mail"){ e.preventDefault(); location.href = mailHref(); return; }
    if (t.id === "g-clear"){ $("#g-clear-wrap").innerHTML = `<span class="confirm">Clear everything on this form? <button type="button" class="btn-small btn-primary" id="g-clear-yes">Clear</button><button type="button" class="btn-small" id="g-clear-no">Keep</button></span>`; return; }
    if (t.id === "g-clear-yes"){ drafts[current] = blankValues(FORMS[current]); rerenderIfShapeChanged.last = null; render(); window.scrollTo(0,0); return; }
    if (t.id === "g-clear-no"){ $("#g-clear-wrap").innerHTML = `<button type="button" class="btn-small btn-ghost" id="g-clear">Clear form and start again</button>`; }
  });
  document.addEventListener("click", e => { document.querySelectorAll("#generic-body details.dd[open]").forEach(dd => { if (!dd.contains(e.target)) dd.open = false; }); });
  window.addEventListener("resize", () => { if (current) { clearTimeout(bind.t); bind.t = setTimeout(initSigs, 150); } });
}

/* ---------------- Location ---------------- */
// Draws a small map (OpenStreetMap tiles) centred on the GPS point, with a pin. Needs signal; returns null if it can't.
function makeMap(lat, lng){
  const z = 16, Wpx = 640, Hpx = 360, T = 256;
  const n = Math.pow(2, z), rad = lat * Math.PI / 180;
  const cx = (lng + 180) / 360 * n * T;
  const cy = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n * T;
  const left = cx - Wpx / 2, top = cy - Hpx / 2;
  const tiles = [];
  for (let tx = Math.floor(left / T); tx <= Math.floor((left + Wpx) / T); tx++)
    for (let ty = Math.floor(top / T); ty <= Math.floor((top + Hpx) / T); ty++) tiles.push([tx, ty]);
  const c = document.createElement("canvas"); c.width = Wpx; c.height = Hpx;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#e8ece6"; ctx.fillRect(0, 0, Wpx, Hpx);
  const load = ([tx, ty]) => new Promise(res => {
    const img = new Image(); img.crossOrigin = "anonymous";
    const t = setTimeout(() => res(false), 8000);
    img.onload = () => { clearTimeout(t); ctx.drawImage(img, tx * T - left, ty * T - top); res(true); };
    img.onerror = () => { clearTimeout(t); res(false); };
    img.src = `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`;
  });
  return Promise.all(tiles.map(load)).then(ok => {
    if (!ok.some(Boolean)) return null;
    // pin
    const px = Wpx / 2, py = Hpx / 2;
    ctx.fillStyle = "#e0692a"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.bezierCurveTo(px - 16, py - 22, px - 14, py - 40, px, py - 40); ctx.bezierCurveTo(px + 14, py - 40, px + 16, py - 22, px, py); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(px, py - 27, 5, 0, Math.PI * 2); ctx.fill();
    // attribution (required by OpenStreetMap)
    ctx.font = "12px sans-serif"; const txt = "© OpenStreetMap contributors"; const tw = ctx.measureText(txt).width;
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(Wpx - tw - 12, Hpx - 20, tw + 12, 20);
    ctx.fillStyle = "#333"; ctx.fillText(txt, Wpx - tw - 6, Hpx - 6);
    try{ return c.toDataURL("image/jpeg", 0.82); }catch(e){ return null; }
  });
}
function locate(fieldId, btn){
  const gps = $(`#g-${fieldId}-gps`), v = values();
  if (!navigator.geolocation){ gps.textContent = "This phone can't share its location. Type the address instead."; return; }
  btn.disabled = true; gps.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition(async pos => {
    const L = v[fieldId]; L.lat = pos.coords.latitude; L.lng = pos.coords.longitude; L.map = null;
    gps.textContent = `GPS ${L.lat.toFixed(5)}, ${L.lng.toFixed(5)} · drawing map…`;
    makeMap(L.lat, L.lng).then(img => {
      if (v !== values()) return;
      L.map = img; const m = $(`#g-${fieldId}-map`);
      gps.textContent = `GPS ${L.lat.toFixed(5)}, ${L.lng.toFixed(5)}` + (img ? "" : " · no map (needs signal)");
      if (m && img){ m.src = img; m.hidden = false; }
    });
    try{
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${L.lat}&lon=${L.lng}`, {headers:{"Accept-Language":"en-NZ"}});
      const d = await r.json();
      if (d && d.display_name && !L.address){ L.address = d.display_name.replace(/, New Zealand \/ Aotearoa$/, ", New Zealand"); $(`#g-${fieldId}`).value = L.address; }
    }catch(e){ /* no address lookup without signal; the GPS numbers still go on the PDF */ }
    btn.disabled = false;
  }, err => {
    btn.disabled = false;
    gps.textContent = err.code === 1 ? "Location is turned off for this app. Allow location in your phone's settings, or type the address." : "Couldn't get a GPS fix. Try again, or type the address.";
  }, {enableHighAccuracy:true, timeout:15000, maximumAge:60000});
}

/* ---------------- Checking ---------------- */
function validate(){
  const form = FORMS[current], v = values(); let first = null;
  form.sections.forEach(s => s.fields.forEach(f => {
    if (!f.required || (f.showIf && !f.showIf(v))) return;
    let ok = true;
    if (f.type === "signatures") ok = v[f.id].some(x => x.sig);
    else if (Array.isArray(v[f.id])) ok = v[f.id].length > 0;
    else ok = String(v[f.id] || "").trim() !== "";
    if (!ok){ const er = $(`#g-${f.id}-err`); if (er) er.hidden = false; if (!first) first = er; }
  }));
  if (first) first.closest(".field").scrollIntoView({block:"center"});
  return !first;
}

/* ---------------- PDF ---------------- */
function answerText(f, v){
  const a = v[f.id];
  if (f.type === "datetime") return dmyTime(a);
  if (f.type === "mixes") return usedMixes(a).map(mixLine).join("\n");
  if (f.type === "location") return [a.address, a.lat != null ? `GPS ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : ""].filter(Boolean).join("\n");
  if (Array.isArray(a)) return a.join(", ");
  return a || "";
}
function buildPDF(){
  const form = FORMS[current], v = values();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:"mm", format:"a4"});
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 18, ink = [21,33,26];
  const base = {theme:"grid", margin:{left:M,right:M}, styles:{font:"helvetica", fontSize:9.5, textColor:ink, lineColor:[214,212,205], lineWidth:0.2, cellPadding:2.2, overflow:"linebreak"}, rowPageBreak:"avoid",
    headStyles:{fillColor:[243,241,236], textColor:[90,90,85], fontStyle:"normal"}, columnStyles:{0:{cellWidth:70, fontStyle:"bold"}}};
  const title = `${form.pdfTitle} - ${form.titleFrom(v)}`;
  doc.setFont("times","normal"); doc.setFontSize(22); doc.setTextColor(...ink);
  const tl = doc.splitTextToSize(title, W - 2*M); doc.text(tl, M, 26);
  let y = 26 + (tl.length-1)*9 + 7;
  doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.text("NZ Conservation Services Limited", M, y); y += 8;
  const heading = txt => { if (y > H - 40){ doc.addPage(); y = 20; } doc.setFont("times","normal"); doc.setFontSize(15); doc.setTextColor(...ink); doc.text(txt, M, y); y += 4; };
  const links = [];
  form.sections.forEach(s => {
    const rows = [];
    s.fields.forEach(f => {
      if (f.showIf && !f.showIf(v)) return;
      if (f.type === "notice"){ rows.push([{content:(f.title ? f.title + ": " : "") + f.text, colSpan:2, styles:{fontStyle:"italic", textColor:[70,80,72], fillColor:[247,248,245]}}]); return; }
      if (f.type === "signatures" || f.type === "photos") return;
      rows.push([f.label, answerText(f, v)]);
      if (f.type === "location" && v[f.id].lat != null) links.push(`https://www.google.com/maps?q=${v[f.id].lat},${v[f.id].lng}`);
    });
    if (rows.length){
      heading(s.title);
      doc.autoTable(Object.assign({}, base, {startY:y, body:rows,
        didDrawCell: c => { if (c.section === "body" && c.column.index === 1 && /^GPS /m.test(String(c.cell.raw || "")) && links.length){ doc.link(c.cell.x, c.cell.y, c.cell.width, c.cell.height, {url:links[0]}); } }}));
      y = doc.lastAutoTable.finalY + 10;
    }
    // Map picture for any location in this section
    s.fields.filter(f => f.type === "location" && v[f.id].map).forEach(f => {
      const mw = 120, mh = mw * 360 / 640;
      if (y + mh > H - 16){ doc.addPage(); y = 20; }
      try{ doc.addImage(v[f.id].map, "JPEG", M, y - 4, mw, mh); if (links[0]) doc.link(M, y - 4, mw, mh, {url:links[0]}); y += mh + 8; }catch(e){}
    });
    // Signatures
    s.fields.filter(f => f.type === "signatures").forEach(f => {
      const sigs = v[f.id].filter(x => x.sig);
      if (!sigs.length) return;
      heading(f.label);
      doc.autoTable(Object.assign({}, base, {startY:y, body:sigs.map(x => [x.name || "", {content:"", styles:{minCellHeight:20}}]),
        didDrawCell: c => {
          if (c.section !== "body" || c.column.index !== 1) return;
          const sig = sigs[c.row.index].sig;
          try{ const p = doc.getImageProperties(sig); let h = c.cell.height - 3, w = h * p.width / p.height; if (w > c.cell.width - 4){ w = c.cell.width - 4; h = w * p.height / p.width; } doc.addImage(sig, "PNG", c.cell.x + 2, c.cell.y + 1.5, w, h); }catch(e){}
        }}));
      y = doc.lastAutoTable.finalY + 10;
    });
    // Photos, two per row
    s.fields.filter(f => f.type === "photos").forEach(f => {
      const photos = v[f.id]; if (!photos.length) return;
      heading("Photos"); y += 2;
      const colW = (W - 2*M - 6) / 2; let col = 0, rowH = 0;
      photos.forEach(p => {
        let props; try{ props = doc.getImageProperties(p); }catch(e){ return; }
        let w = colW, h = w * props.height / props.width; if (h > 95){ h = 95; w = h * props.width / props.height; }
        if (y + h > H - 16){ doc.addPage(); y = 20; col = 0; rowH = 0; }
        doc.addImage(p, "JPEG", M + col * (colW + 6), y, w, h);
        rowH = Math.max(rowH, h);
        if (col === 1){ y += rowH + 6; rowH = 0; col = 0; } else col = 1;
      });
      if (col === 1) y += rowH + 6;
    });
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++){
    doc.setPage(i); doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(120,120,115);
    doc.text(title, 10, 7); doc.text(`Page ${i} of ${pages}`, W - 10, H - 7, {align:"right"});
  }
  return {doc, title};
}
const canShareFiles = (() => { try{ return !!(navigator.canShare && navigator.canShare({files:[new File(["x"], "t.pdf", {type:"application/pdf"})]})); }catch(e){ return false; } })();
function status(msg, bad){ const s = $("#g-status"); if (s){ s.className = "status" + (bad ? " bad" : ""); s.textContent = msg; } }
function makeFile(){
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("The PDF maker didn't load. Reload the page and try again.");
  const {doc, title} = buildPDF();
  return new File([doc.output("blob")], title.replace(/[\\/:*?"<>|]+/g, "-") + ".pdf", {type:"application/pdf"});
}
function downloadFile(file){
  const url = URL.createObjectURL(file), a = document.createElement("a");
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function emailBody(){
  const form = FORMS[current], v = values();
  const L = [`${form.pdfTitle} - ${form.titleFrom(v)}`, ""];
  form.sections[0].fields.forEach(f => { if (f.id && f.type !== "location" && (!f.showIf || f.showIf(v))) L.push(`${f.label}: ${answerText(f, v)}`); });
  const loc = form.sections[0].fields.find(f => f.type === "location"); if (loc && answerText(loc, v)) L.push("Location: " + answerText(loc, v).replace(/\n/g, " · "));
  L.push("", "Full form attached as PDF.");
  return L.join("\n");
}
const mailHref = () => { const form = FORMS[current], v = values(); return `mailto:${form.sendTo.join(",")}?subject=${encodeURIComponent(`${form.pdfTitle} - ${form.titleFrom(v)}`)}&body=${encodeURIComponent(emailBody())}`; };
async function share(){
  if (!validate()) return status("Some details are missing. Check the fields marked in red.", true);
  let file; try{ file = makeFile(); }catch(err){ return status(err.message, true); }
  const to = FORMS[current].sendTo.join(", ");
  try{ navigator.clipboard && navigator.clipboard.writeText(to).catch(() => {}); }catch(e){}
  if (canShareFiles){
    try{ await navigator.share({files:[file], title:file.name.replace(/\.pdf$/, ""), text:"To: " + to + "\n\n" + emailBody()}); status("Shared. Check it went to " + to + ". Tap Clear form when you're done."); }
    catch(err){ if (err && err.name === "AbortError") status("Share cancelled.", true); else { downloadFile(file); status("Sharing didn't work here, so the PDF was downloaded. Use Open email and attach it.", true); } }
  } else {
    downloadFile(file); status("PDF downloaded. Opening an email; attach the PDF from your Downloads.");
    setTimeout(() => { location.href = mailHref(); }, 600);
  }
}
function download(){
  if (!validate()) return status("Some details are missing. Check the fields marked in red.", true);
  try{ const f = makeFile(); downloadFile(f); status("Downloaded: " + f.name); }catch(err){ status(err.message, true); }
}

/* ---------------- Hooks used by the home screen ---------------- */
window.NZCS_FORMS_ENGINE = {
  forms: FORMS,
  open(key){ current = key; if (!drafts[key]) drafts[key] = blankValues(FORMS[key]); rerenderIfShapeChanged.last = null; render(); requestAnimationFrame(initSigs); },
  close(){ current = null; },
  isStarted,
};
bind();
})();
