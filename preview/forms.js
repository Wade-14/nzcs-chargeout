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
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };

/* ---------------- Form definitions ---------------- */
const YN = ["Yes", "No"];
const FORMS = {
  toolbox: {
    staffField: "staff",
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
        { id:"trainedWho", type:"textarea", label:"Who isn't trained?", showIf:v => v.trained === "No" },
        { id:"trainedUnder", type:"choice", options:YN, label:"Are they under training?", showIf:v => v.trained === "No" },
        { id:"trainedWhen", type:"text", label:"When will their training happen?", showIf:v => v.trained === "No" },
        { id:"ppe", type:"choice", options:YN, label:"All workers have suitable PPE for all tasks to be performed?" },
        { id:"ppeWhat", type:"textarea", label:"What PPE is missing?", showIf:v => v.ppe === "No" },
        { id:"ppeWho", type:"textarea", label:"Who is missing that PPE?", showIf:v => v.ppe === "No" },
        { id:"ppeCarryOn", type:"choice", options:YN, label:"Can they carry on with today's tasks without that PPE?", showIf:v => v.ppe === "No" },
        { id:"plant", type:"choice", options:YN, label:"Plant, equipment and materials are up to date and safe for use?" },
        { id:"plantWhat", type:"textarea", label:"What equipment, plant or material isn't up to date or safe for use?", showIf:v => v.plant === "No" },
        { id:"plantFix", type:"textarea", label:"What is being done to rectify this?", showIf:v => v.plant === "No" },
        { id:"instructed", type:"choice", options:YN, label:"All workers instructed and understand today's work requirements?" },
        { id:"instructedWho", type:"textarea", label:"Who isn't instructed or doesn't understand?", showIf:v => v.instructed === "No" },
        { id:"instructedBefore", type:"choice", options:YN, label:"Will they be instructed and fully understand before they begin work today?", showIf:v => v.instructed === "No" },
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
    staffField: "applicators",
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
  kill: {
    staffField: "staff",
    hash: "#kill-sheet",
    title: "Kill Sheet",
    pdfTitle: "NZCS Ungulate Control Kill Sheet",
    blurb: "Shooting and counting: animals seen and shot, rifles used, time on the block.",
    sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
    sendToLabel: "Wade and Gareth",
    icon: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    titleFrom: v => `${v.property || "Property"} ${dmy(v.when)}`,
    sections: [
      { title: "Job", fields: [
        { id:"when", type:"datetime", label:"Date & time", required:true },
        { id:"property", type:"text", label:"Property name and owner", placeholder:"Farm name and landowner", required:true },
        { id:"location", type:"location", label:"Location" },
        { id:"staff", type:"people", label:"Staff shooting / counting and others involved", required:true },
        { id:"staffOther", type:"text", label:"Name of staff not listed above (if required)" },
        { id:"rifles", type:"textarea", label:"Rifles and handhelds used" },
        { id:"arrived", type:"time", label:"Time arrived at block" },
        { id:"left", type:"time", label:"Time left block" },
        { id:"activity", type:"choice", label:"Are you…", options:["Shooting","Counting","Filling bait stations"] },
      ]},
      { title: "Animals", fields: [
        { id:"tally", type:"tally", label:"Animals", columns:["Seen","Shot","Confirmed kills","Found under bait stations"],
          // Bait station runs record what's found under the stations instead of what's shot.
          columnsFor: v => v.activity === "Filling bait stations" ? ["Seen","Found under bait stations"] : ["Seen","Shot","Confirmed kills"],
          rows:[
            {name:"Deer", cols:["Seen","Shot","Confirmed kills"]},
            {name:"Possums", cols:["Seen","Shot","Found under bait stations"]},
            {name:"Pigs", cols:["Seen","Shot"]},
            {name:"Hares", cols:["Seen","Shot","Found under bait stations"]},
            {name:"Goats", cols:["Seen","Shot"]},
            {name:"Rats", cols:["Seen","Shot","Found under bait stations"]},
            {name:"Mice", cols:["Seen","Shot","Found under bait stations"]},
          ] },
        { id:"baitNotes", type:"textarea", label:"Bait station notes", placeholder:"Stations filled, bait used, anything to follow up", showIf:v => v.activity === "Filling bait stations" },
        { type:"notice", text:"Please remember to clean guns after every night shoot.", showIf:v => v.activity !== "Filling bait stations" },
      ]},
      { title: "Wrap up", fields: [
        { id:"comments", type:"textarea", label:"Any comments about the job or problems encountered" },
        { id:"signatures", type:"signatures", label:"Signature", required:true },
      ]},
    ],
  },
  quad: {
    staffField: "inspector",
    hash: "#quad-check",
    title: "Quad / LUV Check",
    pdfTitle: "NZCS Quad Pre Start Check",
    blurb: "Pre-start check for quads, LUVs and the DR200: tyres, brakes, lights, oil, hours.",
    sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
    sendToLabel: "Wade and Gareth",
    icon: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6M6 14l2-5h6l3 5M12 9V6h3"/>',
    titleFrom: v => `${v.vehicle || "Vehicle"} ${dmy(v.when)}`,
    sections: [
      { title: "Check details", fields: [
        { id:"when", type:"datetime", label:"Date & time", required:true },
        { id:"inspector", type:"person", label:"Inspector (staff performing the check)", required:true },
        { id:"vehicle", type:"choice", label:"Which quad / LUV is being inspected?", required:true,
          options:["Quad 1","Quad 2","Quad 3","Quad 4","Quad 5","Quad 6","DR200 two-wheeler","Red LUV 570","Green LUV XP 1000"] },
      ]},
      { title: "Pre-start checks", fields: [
        { id:"checks", type:"checklist", alertUnticked:true, label:"Tick each item once checked and OK",
          options:["Tyre pressure (3.6 psi)","Brakes (hand and foot)","Brake lights","Headlights","Oil level","Tyre tread","Fire extinguisher present and valid","No obvious broken or damaged parts"] },
        { id:"damage", type:"textarea", label:"If anything is damaged or not OK, name the damage and how / when it occurred" },
        { id:"photos", type:"photos", label:"Photos of any damage or broken parts (optional)" },
      ]},
      { title: "Service", fields: [
        { id:"hours", type:"number", label:"Current hours" },
        { id:"serviceHours", type:"number", label:"Next service due at (hours)" },
        { type:"derived", label:"Service status", alertWhen:v => { const h = parseFloat(v.hours), sv = parseFloat(v.serviceHours); return isFinite(h) && isFinite(sv) && sv - h <= 0; }, compute:v => {
            const h = parseFloat(v.hours), sv = parseFloat(v.serviceHours);
            if (!isFinite(h) || !isFinite(sv)) return "";
            const left = Math.round((sv - h) * 10) / 10;
            return left > 0 ? `${left} hours until service` : left === 0 ? "Service due now" : `Service overdue by ${-left} hours`;
          } },
      ]},
      { title: "Sign off", fields: [
        { id:"signatures", type:"signatures", label:"Signature", required:true },
      ]},
    ],
  },
  hazard: {
    staffField: "name",
    hash: "#hazard-report",
    title: "Hazard Report",
    pdfTitle: "NZCS Hazard Report",
    blurb: "Report a hazard on site: what it is, where, photos, and what's been done about it.",
    sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
    sendToLabel: "Wade and Gareth",
    icon: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/>',
    // File name uses the first part of the address, e.g. "Marshall Road 358"
    titleFrom: v => `${((v.location && v.location.address) || "").split(",")[0].trim() || "Hazard"} ${dmy(v.when)}`,
    extraPeople: ["Sam Haliday"],
    sections: [
      { title: "Report details", fields: [
        { id:"when", type:"datetime", label:"Date and time", required:true },
        { id:"location", type:"location", label:"Location" },
        { id:"name", type:"person", label:"Name", required:true },
      ]},
      { title: "The hazard", fields: [
        { id:"photos", type:"photos", label:"Photo of hazard" },
        { id:"hazardType", type:"multi", label:"Hazard type", required:true,
          options:["Unsafe track","Underrunner","Unsafe bridge","Mine shaft","Weather","Tree felling","Black ice","Steep terrain","High wind","Fences / gates","Access tracks","Stock","Wild animals","Other"] },
        { id:"hazardOther", type:"textarea", label:"Describe the other hazard", showIf:v => (v.hazardType||[]).includes("Other") },
        { id:"describe", type:"textarea", label:"Describe the hazard and its implications on planned work", required:true },
        { id:"gps", type:"choice", options:YN, label:"GPS location taken?" },
      ]},
      { title: "Precautions and actions", fields: [
        { id:"precautions", type:"multi", label:"What precautions have you taken to make sure people are aware of the hazard?",
          options:["Notified team","Flagging / taped area","GPS location taken for further reference","Notified landowner","Other"] },
        { id:"precautionsOther", type:"textarea", label:"Please explain the other precaution", showIf:v => (v.precautions||[]).includes("Other") },
        { id:"mitigate", type:"textarea", label:"What actions can be taken to mitigate the risk?" },
      ]},
      { title: "Sign off", fields: [
        { id:"signatures", type:"signatures", label:"Signature", required:true },
      ]},
    ],
  },
  vehicle: {
    staffField: "person",
    hash: "#vehicle-check",
    title: "Vehicle Check",
    pdfTitle: "NZCS Vehicle Pre Start Check",
    blurb: "Pre-start check for utes and trucks: WOF, rego, service, engine, tyres, lights, safety gear.",
    sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
    sendToLabel: "Wade and Gareth",
    icon: '<path d="M3 15V9l2-4h9l3 4h3a1 1 0 0 1 1 1v5"/><path d="M3 15h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
    titleFrom: v => `${(v.vehicle === "Other" ? (v.vehicleOther || "Other vehicle") : v.vehicle) || "Vehicle"} ${dmy(v.when)}`,
    sections: [
      { title: "Check details", fields: [
        { id:"when", type:"datetime", label:"Date and time", required:true },
        { id:"location", type:"location", label:"Location" },
        { id:"person", type:"person", label:"Person performing pre-start check", required:true },
        { id:"vehicle", type:"select", label:"Vehicle", required:true,
          options:["Mitsubishi Triton LNC560","Mazda BT50 GTK24","Ford Ranger Flat Deck HLR533","Isuzu Elf Tip Truck HGY173","Mazda BT50 Flat Deck LPA794","Ford Ranger Double Cab EYB719","Nissan Navara LCU877","Toyota ToyoAce EEE422","Other"] },
        { id:"vehicleOther", type:"text", label:"Which vehicle? (make, model and rego)", showIf:v => v.vehicle === "Other" },
      ]},
      { title: "Vehicle details", fields: [
        { id:"wofDue", type:"choice", options:YN, alertIf:"Yes", label:"WOF due?" },
        { id:"regoDue", type:"choice", options:YN, alertIf:"Yes", label:"Registration due?" },
        { id:"serviceDue", type:"choice", options:YN, alertIf:"Yes", label:"Service due?" },
        { id:"kmToService", type:"number", label:"KMs left before service is due" },
        { id:"ruc", type:"choice", options:YN, alertIf:"No", label:"Road user charges (mileage) up to date?" },
        { id:"odometer", type:"number", label:"Odometer reading (speedo)" },
        { id:"photoRego", type:"photos", label:"Photo of registration and road user charges" },
        { id:"photoWof", type:"photos", label:"Photo of service sticker and WOF" },
        { id:"tyrePressureChecked", type:"choice", options:YN, alertIf:"No", label:"Tyre pressures checked?" },
      ]},
      { title: "Engine", fields: [
        { id:"engineOk", type:"choice", options:YN, alertIf:"No", label:"Is the engine in working condition?" },
        { id:"water", type:"choice", options:YN, alertIf:"No", label:"Is the water level correct?" },
        { id:"leaks", type:"choice", options:YN, alertIf:"Yes", label:"Any leaks under the vehicle or in the engine bay?" },
        { id:"fuel", type:"choice", options:YN, label:"Enough fuel for the day's activities?" },
        { id:"washer", type:"choice", options:YN, alertIf:"No", label:"Does the window washer reservoir have enough water?" },
      ]},
      { title: "Tyres", fields: [
        { id:"tyresGood", type:"choice", options:YN, alertIf:"No", label:"Are the tyres in good condition, including the spare?" },
        { id:"tyresPressure", type:"choice", options:YN, alertIf:"No", label:"Are the tyres at the correct pressure?" },
      ]},
      { title: "Body and interior", fields: [
        { id:"damage", type:"choice", options:YN, alertIf:"Yes", label:"Is there any new damage on the vehicle?" },
        { id:"outsideClean", type:"choice", options:YN, label:"Is the outside of the vehicle clean enough?" },
        { id:"insideClean", type:"choice", options:YN, label:"Is the vehicle interior clean?" },
        { id:"windows", type:"choice", options:YN, label:"Are the windows clean?" },
        { id:"wipers", type:"choice", options:YN, alertIf:"No", label:"Are the window wipers effective?" },
      ]},
      { title: "Lights", fields: [
        { id:"indicators", type:"choice", options:YN, alertIf:"No", label:"Are the indicators and hazard lights working?" },
        { id:"headlights", type:"choice", options:YN, alertIf:"No", label:"Are the headlights working (high and low beam)?" },
        { id:"reversing", type:"choice", options:YN, alertIf:"No", label:"Are the reversing lights working?" },
        { id:"brakeLights", type:"choice", options:YN, alertIf:"No", label:"Are the brake lights working?" },
        { id:"trailerPlug", type:"choice", alertIf:"Needs attention", label:"Condition of trailer plug", options:["OK","Needs attention","No trailer plug"] },
      ]},
      { title: "Safety equipment", fields: [
        { id:"extinguisher", type:"choice", options:YN, alertIf:"No", label:"Fire extinguisher present and operational?" },
        { id:"jack", type:"choice", options:YN, alertIf:"No", label:"Is there a jack and tyre changing equipment?" },
        { id:"firstAid", type:"choice", options:YN, alertIf:"No", label:"Is the first aid kit present and fully stocked?" },
        { id:"hygiene", type:"choice", options:YN, alertIf:"No", label:"Is there sunscreen, hand sanitiser, soap and toilet paper in the vehicle?" },
        { id:"handbrake", type:"choice", options:YN, alertIf:"No", label:"Handbrake working?" },
      ]},
      { title: "Sign off", fields: [
        { type:"notice", text:"If anything needs attention, please see management." },
        { id:"comments", type:"textarea", label:"Comments or things that need attention on the vehicle" },
        { id:"signatures", type:"signatures", label:"Signature", required:true },
      ]},
    ],
  },
  trailer: {
    staffField: "person",
    hash: "#trailer-check",
    title: "Trailer Check",
    pdfTitle: "NZCS Trailer Pre Start Check",
    blurb: "Pre-start check for trailers and horse floats: rego, WOF, lights, wheels, couplings.",
    sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
    sendToLabel: "Wade and Gareth",
    icon: '<path d="M2 8h15v8H2z"/><path d="M17 13h3l2 1"/><circle cx="7" cy="17.5" r="2"/><circle cx="12" cy="17.5" r="2"/>',
    titleFrom: v => `${(v.trailer === "Other" ? (v.trailerOther || "Other trailer") : v.trailer) || "Trailer"} ${dmy(v.when)}`,
    sections: [
      { title: "Check details", fields: [
        { id:"when", type:"datetime", label:"Date and time", required:true },
        { id:"location", type:"location", label:"Location" },
        { id:"person", type:"person", label:"Person filling out the form", required:true },
        { id:"trailer", type:"select", label:"Trailer being checked", required:true,
          options:["Jobmate 7x4 143G7","Jobmate 7x4 cage trailer 97F53","Red Briford trailer P301G","Briford 846M3","Briford tip trailer 6BR70","T Choice T989U","Single horse float 23F21","Double horse float","Other"] },
        { id:"trailerOther", type:"text", label:"Which trailer? (make, type and rego)", showIf:v => v.trailer === "Other" },
      ]},
      { title: "Registration and WOF", fields: [
        { id:"registered", type:"choice", options:YN, alertIf:"No", label:"Is it currently registered?" },
        { id:"regoExpiry", type:"date", label:"Date of registration expiry", alertWhen:v => !!v.regoExpiry && v.regoExpiry < todayISO() },
        { id:"wofCurrent", type:"choice", options:YN, alertIf:"No", label:"Is the WOF current?" },
        { id:"wofExpiry", type:"month", label:"WOF expiry (month and year)", alertWhen:v => !!v.wofExpiry && v.wofExpiry < todayISO().slice(0,7) },
        { id:"photoLabels", type:"photos", label:"Photo of WOF and rego labels" },
      ]},
      { title: "Lights", fields: [
        { id:"brakeLights", type:"choice", options:YN, alertIf:"No", label:"Brake lights working?" },
        { id:"indicators", type:"choice", options:YN, alertIf:"No", label:"Indicators working?" },
        { id:"plateLight", type:"choice", options:YN, alertIf:"No", label:"Number plate light working?" },
        { id:"parkLights", type:"choice", options:YN, alertIf:"No", label:"Park lights working?" },
        { id:"positionLights", type:"choice", options:["Yes","No","Not fitted"], alertIf:"No", label:"Position lights working (if fitted)?" },
      ]},
      { title: "Wheels", fields: [
        { id:"treads", type:"choice", options:YN, alertIf:"No", label:"Tyre treads suitable (more than 2 mm)?" },
        { id:"pressures", type:"choice", options:YN, alertIf:"No", label:"Tyres pumped to suitable pressures?" },
        { id:"nuts", type:"choice", options:YN, alertIf:"No", label:"Wheel nuts tight?" },
        { id:"bearings", type:"choice", options:YN, alertIf:"No", label:"Wheel bearings tight and not making noise?" },
      ]},
      { title: "Couplings", fields: [
        { id:"towball", type:"choice", options:YN, alertIf:"No", label:"Is your towball size correct / matching?" },
        { id:"plug", type:"choice", options:YN, alertIf:"No", label:"Trailer plug in good condition?" },
        { id:"shackles", type:"choice", options:YN, alertIf:"No", label:"D-shackles present?" },
        { id:"trailerBrake", type:"choice", options:["Yes","No","Not applicable"], alertIf:"No", label:"Trailer brake functional (if applicable)?" },
      ]},
      { title: "Damage", fields: [
        { id:"damage", type:"textarea", label:"Notes about any damage on the trailer" },
        { id:"photos", type:"photos", label:"Photos of any damage (optional)" },
      ]},
      { title: "Sign off", fields: [
        { type:"notice", text:"If anything needs attention, please see management." },
        { id:"signatures", type:"signatures", label:"Signature", required:true },
      ]},
    ],
  },
};
/* Incident / accident report: the employee's part is submitted and stored; a manager completes the investigation. */
const INCIDENT_EMPLOYEE = [
  { title: "Employee details", fields: [
    { id:"when", type:"datetime", label:"Date and time of the event", required:true },
    { id:"location", type:"location", label:"Location" },
    { id:"involved", type:"people", label:"Person(s) involved", other:true, required:true },
    { id:"involvedOther", type:"textarea", label:"Name(s) of other people involved", showIf:v => (v.involved||[]).includes("Other") },
    { id:"phone", type:"text", label:"Phone number" },
    { id:"position", type:"text", label:"Position in the company" },
    { id:"company", type:"fixed", label:"Company", value:"NZ Conservation Services Ltd" },
    { id:"office", type:"fixed", label:"Office location", value:"21 Roberts Rd, Drummond 9683" },
  ]},
  { title: "Event information", fields: [
    { id:"event", type:"select", label:"Event type", required:true,
      options:["Close call","New hazard","Injury","Damage","Complaint","Access","Toxins","Trapping","Opportunity / observation","Environmental","Vehicle accident / incident"] },
    { id:"project", type:"text", label:"Project / job", placeholder:"Farm name, landowner or location" },
    { id:"describe", type:"textarea", label:"Full description (enough detail that anyone reading this can understand what happened)", required:true },
    { id:"didAbout", type:"textarea", label:"What did you do about it?" },
    { id:"stillToDo", type:"textarea", label:"What still needs to be done?" },
    { id:"learned", type:"textarea", label:"What did you learn from it? What can be improved?" },
  ]},
  { title: "Injury or illness", fields: [
    { id:"injury", type:"textarea", label:"Describe the injury or illness" },
    { id:"severity", type:"textarea", label:"Describe the size / depth / severity / body part" },
    { id:"treatment", type:"select", label:"Treatment provided", options:["No treatment, report only","First aid","Doctor"] },
    { id:"clinic", type:"text", label:"What clinic did you attend?", showIf:v => v.treatment === "Doctor" },
    { id:"treatmentDetails", type:"textarea", label:"Treatment details and outcome" },
    { id:"returnDate", type:"date", label:"If unfit to work, what date will you return?" },
  ]},
  { title: "Property, animal or environmental damage", fields: [
    { id:"damaged", type:"textarea", label:"What was damaged or harmed?" },
    { id:"belongsTo", type:"text", label:"Who does it belong to?" },
  ]},
  { title: "Employee sign off", fields: [
    { type:"notice", text:"Please complete and send this form within 24 hours." },
    { id:"empSignatures", type:"signatures", label:"Employee signature", required:true },
  ]},
];
const INCIDENT_INVESTIGATION = [
  { title: "Investigation (employer)", fields: [
    { id:"contacted", type:"multi", label:"Who needs to be contacted?",
      options:["Family / emergency contact","WorkSafe","Police","Toby Haliday","Gareth Coyle or Wade McSoriley (management)","Environment Southland","Emergency services","Other","Not needed"] },
    { id:"contactDetails", type:"textarea", label:"Details, and when they were contacted" },
    { id:"witnesses", type:"textarea", label:"Name(s) and contact details of any witnesses" },
    { id:"classification", type:"choice", label:"Was it an accident, incident or near miss?", options:["Accident","Incident","Near miss"] },
    { id:"training", type:"choice", options:YN, label:"Was relevant training provided?" },
    { id:"trainingWhat", type:"textarea", label:"What training has been undertaken?", showIf:v => v.training === "Yes" },
    { id:"controls", type:"textarea", label:"What controls were in place, and why didn't they work?" },
    { id:"actions", type:"textarea", label:"What action was taken / changes made to reduce or eliminate the chance of it happening again?" },
    { id:"future", type:"textarea", label:"What future action is to be taken?" },
    { id:"invComments", type:"textarea", label:"Comments" },
    { id:"invWhen", type:"datetime", label:"Investigation date and time" },
    { id:"mgrSignatures", type:"signatures", label:"Manager signature", required:true },
  ]},
];
const incidentTitle = v => `${v.project || v.event || "Incident"} ${dmy(v.when)}`;
FORMS.incident = {
  staffField: "involved",
  hash: "#incident-report",
  title: "Incident / Accident Report",
  pdfTitle: "NZCS Incident / Accident Report",
  blurb: "Report an injury, close call, damage or other event. Managers are alerted to investigate.",
  mode: "submit",
  sendTo: [], sendToLabel: "the managers",
  icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><circle cx="12" cy="16.5" r=".6" fill="currentColor"/>',
  titleFrom: incidentTitle,
  sections: INCIDENT_EMPLOYEE,
};
FORMS.incidentInv = {
  staffField: "involved",
  hash: "#investigate",
  noTile: true,
  title: "Incident Investigation",
  pdfTitle: "NZCS Incident / Accident Investigation",
  mode: "investigate",
  sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz", "toby@nzconservation.nz"],
  sendToLabel: "Wade, Gareth and Toby",
  extraPeople: ["Sam Haliday"],
  titleFrom: incidentTitle,
  sections: INCIDENT_EMPLOYEE.map(sec => Object.assign({}, sec, {locked:true})).concat(INCIDENT_INVESTIGATION),
};
/* Staff audit: sections can be left out of the audit; every "No" asks for an action point. */
const YNA = ["Yes", "No", "N/A"];
// A Yes/No question plus an "Action point" box that appears when the answer is No
const ap = (id, label, show, opts) => [
  { id, type:"choice", options: opts || YNA, alertIf:"No", label, showIf: show },
  { id: id + "AP", type:"textarea", label:"Action point", showIf: v => (!show || show(v)) && v[id] === "No" },
];
const inAudit = key => v => v[key] === "Yes";
const method = list => v => v.fieldIn === "Yes" && (v.workMethod || []).some(m => list.includes(m));
const TRAP = ["Trapping", "Toxins", "Bait stations", "Detoxing"];
FORMS.audit = {
  staffField: "staff",
  hash: "#staff-audit",
  title: "Staff Audit",
  pdfTitle: "NZCS Staff Audit",
  blurb: "Audit a staff member's preparation, PPE, safe work practices and field work method.",
  alertTitle: "Action points",
  alertTag: "(action point)",
  sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
  sendToLabel: "Wade and Gareth",
  icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3h6v3H9z"/><path d="M8.5 12l2 2 4-4"/><path d="M8.5 17h7"/>',
  titleFrom: v => `${((v.location && v.location.address) || "").split(",")[0].trim() || (v.workMethod || []).join(", ") || "Audit"} ${dmy(v.when)}`,
  extraPeople: ["Jimmy Sycamore"],
  sections: [
    { title: "Audit information", fields: [
      { id:"when", type:"datetime", label:"Date and time", required:true },
      { id:"location", type:"location", label:"Location" },
      { id:"auditor", type:"people", label:"Auditor name", options:["Toby Haliday","Wade McSoriley","Gareth Coyle","Tad Schultz"], other:true, required:true },
      { id:"auditorOther", type:"text", label:"Other auditor's name", showIf:v => (v.auditor||[]).includes("Other") },
      { id:"staff", type:"people", label:"Staff name", other:true, required:true },
      { id:"staffOther", type:"text", label:"Other staff member: who, and where they are from", showIf:v => (v.staff||[]).includes("Other") },
    ]},
    { title: "Staff preparation", fields: [
      { id:"prepIn", type:"choice", options:YN, label:"Is this area part of the audit?" },
      { type:"notice", text:"This section checks the staff member is organised, participates, and understands their activity for the day.", showIf:inAudit("prepIn") },
      { id:"prepNotes", type:"textarea", label:"Notes", showIf:inAudit("prepIn") },
      ...ap("toolboxMtg", "Did the staff member take part in the toolbox meeting?", inAudit("prepIn")),
      ...ap("organised", "Is organised for the day's activities?", inAudit("prepIn")),
      ...ap("understandsJob", "Staff member understands their job for the day?", inAudit("prepIn")),
      ...ap("consents", "Staff member knows of any conditions on the consents for working on the property?", inAudit("prepIn")),
      ...ap("knowsHazards", "Staff member knows of any hazards in the area?", inAudit("prepIn")),
    ]},
    { title: "Licences, equipment and PPE", fields: [
      { id:"ppeIn", type:"choice", options:YN, label:"Is this area part of the audit?" },
      { type:"notice", text:"This section checks the staff member has the correct equipment for the job and understands how to use it.", showIf:inAudit("ppeIn") },
      { id:"ppeNotes", type:"textarea", label:"Notes", showIf:inAudit("ppeIn") },
      ...ap("clothing", "Correct clothing for the day, sufficient for the day's activities (vest, hi-vis shirt, hat)?", inAudit("ppeIn")),
      ...ap("footwear", "Wearing correct footwear, in good condition?", inAudit("ppeIn")),
      ...ap("glasses", "Has protective safety glasses with them?", inAudit("ppeIn")),
      ...ap("csl", "Carrying their CSL / certified handler documentation? (if required)", inAudit("ppeIn")),
      ...ap("plb", "Has a PLB, or access to one, and can explain how to use it?", inAudit("ppeIn")),
      ...ap("gps", "Has a GPS and can explain the basic features (track logs, marking points etc)? (if required)", inAudit("ppeIn")),
      ...ap("radio", "Has a radio on the correct channel, charged, and can use it correctly? (if required)", inAudit("ppeIn")),
    ]},
    { title: "Safe work practices", fields: [
      { id:"safeIn", type:"choice", options:YN, label:"Is this area part of the audit?" },
      { type:"notice", text:"This section checks the staff member is working in a safe and efficient manner.", showIf:inAudit("safeIn") },
      { id:"safeNotes", type:"textarea", label:"Notes", showIf:inAudit("safeIn") },
      ...ap("radioCheck", "Does a radio check before beginning work? (if required)", inAudit("safeIn")),
      ...ap("preStart", "Does a pre-start on the vehicle before using it?", inAudit("safeIn")),
      ...ap("communicates", "Communicates with other team members throughout the day?", inAudit("safeIn")),
      ...ap("hivis", "Keeps hi-vis on throughout the day?", inAudit("safeIn")),
      ...ap("hydrated", "Keeps hydrated and eats during the day?", inAudit("safeIn")),
      ...ap("otherPpe", "Wears other PPE when required?", inAudit("safeIn")),
    ]},
    { title: "Field work", fields: [
      { id:"fieldIn", type:"choice", options:YN, label:"Is this area part of the audit?" },
      { type:"notice", text:"This section reviews the staff member's knowledge and understanding of the work method.", showIf:inAudit("fieldIn") },
      { id:"fieldNotes", type:"textarea", label:"Notes", showIf:inAudit("fieldIn") },
      { id:"workMethod", type:"multi", label:"Work method", showIf:inAudit("fieldIn"),
        options:["Trapping","Toxins","Bait stations","Detoxing","Planting","Spraying","Chainsaw / scrub bar operation","Quad bike / LUV operation","Weed control"] },
      // Trapping, toxins, bait stations, detoxing
      { type:"notice", title:"Trapping, toxins, bait stations or detoxing", text:"", showIf:method(TRAP) },
      { id:"workType", type:"choice", label:"Work type", options:["Deploying","Checking","Removing"], showIf:method(TRAP) },
      ...ap("trapSupplies", "Carrying sufficient traps and bait, or bait stations and toxins?", method(TRAP)),
      ...ap("trapHabitat", "Identifying the best habitat for deployment and trying to get the best coverage?", method(TRAP)),
      ...ap("trapTechnique", "Technique is as per best practice / SOPs (good placement, visibility, correct height, easily accessible)?", method(TRAP)),
      ...ap("trapMarkers", "Using flagging tape or triangle markers appropriately?", method(TRAP)),
      ...ap("trapEfficient", "Shows signs of working in an efficient manner?", method(TRAP)),
      ...ap("trapCarcass", "Disposal of carcasses is out of the public eye (not on fences, in fields etc)?", method(TRAP)),
      { id:"trapComments", type:"textarea", label:"Any additional comments from the auditor or staff member?", showIf:method(TRAP) },
      // Planting
      { type:"notice", title:"Planting", text:"", showIf:method(["Planting"]) },
      ...ap("plantTechnique", "Correct planting technique (planted at correct depth, no roots showing, grass and weeds cleared around the base)?", method(["Planting"])),
      ...ap("plantSpecies", "Aware of the species being planted and putting them in the best places for survival?", method(["Planting"])),
      ...ap("plantMats", "Weed mats, guards and stakes installed correctly if required?", method(["Planting"])),
      { id:"plantComments", type:"textarea", label:"Any additional comments from the auditor or staff member?", showIf:method(["Planting"]) },
      // Spraying
      { type:"notice", title:"Spraying", text:"", showIf:method(["Spraying"]) },
      ...ap("sprayPpe", "Wearing correct PPE for spraying (cape, overalls, gloves, hat, glasses, boots)?", method(["Spraying"])),
      ...ap("mixPpe", "Wearing correct PPE for mixing chemicals (gloves, glasses, respirator)?", method(["Spraying"])),
      ...ap("mixing", "Mixing done appropriately (flat ground, spill sheet or similar to contain spills, triple rinsing of containers and knapsacks, safe handling of chemicals)?", method(["Spraying"])),
      ...ap("mixRatio", "Knows the mixing ratio of chemicals for the day?", method(["Spraying"])),
      ...ap("sprayManner", "Spraying in an appropriate manner for the job (minimal spray drift, 300 mm from target; release spraying 1 m around each side of the plant)?", method(["Spraying"])),
      ...ap("sprayDiary", "Fills in spray diary records at the end of each day and is aware of requirements (wind, weather, sensitive areas, notification, withholding periods)?", method(["Spraying"])),
      ...ap("knapsackClean", "Keeps knapsack clean and triple rinsed at least once a week when changing chemicals?", method(["Spraying"])),
      { id:"sprayComments", type:"textarea", label:"Any additional comments from the auditor or staff member?", showIf:method(["Spraying"]) },
      // Chainsaw / scrub bar
      ...ap("sawPpe", "Has appropriate PPE for the day (helmet, earmuffs, chaps, steel cap boots, safety glasses)?", method(["Chainsaw / scrub bar operation"])),
      { type:"notice", title:"Chainsaw / scrub bar operation", text:"", showIf:method(["Chainsaw / scrub bar operation"]) },
      { type:"notice", title:"Chainsaw safety features (9)", text:"On / off switch, throttle lock, rear hand guard, glove / mitt, chain brake, chain catcher, spark arrestor, anti-vibration mounts, muffler. Scrub bars have 4 safety features.", showIf:method(["Chainsaw / scrub bar operation"]) },
      ...ap("sawFeatures", "Can identify the safety features of the chainsaw (9) or scrub bar (4) and inspects them daily?", method(["Chainsaw / scrub bar operation"])),
      ...ap("sawKit", "Has tool belt, fire extinguisher, small first aid kit, and enough water for the day?", method(["Chainsaw / scrub bar operation"])),
      ...ap("sawRefuel", "Refuels in a safe space and in the correct manner (cone set up if required, lets the tool cool before refuelling)?", method(["Chainsaw / scrub bar operation"])),
      ...ap("sawSop", "Uses the tool according to best practice / SOPs?", method(["Chainsaw / scrub bar operation"])),
      ...ap("sawMaint", "Does maintenance on the tool and cleans it regularly?", method(["Chainsaw / scrub bar operation"])),
      { id:"sawComments", type:"textarea", label:"Any additional comments from the auditor or staff member?", showIf:method(["Chainsaw / scrub bar operation"]) },
      // Quad / LUV
      { type:"notice", title:"Quad bike / LUV operation", text:"", showIf:method(["Quad bike / LUV operation"]) },
      ...ap("atvPrestart", "Takes part in pre-start checks daily?", method(["Quad bike / LUV operation"])),
      ...ap("atvTrained", "Has relevant qualifications or in-house training in off-road vehicle use?", method(["Quad bike / LUV operation"])),
      ...ap("atvBestPractice", "Aware of best practice for driving (two-foot driving for the LUV, active riding for quads)?", method(["Quad bike / LUV operation"])),
      ...ap("atvRoutes", "Picks the best routes for travel and avoids hazardous situations?", method(["Quad bike / LUV operation"])),
      { id:"atvComments", type:"textarea", label:"Any additional comments from the auditor or staff member?", showIf:method(["Quad bike / LUV operation"]) },
      // Weed control
      { type:"notice", title:"Weed control", text:"", showIf:method(["Weed control"]) },
      ...ap("weedSpecies", "Aware of the weed species targeted today and knows their key identifying features?", method(["Weed control"])),
      ...ap("weedMethod", "Using the best work method for the species targeted?", method(["Weed control"])),
      ...ap("weedChemical", "Using the best chemical for treating the target species?", method(["Weed control"])),
      { id:"weedComments", type:"textarea", label:"Any additional comments from the auditor or staff member?", showIf:method(["Weed control"]) },
    ]},
    { title: "Sign off", fields: [
      { id:"signatures", type:"signatures", label:"Signature", required:true },
      { id:"toAddress", type:"textarea", label:"Area to be addressed" },
    ]},
  ],
};
FORMS.poison = {
  staffField: "staff",
  hash: "#poison-use",
  title: "Poison Use",
  pdfTitle: "NZCS Poison (Pesticide) Use",
  blurb: "Record of poison / pesticide used and how much was applied.",
  sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
  sendToLabel: "Wade and Gareth",
  icon: '<path d="M10 3h4v3l3 4v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9l3-4z"/><circle cx="12" cy="14" r="2.5"/><path d="M10 6h4"/>',
  titleFrom: v => `${v.property || "Property"} ${dmy(v.when)}`,
  sections: [
    { title: "Details", fields: [
      { id:"when", type:"datetime", label:"Date and time", required:true },
      { id:"property", type:"text", label:"Forest / farm / property name (and company name)", placeholder:"Farm name, landowner or location", required:true },
      { id:"location", type:"location", label:"Location" },
      { id:"staff", type:"people", label:"Person filling out the form and staff included", required:true },
    ]},
    { title: "Poison used", fields: [
      { id:"poisons", type:"productRows", label:"Poison used / applied and quantity", noun:"poison", required:true,
        options:["Feratox pills","Feratox bio bags","Feratox paste","Brodifacoum","Magtoxin","Double Tap","Contrac","Storm","Pindone","Other"] },
    ]},
    { title: "Sign off", fields: [
      { id:"signatures", type:"signatures", label:"Signature", required:true },
    ]},
  ],
};
/* Landowner access agreement (PCA properties). A "Discussed" tick per activity shows its follow-up questions. */
const DISC = ["Discussed"];
const disc = id => v => v[id] === "Discussed";
FORMS.access = {
  hash: "#access-agreement",
  title: "Landowner Access Agreement for PCA Properties",
  pdfTitle: "NZCS Landowner Access Agreement",
  blurb: "Landowner permission for biosecurity work on a PCA property, with activities discussed and signature.",
  sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
  sendToLabel: "Wade and Gareth",
  icon: '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9.5 14.5l2 2 3.5-4"/>',
  titleFrom: v => `${v.pca || "PCA"} ${dmy(v.date || "")}`.trim(),
  sections: [
    { title: "Agreement details", fields: [
      { id:"pca", type:"text", label:"PCA name", required:true },
      { id:"signee", type:"text", label:"Landowner / occupier / signee name", required:true },
      { id:"contractor", type:"fixed", label:"Contractor", value:"Toby Haliday - NZ Conservation Services Ltd" },
      { id:"esStaff", type:"fixed", label:"ES staff", value:"Kaitlin McKenzie - 021 422 703, Raoul Thomas - 027 344 3526" },
      { id:"date", type:"date", today:true, label:"Date signed (the property can be worked from this date)", required:true },
      { type:"notice", title:"Permission", text:"I give permission to the ES staff, their contractor and sub contractors/employees named on this form, to enter onto my land to carry out the biosecurity activities as discussed and agreed with me. In giving this approval I acknowledge that the contractor has an obligation to manage their own and their sub contractors/employees Health and Safety while working on my property." },
    ]},
    { title: "Activities discussed", fields: [
      { id:"trapDisc", type:"choice", options:DISC, label:"Possum trapping - leg hold / kill trap" },
      { id:"trapTypes", type:"multi", label:"Possum trapping type", options:["Leg hold","Kill trap","Live capture"], showIf:disc("trapDisc") },
      { id:"trapOk", type:"choice", options:YN, label:"OK to trap possums (if required)?", showIf:disc("trapDisc") },
      { id:"feratoxDisc", type:"choice", options:DISC, label:"Cyanide - Feratox pellets" },
      { id:"feratoxOk", type:"choice", options:YN, label:"OK to use cyanide / Feratox pellets?", showIf:disc("feratoxDisc") },
      { id:"feratoxNotes", type:"textarea", label:"Comments / conditions", showIf:disc("feratoxDisc") },
      { id:"pasteDisc", type:"choice", options:DISC, label:"Cyanide paste" },
      { id:"pasteOk", type:"choice", options:YN, label:"OK to use cyanide paste?", showIf:disc("pasteDisc") },
      { id:"pasteNotes", type:"textarea", label:"Comments / conditions", showIf:disc("pasteDisc") },
      { id:"otherDisc", type:"choice", options:DISC, label:"Other (specify and discuss)" },
      { id:"otherWhat", type:"text", label:"Other activity", showIf:disc("otherDisc") },
      { id:"otherNotes", type:"textarea", label:"Comments / conditions", showIf:disc("otherDisc") },
      { id:"baitDisc", type:"choice", options:DISC, label:"Possum bait station setup and baiting" },
      { id:"baitTypes", type:"multi", label:"Bait station type", options:["Sentry","Sentry Plus","Mini Philproof","Bait Safe","Kilmore"], showIf:disc("baitDisc") },
      { id:"baitNotes", type:"textarea", label:"Comments / conditions", showIf:disc("baitDisc") },
      { id:"hsbDisc", type:"choice", options:DISC, label:"High strength brodifacoum (HSB)" },
      { id:"hsbOk", type:"choice", options:YN, label:"OK to use HSB (if required)?", showIf:disc("hsbDisc") },
      { id:"hsbNotes", type:"textarea", label:"Comments / conditions", showIf:disc("hsbDisc") },
    ]},
    { title: "Control details discussed", fields: [
      { id:"farmDisc", type:"choice", options:DISC, label:"Farming activities to note" },
      { id:"farmNotes", type:"textarea", label:"Comments / conditions", showIf:disc("farmDisc") },
      { id:"treeDisc", type:"choice", options:DISC, label:"Tree felling / harvesting planned" },
      { id:"treeNotes", type:"textarea", label:"Comments / conditions", showIf:disc("treeDisc") },
      { id:"detailsDisc", type:"choice", options:DISC, label:"Contractor's details left" },
      { id:"detailsNotes", type:"textarea", label:"Comments / conditions", showIf:disc("detailsDisc") },
      { id:"vehiclesDisc", type:"choice", options:DISC, label:"Staff / contractor vehicles to be left on property" },
      { id:"vehiclesNotes", type:"textarea", label:"Comments / conditions", showIf:disc("vehiclesDisc") },
      { id:"recoveryDisc", type:"choice", options:DISC, label:"Commercial feral animal recovery activity" },
      { id:"recoveryNotes", type:"textarea", label:"Comments / conditions", showIf:disc("recoveryDisc") },
      { id:"ctrlOtherDisc", type:"choice", options:DISC, label:"Other" },
      { id:"ctrlOtherNotes", type:"textarea", label:"Comments / conditions", showIf:disc("ctrlOtherDisc") },
    ]},
    { title: "Hazards", fields: [
      { type:"notice", text:"The contractor has been advised that my property is a hazardous place and I have notified them of unusual hazards on my property." },
      { id:"unusualHazards", type:"textarea", label:"Unusual hazards (list)" },
    ]},
    { title: "Landowner / occupier details", fields: [
      { id:"ownerName", type:"text", label:"Name", required:true },
      { id:"ownerAddress", type:"textarea", label:"Property address, and mailing address if different" },
      { id:"ownerPhone", type:"text", label:"Phone number" },
      { id:"ownerEmail", type:"text", label:"Email" },
    ]},
    { title: "Disclosure and signature", fields: [
      { type:"notice", title:"Disclosure", text:"1. The landowner/occupier is responsible for making the contractor aware of any unusual hazards that would not normally be encountered on a farming property.\n2. The contractor acknowledges that they are responsible for damage to property due to their actions.\n3. All contractors contracted to Environment Southland have an assessed Health and Safety management plan.\n4. Public Liability insurance ($2,000,000) - All contractors provide evidence to the council that they hold a current policy and it includes rural forest and fire protection ($500,000).\n5. The contractor agrees to keep the landowner/occupier fully informed throughout the term of the work." },
      { id:"ownerSignatures", type:"signatures", freeName:true, label:"Landowner / occupier signature", required:true },
    ]},
  ],
};
/* Non-PCA version: same questions, NZCS contacts and wording instead of ES. */
FORMS.accessOther = (() => {
  const f = Object.assign({}, FORMS.access, {
    hash: "#access-agreement-non-pca",
    title: "Landowner Access Agreement for Non-PCA Properties",
    pdfTitle: "NZCS Landowner Access Agreement (Non-PCA)",
    blurb: "Landowner permission for work on properties not in a PCA, with activities discussed and signature.",
    titleFrom: v => `${v.pca || "Property"} ${dmy(v.date || "")}`.trim(),
  });
  f.sections = FORMS.access.sections.map(sec => Object.assign({}, sec, { fields: sec.fields.map(fl => {
    if (fl.id === "pca") return Object.assign({}, fl, { label: "Property name" });
    if (fl.id === "contractor") return Object.assign({}, fl, { value: "Toby Haliday - NZ Conservation Services Ltd, 027 319 7920" });
    if (fl.id === "esStaff") return { id:"nzcsStaff", type:"fixed", label:"NZ Conservation Services contractor details",
      value: "Operations Manager Gareth Coyle 027 278 2730, Wade McSoriley 027 344 3635, Tad Schultz 027 211 6188, David Walker 027 210 2179, Nigel Spencer 027 364 7091, Ruby Young 027 462 7307, Jonathan Poll 022 529 3044" };
    if (fl.type === "notice" && fl.title === "Permission") return Object.assign({}, fl, { text: "I give permission to the NZCS staff, their contractor and sub-contractors/employees named on this form, to enter onto my land to carry out the biosecurity activities as discussed and agreed with me. In giving this approval, I acknowledge that the contractor has an obligation to manage their own and their sub-contractors/employees Health and Safety while working on my property." });
    if (fl.type === "notice" && fl.title === "Disclosure") return Object.assign({}, fl, { text: "1. The landowner/occupier is responsible for making the contractor aware of any unusual hazards that would not normally be encountered on a farming property.\n2. The contractor acknowledges that they are responsible for damage to property due to their actions.\n3. Public Liability insurance ($2,000,000) - and hold a current policy and it includes rural forest and fire protection ($500,000).\n4. The contractor agrees to keep the landowner/occupier fully informed throughout the term of the work." });
    return fl;
  })}));
  return f;
})();
FORMS.visitor = {
  staffField: "inductedBy",
  hash: "#visitor-induction",
  title: "Visitor Induction",
  pdfTitle: "NZCS Visitor Induction",
  blurb: "Induct a visitor on site: hazards, emergency procedures, safety rules and sign-off.",
  sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
  sendToLabel: "Wade and Gareth",
  icon: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><path d="M15.5 4.5l1.5 1.5 3-3"/>',
  titleFrom: v => `${v.visitorName || "Visitor"} ${dmy(v.when)}`,
  sections: [
    { title: "General details", fields: [
      { id:"when", type:"datetime", label:"Date and time", required:true },
      { id:"inductedBy", type:"person", label:"Inducted by", required:true },
      { id:"visitorName", type:"text", label:"Name of visitor", required:true },
      { id:"company", type:"text", label:"Name of company" },
      { id:"project", type:"text", label:"Project", placeholder:"Farm name, landowner or location" },
    ]},
    { title: "Other information", fields: [
      { id:"introduced", type:"choice", options:YN, alertIf:"No", label:"Visitor introduced to staff?" },
      { id:"emergency", type:"choice", options:YN, alertIf:"No", label:"Emergency procedures explained?" },
      { id:"hazards", type:"choice", options:YN, alertIf:"No", label:"Hazards and risks they will be exposed to explained?" },
      { id:"rules", type:"choice", options:YN, alertIf:"No", label:"Safety rules explained?" },
      { id:"ppe", type:"choice", options:YN, alertIf:"No", label:"PPE checked?" },
    ]},
    { title: "Acceptance and sign off", fields: [
      { id:"acknowledge", type:"checklist", requireAll:true, required:true, okText:"Accepted", label:"The visitor ticks each statement to accept it",
        options:["I acknowledge that I have had explained to me the hazards that I may encounter on this operational site.",
                 "I will comply with NZ Conservation Services Ltd Health and Safety Policies and Procedures.",
                 "I will follow instructions given to me by authorised NZ Conservation Services staff."] },
      { id:"signatures", type:"signatures", freeName:true, label:"Visitor signature", required:true },
    ]},
  ],
};
FORMS.training = {
  staffField: "trainees",
  hash: "#training-record",
  title: "Training Record",
  pdfTitle: "NZCS Training Record",
  blurb: "Record training given: topics, trainees, trainer, course length and sign-off.",
  sendTo: ["team@nzconservation.nz", "operations@nzconservation.nz"],
  sendToLabel: "Wade and Gareth",
  icon: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>',
  titleFrom: v => `${(v.topics || "Training").split(/\n|[.,]/)[0].trim().slice(0, 40) || "Training"} ${dmy(v.when)}`,
  sections: [
    { title: "Details", fields: [
      { id:"when", type:"datetime", label:"Date and time", required:true },
      { id:"location", type:"location", label:"Location" },
      { id:"toolbox", type:"choice", options:YN, label:"Has the daily toolbox meeting been completed?" },
      { id:"trainees", type:"people", label:"Trainees present", other:true, required:true },
      { id:"traineesOther", type:"text", label:"Other trainees (names)", showIf:v => (v.trainees||[]).includes("Other") },
    ]},
    { title: "Training record", fields: [
      { id:"topics", type:"textarea", label:"Training outline / topics covered", required:true },
      { id:"meetsReq", type:"choice", options:YN, label:"Does the trainee / do the trainees meet the basic level of requirements?" },
      { id:"improvements", type:"textarea", label:"Comments / improvements to be actioned. State who, why and what needs to be done" },
      { id:"howOften", type:"choice", label:"If so, how often?", options:["Annually","Monthly","As needed"] },
      { id:"length", type:"choice", label:"Length of course", options:["30 mins","1 hour","Half day","Full day"] },
    ]},
    { title: "Trainer", fields: [
      { id:"presenter", type:"people", label:"Presenter / instructor", options:["Toby Haliday","Gareth Coyle","Tad Schultz","Wade McSoriley"] },
      { id:"external", type:"text", label:"External trainer (name and company)" },
      { id:"trainerSignatures", type:"signatures", label:"Signature (trainer)", required:true },
    ]},
    { title: "Trainee sign off", fields: [
      { type:"notice", text:"By signing this document I understand and will conform with the training I've been provided." },
      { id:"traineeSignatures", type:"signatures", label:"Signature (trainees)", required:true },
    ]},
  ],
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
              f.type === "tally" ? {} :
              f.type === "productRows" ? [{product:"", other:"", qty:""}] :
              f.type === "checklist" ? [] :
              f.type === "datetime" ? nowLocal() :
              f.type === "location" ? {address:"", lat:null, lng:null} :
              f.type === "fixed" ? f.value :
              f.type === "date" && f.today ? todayISO() : "";
  }));
  return v;
};
const values = () => drafts[current];
const isStarted = key => {
  const v = drafts[key]; if (!v) return false;
  const b = blankValues(FORMS[key]);
  return Object.keys(v).some(k => k !== "when" && JSON.stringify(v[k]) !== JSON.stringify(b[k]));
};

const tallyCols = (f, v) => f.columnsFor ? f.columnsFor(v) : f.columns;

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

/* ---------------- Problem answers (shown red on screen and on the PDF) ---------------- */
const isAlert = (f, v) => (!f.showIf || f.showIf(v)) && f.type !== "derived" && ((f.alertIf != null && v[f.id] === f.alertIf) || (!!f.alertWhen && f.alertWhen(v)));
function alertLabels(form, v){
  const out = [];
  form.sections.forEach(s => s.fields.forEach(f => {
    if (f.showIf && !f.showIf(v)) return;
    if (isAlert(f, v)) out.push(`${f.label.replace(/\?$/, "")}: ${answerText(f, v)}${f.alertWhen && (f.type === "date" || f.type === "month") ? " (expired)" : ""}`);
    if (f.type === "checklist" && f.alertUnticked) f.options.forEach(o => { if (!v[f.id].includes(o)) out.push(`${o}: not ticked`); });
    if (f.type === "derived" && f.alertWhen && f.alertWhen(v)) out.push(f.compute(v));
  }));
  return out;
}

/* ---------------- Rendering ---------------- */
function peopleList(form){ return Array.from(new Set(STAFF().concat(form.extraPeople || []))); }
function fieldHTML(form, f, v){
  const id = f.id ? `g-${f.id}` : "";
  const req = f.required ? ` <span class="hint">(required)</span>` : "";
  const err = f.id ? `<span class="err" id="${id}-err" hidden>${f.type === "signatures" ? "Add at least one signature." : f.requireAll ? "Tick every statement to accept them." : "This one is needed."}</span>` : "";
  switch (f.type){
    case "fixed":
      return `<div class="field"><span class="label">${esc(f.label)}</span><div class="fixed-val">${esc(f.value)}</div></div>`;
    case "notice":
      return `<div class="notice">${f.title ? `<b>${esc(f.title)}</b>` : ""}${f.text ? `<p>${esc(f.text).replace(/\n/g, "<br>")}</p>` : ""}</div>`;
    case "text":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><input type="text" id="${id}" data-g="${f.id}" autocomplete="off" value="${esc(v[f.id])}" placeholder="${esc(f.placeholder || "")}">${err}</div>`;
    case "textarea":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><textarea id="${id}" data-g="${f.id}" placeholder="${esc(f.placeholder || "")}">${esc(v[f.id])}</textarea>${err}</div>`;
    case "number":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><input type="number" inputmode="decimal" min="0" step="any" id="${id}" data-g="${f.id}" value="${esc(v[f.id])}" placeholder="0">${err}</div>`;
    case "person": {
      const names = peopleList(form);
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><select id="${id}" data-g="${f.id}"><option value="">Pick a name</option>${names.map(nm => `<option ${v[f.id] === nm ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select>${err}</div>`;
    }
    case "select":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><select id="${id}" data-g="${f.id}"><option value="">Pick one</option>${f.options.map(o => `<option ${v[f.id] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>${err}</div>`;
    case "checklist": {
      const ticked = v[f.id] || [];
      return `<div class="field"><span class="label">${esc(f.label)}</span><div class="checklist">` +
        f.options.map((o,i) => `<button type="button" class="check-item" id="${id}-${i}" data-gm="${f.id}" data-val="${esc(o)}" aria-pressed="${ticked.includes(o)}"><span class="box" aria-hidden="true"></span>${esc(o)}</button>`).join("") +
        `</div>${err}</div>`;
    }
    case "derived": {
      const txt = f.compute(v);
      return `<div class="field derived" data-derived="${esc(f.label)}"${txt ? "" : " hidden"}><span class="label">${esc(f.label)}</span><b class="derived-val ${/overdue|due now/i.test(txt) ? "warn" : ""}">${esc(txt)}</b></div>`;
    }
    case "date":
    case "month":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><input type="${f.type}" id="${id}" data-g="${f.id}" value="${esc(v[f.id])}">${err}</div>`;
    case "time":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><input type="time" id="${id}" data-g="${f.id}" value="${esc(v[f.id])}">${err}</div>`;
    case "tally": {
      const T = v[f.id] || {};
      return `<div class="field"><span class="label">${esc(f.label)}</span><div class="tally-scroll"><table class="tally"><thead><tr><th></th>${tallyCols(f, v).map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
        f.rows.map((r,ri) => `<tr><th scope="row">${esc(r.name)}</th>${tallyCols(f, v).map((c,ci) => r.cols.includes(c)
          ? `<td><input type="number" inputmode="numeric" min="0" step="1" id="${id}-${ri}-${f.columns.indexOf(c)}" data-gt="${f.id}" data-key="${esc(r.name + "|" + c)}" value="${esc(T[r.name + "|" + c] ?? "")}" placeholder="0" aria-label="${esc(r.name + " " + c.toLowerCase())}"></td>`
          : `<td class="na">–</td>`).join("")}</tr>`).join("") + `</tbody></table></div></div>`;
    }
    case "datetime":
      return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label><input type="datetime-local" id="${id}" data-g="${f.id}" value="${esc(v[f.id])}">${err}</div>`;
    case "choice":
      return `<div class="field"><span class="label">${esc(f.label)}${req}</span><div class="chips" role="group" aria-label="${esc(f.label)}">` +
        f.options.map((o,i) => `<button type="button" class="chip${f.alertIf === o ? " alert" : ""}" id="${id}-${i}" data-gc="${f.id}" data-val="${esc(o)}" aria-pressed="${v[f.id] === o}">${esc(o)}</button>`).join("") + `</div>${err}</div>`;
    case "multi":
      return `<div class="field"><span class="label">${esc(f.label)}${req} <span class="hint">Tick all that apply</span></span><div class="chips" role="group" aria-label="${esc(f.label)}">` +
        f.options.map((o,i) => `<button type="button" class="chip multi" id="${id}-${i}" data-gm="${f.id}" data-val="${esc(o)}" aria-pressed="${(v[f.id]||[]).includes(o)}">${esc(o)}</button>`).join("") + `</div>${err}</div>`;
    case "people": {
      const names = (f.options || peopleList(form)).concat(f.other ? ["Other"] : []);
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
          <div class="sig-item-head">${f.freeName ? `<input type="text" id="${id}-${i}-other" data-gso="${f.id}" data-i="${i}" placeholder="Name of person signing" value="${esc(s.name)}" autocomplete="off">` : `<select id="${id}-${i}-name" data-gsn="${f.id}" data-i="${i}" aria-label="Who is signing"><option value="">Who is signing?</option>${names.map(nm => `<option ${s.name === nm ? "selected" : ""}>${esc(nm)}</option>`).join("")}<option value="__other" ${s.other || (s.name && !names.includes(s.name)) ? "selected" : ""}>Visitor / other</option></select>`}
            <button type="button" class="btn-small btn-ghost" data-sigclear="${i}" data-sigfield="${f.id}">Clear</button>${list.length > 1 ? `<button type="button" class="icon-btn" data-sigdel="${i}" data-sigfield="${f.id}" aria-label="Remove signature ${i+1}">×</button>` : ""}</div>
          ${!f.freeName && (s.name && !names.includes(s.name) || s.other) ? `<input type="text" id="${id}-${i}-other" data-gso="${f.id}" data-i="${i}" placeholder="Visitor's name and company" value="${esc(names.includes(s.name) ? "" : s.name)}">` : ""}
          <div class="sig-wrap small"><div class="sig-line"></div><canvas data-gsig="${f.id}" data-i="${i}"></canvas><div class="sig-hint" ${s.sig ? "hidden" : ""}>Sign here</div></div>
        </div>`).join("") + `</div><button type="button" class="btn-small btn-ghost" data-sigadd="${f.id}" style="justify-self:start">+ Add signature</button>${err}</div>`;
    }
    case "productRows": {
      const list = v[f.id] || [];
      return `<div class="field"><span class="label">${esc(f.label)}${req}</span><div class="mixes">` + list.map((r,i) => `<div class="prow">
        <div class="field"><label for="${id}-${i}-product">${esc(f.noun === "poison" ? "Poison" : "Product")}</label><select id="${id}-${i}-product" data-gr="${f.id}" data-i="${i}" data-k="product"><option value="">Pick one</option>${f.options.map(o => `<option ${r.product === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>
        ${r.product === "Other" ? `<div class="field"><label for="${id}-${i}-other">Which product?</label><input type="text" id="${id}-${i}-other" data-gr="${f.id}" data-i="${i}" data-k="other" autocomplete="off" value="${esc(r.other)}"></div>` : ""}
        <div class="field"><label for="${id}-${i}-qty">Quantity applied</label><input type="text" id="${id}-${i}-qty" data-gr="${f.id}" data-i="${i}" data-k="qty" autocomplete="off" value="${esc(r.qty)}" placeholder="Amount and units"></div>
        ${list.length > 1 ? `<button type="button" class="btn-small btn-ghost prow-del" data-grdel="${f.id}" data-i="${i}">Remove</button>` : ""}
      </div>`).join("") + `</div><button type="button" class="btn-small btn-ghost" data-gradd="${f.id}" style="justify-self:start">+ Add another ${esc(f.noun || "product")}</button>${err}</div>`;
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
        <div class="photo-btns">
          <label class="btn btn-small photo-add" for="${id}-camera"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Take photo</label>
          <input type="file" id="${id}-camera" data-gph="${f.id}" accept="image/*" capture="environment" hidden>
          <label class="btn btn-small photo-add" for="${id}-file"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/></svg>Choose from gallery</label>
          <input type="file" id="${id}-file" data-gph="${f.id}" accept="image/*" multiple hidden>
        </div>
        <span class="hint" id="${id}-status">Photos are shrunk to keep the email small.</span></div>`;
    }
  }
  return "";
}
function render(){
  const form = FORMS[current], v = values(), host = $("#generic-body");
  $("#generic-title").textContent = form.title;
  host.innerHTML = form.sections.map((s, si) => {
    const inner = s.locked ? lockedHTML(s, v) : s.fields.map(f => (f.showIf && !f.showIf(v)) ? "" : fieldHTML(form, f, v)).join("");
    return `<section class="card${s.locked ? " locked" : ""}" id="gs-${si}"><h2>${esc(s.title)}${s.locked ? ` <span class="hint" style="text-transform:none;letter-spacing:0;font-family:var(--f-body)">from the employee</span>` : ""}</h2>${inner}</section>`;
  }).join("") + `<section class="card" id="generic-send"><h2>${form.mode === "submit" ? "Submit" : form.mode === "investigate" ? "Finish" : "Send"}</h2>${form.mode === "submit" ? submitHTML() : form.mode === "investigate" ? investigateHTML() : sendHTML(form)}</section>`;
  rerenderIfShapeChanged.last = shapeOf();
  initSigs();
}
// Read-only view of answers someone else already gave (the employee's part, seen by the investigating manager)
function lockedHTML(s, v){
  const rows = s.fields.filter(f => f.id && (!f.showIf || f.showIf(v))).map(f => {
    if (f.type === "signatures") return v[f.id].filter(x => x.sig).map(x => `<div class="ro-row"><span class="hint">${esc(f.label)}</span><span>${esc(x.name || "")}<br><img class="ro-sig" src="${x.sig}" alt="Signature"></span></div>`).join("");
    const a = answerText(f, v); if (!a) return "";
    return `<div class="ro-row"><span class="hint">${esc(f.label)}</span><span>${esc(a).replace(/\n/g, "<br>")}</span></div>`;
  }).join("");
  return rows || `<p class="hint" style="margin:0">Nothing filled in.</p>`;
}
function submitHTML(){
  return `<div class="send"><span class="hint">Your report is saved for the managers to investigate. Managers with alerts turned on are notified straight away.</span>
    <div class="btns"><button type="button" class="btn-hivis" id="g-submit">Submit report</button></div>
    <div class="status" id="g-status" role="status"></div>
    <div class="btns"><span id="g-clear-wrap"><button type="button" class="btn-small btn-ghost" id="g-clear">Clear form and start again</button></span></div></div>`;
}
function investigateHTML(){
  return `<div class="send"><div class="btns"><button type="button" id="g-save-inv">Save for later</button><button type="button" class="btn-hivis" id="g-finish-inv">Finish investigation</button></div>
    <span class="hint">Finish saves the investigation as complete. Then you'll send the full PDF to Wade, Gareth and Toby.</span>
    <div class="status" id="g-status" role="status"></div>
    <div id="g-after"></div>
    <span id="g-del-wrap"><button type="button" class="btn-small btn-danger" id="g-del-inc">Delete this report</button></span></div>`;
}
let invContext = null;   // {id} of the incident being investigated
async function submitReport(btn){
  if (!validate()) return status("Some details are missing. Check the fields marked in red.", true);
  const v = values(), sig = (v.empSignatures || []).find(x => x.sig);
  btn.disabled = true; status("Submitting…");
  try{
    await window.NZCS_HOOKS.submitIncident({report: v, reported_by: (sig && sig.name) || (v.involved || [])[0] || "", summary: [v.event, v.project].filter(Boolean).join(" – ")});
    drafts[current] = blankValues(FORMS[current]);
    $("#generic-send").innerHTML = `<h2>Submitted</h2><div class="done-box"><b>Report submitted.</b><span>The managers have it and will complete the investigation. Managers with alerts turned on have been notified.</span><button type="button" class="btn-small btn-ghost" id="g-new-report" style="justify-self:start">Start a new report</button></div>`;
    document.querySelectorAll("#generic-body section.card:not(#generic-send)").forEach(sec => sec.remove());
    window.scrollTo(0,0);
  }catch(err){
    btn.disabled = false;
    status(err.offline ? "No signal. Nothing is lost while the app stays open. Tap Submit again when you have signal." : err.message, true);
  }
}
async function saveInvestigation(complete, btn){
  const form = FORMS[current], v = values();
  if (complete && !validate()) return status("Some details are missing. Check the fields marked in red.", true);
  const inv = {};
  form.sections.filter(s => !s.locked).forEach(s => s.fields.forEach(f => { if (f.id) inv[f.id] = v[f.id]; }));
  btn.disabled = true; status("Saving…");
  try{
    await window.NZCS_HOOKS.saveInvestigation(invContext.id, inv, complete);
    btn.disabled = false;
    if (complete){
      status("Investigation finished. Now send the PDF.");
      $("#g-after").innerHTML = sendHTML(form, true);
      $("#g-save-inv").remove(); $("#g-finish-inv").remove();
    } else status("Saved. You can come back to it from the incident list.");
  }catch(err){ btn.disabled = false; status(err.offline ? "No signal. Try again when you have signal." : err.message, true); }
}
function sendHTML(form, after){
  // "after" = shown under a finished investigation, which already has its own status line and no Clear button
  if (after) return `<div class="send"><div><span class="hint">To ${esc(form.sendToLabel)}:</span> <span class="addr">${form.sendTo.map(esc).join(", ")}</span></div>
    <div class="btns"><button type="button" class="btn-hivis" id="g-share">Send PDF</button><button type="button" id="g-pdf">Download PDF</button><a class="btn" id="g-mail" href="#">Open email</a></div>
    <span class="hint">${canShareFiles ? "Opens your phone's share menu with the PDF attached. Pick Gmail or Outlook, then paste the addresses into the To line (they're copied for you)." : "Download the PDF, then use Open email and attach it from your Downloads."}</span></div>`;
  return `<div class="send"><div><span class="hint">To ${esc(form.sendToLabel)}:</span> <span class="addr">${form.sendTo.map(esc).join(", ")}</span></div>
    <div class="btns"><button type="button" class="btn-hivis" id="g-share">Send PDF</button><button type="button" id="g-pdf">Download PDF</button><a class="btn" id="g-mail" href="#">Open email</a></div>
    <span class="hint">${canShareFiles ? "Opens your phone's share menu with the PDF attached. Pick Gmail or Outlook, then paste the addresses into the To line (they're copied for you)." : "Download the PDF, then use Open email and attach it from your Downloads."}</span>
    <div class="status" id="g-status" role="status"></div>
    <div class="btns"><span id="g-clear-wrap"><button type="button" class="btn-small btn-ghost" id="g-clear">Clear form and start again</button></span></div></div>`;
}
// Re-draw only when a question appears or disappears, so typing isn't interrupted.
const shapeOf = () => FORMS[current].sections.map(s => s.fields.map(f => (!f.showIf || f.showIf(values()) ? 1 : 0) + (f.type === "tally" ? tallyCols(f, values()).join(",") : "")).join("")).join("|");
function rerenderIfShapeChanged(){
  if (shapeOf() !== rerenderIfShapeChanged.last){ const y = window.scrollY; render(); window.scrollTo(0, y); }
}

function updateDerived(){
  const form = FORMS[current], v = values();
  form.sections.forEach(s => s.fields.filter(f => f.type === "derived").forEach(f => {
    const el = document.querySelector(`[data-derived="${CSS.escape(f.label)}"]`); if (!el) return;
    const txt = f.compute(v); el.hidden = !txt;
    const b = el.querySelector(".derived-val"); b.textContent = txt; b.classList.toggle("warn", /overdue|due now/i.test(txt));
  }));
}
// <select> fields fire "change", not always "input"
document.addEventListener("change", e => { const t = e.target; if (t.matches && t.matches("#generic-body select[data-g]")){ const v = values(); if (v){ v[t.dataset.g] = t.value; const er = $(`#g-${t.dataset.g}-err`); if (er) er.hidden = true; rerenderIfShapeChanged(); } } });

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
    if (t.dataset.g){ v[t.dataset.g] = t.value; const er = $(`#g-${t.dataset.g}-err`); if (er) er.hidden = true; updateDerived(); }
    else if (t.dataset.gl){ v[t.dataset.gl].address = t.value; }
    else if (t.dataset.gso){ const s = v[t.dataset.gso][+t.dataset.i]; s.name = t.value; s.other = true; }
    else if (t.dataset.gr){ v[t.dataset.gr][+t.dataset.i][t.dataset.k] = t.value; const er = $(`#g-${t.dataset.gr}-err`); if (er) er.hidden = true; }
    else if (t.dataset.gt){ const T = v[t.dataset.gt]; if (t.value === "") delete T[t.dataset.key]; else T[t.dataset.key] = t.value; }
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
    } else if (t.dataset.gr && t.dataset.k === "product"){
      v[t.dataset.gr][+t.dataset.i].product = t.value; const y = window.scrollY; render(); window.scrollTo(0, y);
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
    if (t.dataset.gc){ v[t.dataset.gc] = v[t.dataset.gc] === t.dataset.val ? "" : t.dataset.val; { const er = $(`#g-${t.dataset.gc}-err`); if (er && v[t.dataset.gc]) er.hidden = true; }
      t.parentElement.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.val === v[t.dataset.gc]))); rerenderIfShapeChanged(); return; }
    if (t.dataset.gm){ const list = v[t.dataset.gm], val = t.dataset.val;
      v[t.dataset.gm] = list.includes(val) ? list.filter(x => x !== val) : list.concat(val);
      t.setAttribute("aria-pressed", String(v[t.dataset.gm].includes(val))); rerenderIfShapeChanged(); return; }
    if (t.dataset.ddclose){ $("#" + t.dataset.ddclose).open = false; return; }
    if (t.dataset.sigadd){ v[t.dataset.sigadd].push({name:"", sig:""}); render(); return; }
    if (t.dataset.sigdel){ v[t.dataset.sigfield || "signatures"].splice(+t.dataset.sigdel, 1); render(); return; }
    if (t.dataset.sigclear){ v[t.dataset.sigfield || "signatures"][+t.dataset.sigclear].sig = ""; render(); return; }
    if (t.id === "g-submit") return submitReport(t);
    if (t.id === "g-save-inv") return saveInvestigation(false, t);
    if (t.id === "g-finish-inv") return saveInvestigation(true, t);
    if (t.id === "g-new-report"){ drafts[current] = blankValues(FORMS[current]); rerenderIfShapeChanged.last = null; render(); window.scrollTo(0,0); return; }
    if (t.id === "g-del-inc"){ $("#g-del-wrap").innerHTML = `<span class="confirm">Delete this incident report for good? <button type="button" class="btn-small btn-danger" id="g-del-yes">Delete</button><button type="button" class="btn-small" id="g-del-no">Keep</button></span>`; return; }
    if (t.id === "g-del-no"){ $("#g-del-wrap").innerHTML = `<button type="button" class="btn-small btn-danger" id="g-del-inc">Delete this report</button>`; return; }
    if (t.id === "g-del-yes"){ try{ await window.NZCS_HOOKS.deleteIncident(invContext.id); location.hash = "#incident-report"; }catch(err){ status(err.message, true); } return; }
    if (t.dataset.mixadd){ const list = v[t.dataset.mixadd]; const last = list[list.length - 1] || {}; list.push({product:"", ml:"", litres:last.litres || "", unit:"mL"}); render(); const el = $(`#g-${t.dataset.mixadd}-${list.length - 1}-product`); if (el) el.focus(); return; }
    if (t.dataset.mixunit){
      const m = v[t.dataset.mixunit][+t.dataset.i]; m.unit = t.dataset.val === "g" ? "g" : "mL";
      t.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.val === unitOf(m))));
      const out = $(`#g-${t.dataset.mixunit}-${t.dataset.i}-rate`); if (out) out.textContent = mixRateText(m) || "–";
      return;
    }
    if (t.dataset.gradd){ v[t.dataset.gradd].push({product:"", other:"", qty:""}); render(); return; }
    if (t.dataset.grdel){ v[t.dataset.grdel].splice(+t.dataset.i, 1); render(); return; }
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
  form.sections.filter(s => !s.locked).forEach(s => s.fields.forEach(f => {
    if (!f.required || (f.showIf && !f.showIf(v))) return;
    let ok = true;
    if (f.type === "signatures") ok = v[f.id].some(x => x.sig);
    else if (f.type === "checklist" && f.requireAll) ok = f.options.every(o => v[f.id].includes(o));
    else if (f.type === "productRows") ok = v[f.id].some(r => r.product && String(r.qty).trim() && (r.product !== "Other" || String(r.other).trim()));
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
  if (f.type === "date") return dmy(a);
  if (f.type === "month") return a ? a.split("-").reverse().join("-") : "";
  if (f.type === "tally") return f.rows.map(r => r.name + ": " + r.cols.filter(c => tallyCols(f, v).includes(c)).map(c => `${c.toLowerCase()} ${a[r.name + "|" + c] || 0}`).join(", ")).join("\n");
  if (f.type === "productRows") return (a || []).filter(r => r.product).map(r => `${r.product === "Other" ? (r.other || "Other") : r.product}: ${r.qty || "quantity not given"}`).join("\n");
  if (f.type === "mixes") return usedMixes(a).map(mixLine).join("\n");
  if (f.type === "location") return [a.address, a.lat != null ? `GPS ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : ""].filter(Boolean).join("\n");
  if (f.type === "derived") return f.compute(v);
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
  // Company logo top-left on the first page, title underneath it
  let top = 26;
  if (window.NZCS_LOGO){ try{ doc.addImage(window.NZCS_LOGO, "JPEG", M, 8, 20, 20.7); top = 40; }catch(e){} }
  const tl = doc.splitTextToSize(title, W - 2*M); doc.text(tl, M, top);
  let y = top + (tl.length-1)*9 + 7;
  doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.text("NZ Conservation Services Limited", M, y); y += 8;
  const heading = txt => { if (y > H - 40){ doc.addPage(); y = 20; } doc.setFont("times","normal"); doc.setFontSize(15); doc.setTextColor(...ink); doc.text(txt, M, y); y += 4; };
  const RED = [179,38,30];
  const flagged = alertLabels(form, v);
  if (flagged.length){
    doc.autoTable(Object.assign({}, base, {startY:y, body:[[{content:(form.alertTitle || "Needs attention - please see management") + ":\n" + flagged.map(t => "- " + t).join("\n"), styles:{textColor:RED, fontStyle:"bold", fillColor:[251,228,226], lineColor:RED, lineWidth:0.4}}]], columnStyles:{0:{cellWidth:"auto"}}}));
    y = doc.lastAutoTable.finalY + 10;
  }
  const links = [];
  form.sections.forEach(s => {
    const rows = [];
    s.fields.forEach(f => {
      if (f.showIf && !f.showIf(v)) return;
      if (f.type === "notice"){ rows.push([{content:(f.title ? f.title + (f.text ? ": " : "") : "") + f.text, colSpan:2, styles:{fontStyle:"italic", textColor:[70,80,72], fillColor:[247,248,245]}}]); return; }
      if (f.type === "signatures" || f.type === "photos" || f.type === "tally") return;
      if (f.type === "checklist"){ f.options.forEach(o => {
        if (v[f.id].includes(o)) rows.push([o, f.okText || "Checked OK"]);
        else if (f.alertUnticked) rows.push([{content:o, styles:{textColor:RED}}, {content:"NOT TICKED  (needs attention)", styles:{textColor:RED, fontStyle:"bold", fillColor:[251,228,226]}}]);
        else rows.push([o, "NOT TICKED"]);
      }); return; }
      if (f.type === "derived"){ const t = f.compute(v); if (!t) return;
        if (f.alertWhen && f.alertWhen(v)) rows.push([{content:f.label, styles:{textColor:RED}}, {content:t, styles:{textColor:RED, fontStyle:"bold", fillColor:[251,228,226]}}]);
        else rows.push([f.label, t]); return; }
      if (isAlert(f, v)) rows.push([{content:f.label, styles:{textColor:RED}}, {content:answerText(f, v) + "  " + (form.alertTag || "(needs attention)"), styles:{textColor:RED, fontStyle:"bold", fillColor:[251,228,226]}}]);
      else rows.push([f.label, answerText(f, v)]);
      if (f.type === "location" && v[f.id].lat != null) links.push(`https://www.google.com/maps?q=${v[f.id].lat},${v[f.id].lng}`);
    });
    let headed = false;
    const head = () => { if (!headed){ heading(s.title); headed = true; } };
    // Tally grids (e.g. animals seen / shot) come first in their section
    s.fields.filter(f => f.type === "tally").forEach(f => {
      const T = v[f.id]; head();
      const cols = tallyCols(f, v), shown = f.rows.filter(r => cols.some(c => r.cols.includes(c)));
      doc.autoTable(Object.assign({}, base, {startY:y, head:[["", ...cols]],
        body:shown.map(r => [r.name, ...cols.map(c => r.cols.includes(c) ? String(T[r.name + "|" + c] || 0) : "–")]),
        columnStyles:{0:{cellWidth:50, fontStyle:"bold", halign:"left"}}, headStyles:Object.assign({}, base.headStyles, {halign:"center"}), bodyStyles:{halign:"center"}}));
      y = doc.lastAutoTable.finalY + (rows.length ? 4 : 10);
    });
    if (rows.length){
      head();
      // A table of only notices has one column; otherwise notices span both columns.
      const onlyNotices = rows.every(r => r.length === 1);
      const body = onlyNotices ? rows.map(r => [Object.assign({}, r[0], {colSpan:1})]) : rows;
      doc.autoTable(Object.assign({}, base, {startY:y, body, columnStyles: onlyNotices ? {0:{cellWidth:"auto"}} : base.columnStyles,
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
      const colW = (W - 2*M - 6) / 2; let col = 0, rowH = 0;
      // Keep the heading with the first photo: start a new page if the first one won't fit
      try{ const p0 = doc.getImageProperties(photos[0]); const h0 = Math.min(95, colW * p0.height / p0.width); if (y + 12 + h0 > H - 16){ doc.addPage(); y = 20; } }catch(e){}
      heading(f.label.replace(/\s*\(optional\)\s*$/i, "")); y += 2;
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
// Staff initials for file names: "Wade McSoriley" -> "WM", in the order picked.
const initialsOf = name => String(name || "").trim().split(/\s+/).map(w => w[0] || "").join("").toUpperCase();
function staffInitials(form, v){
  const raw = v[form.staffField];
  const names = (Array.isArray(raw) ? raw : [raw]).filter(n => n && n !== "Other");
  return Array.from(new Set(names.map(initialsOf).filter(Boolean))).join(" ");
}
// "NZCS Spray Diary - Willowbank farm - GC WM 10-11-2026": initials go just before the date.
function fileTitle(){
  const form = FORMS[current], v = values(), t = form.titleFrom(v), inits = staffInitials(form, v);
  const cut = t.lastIndexOf(" ");
  return `${form.pdfTitle} - ` + (inits && cut > 0 ? `${t.slice(0, cut)} - ${inits} ${t.slice(cut + 1)}` : t);
}
function makeFile(){
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("The PDF maker didn't load. Reload the page and try again.");
  const {doc} = buildPDF();
  return new File([doc.output("blob")], fileTitle().replace(/[\\/:*?"<>|]+/g, "-") + ".pdf", {type:"application/pdf"});
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
const mailHref = () => { const form = FORMS[current], v = values(); return `mailto:${form.sendTo.join(",")}?subject=${encodeURIComponent(fileTitle())}&body=${encodeURIComponent("Form attached as PDF.")}`; };
async function share(){
  if (!validate()) return status("Some details are missing. Check the fields marked in red.", true);
  let file; try{ file = makeFile(); }catch(err){ return status(err.message, true); }
  const to = FORMS[current].sendTo.join(", ");
  try{ navigator.clipboard && navigator.clipboard.writeText(to).catch(() => {}); }catch(e){}
  if (canShareFiles){
    try{ await navigator.share({files:[file], title:file.name.replace(/\.pdf$/, "")}); status("Shared. Check it went to " + to + ". Tap Clear form when you're done."); }
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
  // Open a form filled with answers from elsewhere (an incident being investigated)
  openWith(key, filled, ctx){ current = key; invContext = ctx || null; drafts[key] = Object.assign(blankValues(FORMS[key]), filled || {}); rerenderIfShapeChanged.last = null; render(); requestAnimationFrame(initSigs); },
  showMessage(html){ $("#generic-body").innerHTML = html; },
  close(){ current = null; },
  isStarted,
};
bind();
})();
