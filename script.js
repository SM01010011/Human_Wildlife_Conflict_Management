/* ============================================================
   HWCM Monitor — script.js
   All data below is SYNTHETIC demo data for the CHE110 academic
   prototype. No live wildlife data, sensors, or ML model is used.
   ============================================================ */

const speciesIcon = {elephant:"EL", leopard:"LP", boar:"WB", tiger:"TG"};
const speciesFull = {elephant:"Elephant", leopard:"Leopard", boar:"Wild boar", tiger:"Tiger"};
const riskLabel = {high:"High", mod:"Moderate", low:"Low"};
const riskRank = {high:0, mod:1, low:2};

const recommendedAction = {
  high: "Immediate forest-authority verification and preventive response; alert nearby settlements.",
  mod:  "Deploy field team for observation; monitor movement toward settlement areas.",
  low:  "Routine patrol check. No immediate action required."
};

/* monitored zones — coordinates are % positions on the simulated map.
   Scale used by the demo: 1 map unit ≈ 110 m */
const zones = {
  va:{name:"Village A",        x:25, y:30, village:true},
  vb:{name:"Village B",        x:60, y:18, village:true},
  vc:{name:"Village C",        x:85, y:42, village:true},
  vd:{name:"Village D",        x:35, y:75, village:true},
  s1:{name:"Sector 1",         x:52, y:74},
  s3:{name:"Sector 3",         x:74, y:80},
  fb:{name:"Forest boundary",  x:48, y:26}
};
const VILLAGE_KEYS = ["va","vb","vc","vd"];
const ZONE_HOME = {va:"va", vb:"vb", vc:"vc", vd:"vd", s1:"vd", s3:"vc", fb:"vb"};
const MAP_SCALE = 110; // metres per map unit (demo approximation)

/* base alert log (synthetic) — hoursAgo seeds each timestamp.
   animalRef values are guaranteed to exist in the 24-collar set below.
   Statuses follow the demo workflow: New → Under Review → Verified →
   Response Initiated → Resolved (or Dismissed). */
const baseAlerts = [
  {id:"A-1041", type:"elephant", sp:"Elephant herd", zone:"va", loc:"Village A, moving toward settlement", distM:800,  hoursAgo:3.4,  risk:"high", status:"New",              animalRef:"EL-04"},
  {id:"A-1040", type:"leopard",  sp:"Leopard",       zone:"vb", loc:"Village B, east field",              distM:2400, hoursAgo:5.2,  risk:"mod",  status:"Under Review",     animalRef:"LP-02"},
  {id:"A-1039", type:"boar",     sp:"Wild boar",     zone:"s3", loc:"Agricultural field, Sector 3",       distM:600,  hoursAgo:6.8,  risk:"mod",  status:"New",              animalRef:"WB-06"},
  {id:"A-1038", type:"elephant", sp:"Elephant",      zone:"vc", loc:"Village C outskirts",                distM:5600, hoursAgo:7.9,  risk:"low",  status:"Resolved",         animalRef:"EL-09"},
  {id:"A-1037", type:"tiger",    sp:"Tiger",         zone:"fb", loc:"Forest boundary trail",              distM:6100, hoursAgo:9.1,  risk:"low",  status:"Under Review",     animalRef:"TG-01"},
  {id:"A-1036", type:"leopard",  sp:"Leopard",       zone:"vd", loc:"Near cattle shed, Village D",        distM:1800, hoursAgo:10.5, risk:"high", status:"Response Initiated",animalRef:"LP-05"},
  {id:"A-1035", type:"boar",     sp:"Wild boar",     zone:"s1", loc:"Paddy field, Sector 1",              distM:400,  hoursAgo:12.3, risk:"mod",  status:"Verified",         animalRef:"WB-03"},
  {id:"A-1034", type:"elephant", sp:"Elephant",      zone:"va", loc:"Village A boundary",                 distM:1200, hoursAgo:13.6, risk:"high", status:"Verified",         animalRef:"EL-04"},
  {id:"A-1033", type:"leopard",  sp:"Leopard",       zone:"fb", loc:"Forest boundary trail, east ridge",  distM:4100, hoursAgo:15.0, risk:"low",  status:"Resolved",         animalRef:"LP-02"},
  {id:"A-1032", type:"boar",     sp:"Wild boar",     zone:"s3", loc:"Sector 3, maize belt",               distM:900,  hoursAgo:16.4, risk:"mod",  status:"Under Review",     animalRef:"WB-06"},
  {id:"A-1031", type:"elephant", sp:"Elephant",      zone:"vb", loc:"Village B, water point",             distM:3300, hoursAgo:17.7, risk:"low",  status:"Resolved",         animalRef:"EL-07"},
  {id:"A-1030", type:"tiger",    sp:"Tiger",         zone:"fb", loc:"Forest boundary trail, west",        distM:5800, hoursAgo:19.0, risk:"low",  status:"Under Review",     animalRef:"TG-01"},
  {id:"A-1029", type:"boar",     sp:"Wild boar",     zone:"s1", loc:"Sector 1, canal edge",               distM:1500, hoursAgo:20.6, risk:"mod",  status:"Verified",         animalRef:"WB-03"},
  {id:"A-1028", type:"elephant", sp:"Elephant",      zone:"va", loc:"Village A, school route",            distM:950,  hoursAgo:22.1, risk:"high", status:"Response Initiated",animalRef:"EL-04"},
];

/* ---------- alert workflow: statuses, timeline, persistence ---------- */
const STATUS_ORDER = ["New","Under Review","Verified","Response Initiated","Resolved","Dismissed"];
const STATUS_SHORT = {"New":"New","Under Review":"Review","Verified":"Verified","Response Initiated":"Response","Resolved":"Resolved","Dismissed":"Dismissed"};
const TRANSITION_LABELS = {
  "Under Review":"Review started by duty officer (demo)",
  "Verified":"Alert verified by forest authority (demo)",
  "Response Initiated":"Preventive response initiated — field team dispatched (demo)",
  "Resolved":"Incident resolved — animal moved back toward forest (demo)",
  "Dismissed":"Alert dismissed — false positive, no conflict risk (demo)"
};
const STATUS_KEY = "hwcm-status";
const FILTERS_KEY = "hwcm-filters";
const HISTORY_KEY = "hwcm-assess-history";
const GENREPORTS_KEY = "hwcm-generated-reports";
let storageWarned = false;
function storageWarning(){
  if(storageWarned) return;
  storageWarned = true;
  showToast("Browser storage unavailable — changes won't persist across sessions");
}
let statusOverrides = {};
try{ statusOverrides = JSON.parse(localStorage.getItem(STATUS_KEY)) || {}; }catch(e){}
try{ (JSON.parse(localStorage.getItem("hwcm-verified")) || []).forEach(id=>{ if(!statusOverrides[id]) statusOverrides[id]="Verified"; }); }catch(e){}
function saveStatuses(){
  try{ localStorage.setItem(STATUS_KEY, JSON.stringify(statusOverrides)); }catch(e){}
}

function hydrateAlert(b){
  return {...b, time:new Date(Date.now() - b.hoursAgo*3600e3)};
}
const alertData = baseAlerts.map(hydrateAlert).reverse(); // newest first
let idCounter = 1042;

Object.entries(statusOverrides).forEach(([id,st])=>{
  const a = alertData.find(x=>x.id===id);
  if(a && STATUS_ORDER.includes(st)) a.status = st;
});

function buildTimeline(a){
  const t0 = a.time.getTime();
  const at = min => new Date(t0 + min*60000);
  const L = [
    {t:at(0),   label:`${a.sp} detected (${a.animalRef ? "GPS collar "+a.animalRef : "field sighting"})`},
    {t:at(1),   label:`Risk classified as ${riskLabel[a.risk].toUpperCase()} (demo scoring model)`},
    {t:at(2),   label:"Alert dispatched to forest authority"},
  ];
  switch(a.status){
    case "Under Review":
      L.push({t:at(8), label:"Range officer opened review"}); break;
    case "Verified":
      L.push({t:at(8),  label:"Range officer opened review"},
             {t:at(14), label:"Alert verified by forest authority"}); break;
    case "Response Initiated":
      L.push({t:at(8),  label:"Range officer opened review"},
             {t:at(14), label:"Alert verified by forest authority"},
             {t:at(19), label:"Preventive response initiated — field team dispatched"}); break;
    case "Resolved":
      L.push({t:at(8),  label:"Range officer opened review"},
             {t:at(14), label:"Alert verified by forest authority"},
             {t:at(19), label:"Preventive response initiated — field team dispatched"},
             {t:at(42), label:"Incident resolved — animal moved back toward forest"}); break;
    case "Dismissed":
      L.push({t:at(8),  label:"Range officer opened review"},
             {t:at(12), label:"Dismissed — false positive, no conflict risk"}); break;
  }
  return L;
}
alertData.forEach(a=>{ a.timeline = buildTimeline(a); });

function transitionAlert(id, newStatus){
  const a = alertData.find(x=>x.id===id);
  if(!a || a.status === newStatus) return;
  a.status = newStatus;
  statusOverrides[id] = newStatus;
  saveStatuses();
  a.timeline.push({t:new Date(), label:TRANSITION_LABELS[newStatus] || `Status set to ${newStatus} (demo)`});
  syncNow();
  renderAlertTable();
  renderAlertsPreview();
  openAlertDetail(id);
  showToast(`Alert ${id} → ${newStatus}`);
}

function workflowSteps(status){
  const defs = ["Detection","Risk assessed","Alert generated","Authority review","Response","Resolution"];
  const doneCount = {"New":3,"Under Review":3,"Verified":4,"Response Initiated":5,"Resolved":6,"Dismissed":4}[status] ?? 3;
  return defs.map((label,i)=>{
    let state = "pending";
    if(i < doneCount) state = "done";
    else if(i === doneCount && status !== "Resolved" && status !== "Dismissed") state = "current";
    if(status === "Dismissed" && i >= 4) state = "skipped";
    return {label, state};
  });
}

/* ---------- tracked population: 24 GPS-collared + 104 remote ---------- */
function generateAnimals(){
  const list = [];
  const prefix = {elephant:"EL", leopard:"LP", boar:"WB", tiger:"TG"};
  const counters = {};
  // collar quota — guarantees every animalRef used by alerts exists
  [["elephant",9],["leopard",5],["boar",8],["tiger",2]].forEach(([sp,n])=>{
    for(let i=1;i<=n;i++){
      counters[sp] = (counters[sp]||0)+1;
      list.push({species:sp, collared:true, id:`${prefix[sp]}-${String(counters[sp]).padStart(2,"0")}`});
    }
  });
  // remaining 104 tracked animals (counts only)
  const mix = [["elephant",.36],["boar",.30],["leopard",.22],["tiger",.12]];
  let seed = 7;
  const rnd = ()=> (seed = (seed*1103515245 + 12345) % 2147483648) / 2147483648;
  while(list.length < 128){
    const p = rnd(); let acc = 0, sp = "elephant";
    for(const [k,w] of mix){ acc += w; if(p < acc){ sp = k; break; } }
    list.push({species:sp});
  }
  return list;
}
const animals = generateAnimals();
const collared = animals.filter(a=>a.collared);

/* collared animals: simulated live positions, risk derived from distance */
function nearestSettlement(x,y){
  let best = null, bestD = Infinity;
  VILLAGE_KEYS.forEach(k=>{
    const v = zones[k];
    const d = Math.hypot(x-v.x, y-v.y);
    if(d < bestD){ bestD = d; best = k; }
  });
  return {key:best, name:zones[best].name, units:bestD};
}
function deriveRisk(distM){ return distM < 1000 ? "high" : distM < 3000 ? "mod" : "low"; }

function initCollared(){
  const anchorZone = {};
  baseAlerts.forEach(b=>{ if(!anchorZone[b.animalRef]) anchorZone[b.animalRef] = b.zone; });
  // target risk spread: 4 high, 7 moderate, 13 low
  const classes = ["high","high","high","high","mod","mod","mod","mod","mod","mod","mod",
                   "low","low","low","low","low","low","low","low","low","low","low","low","low"];
  let seed = 99;
  const rnd = ()=> (seed = (seed*1103515245 + 12345) % 2147483648) / 2147483648;
  const zoneKeys = Object.keys(zones);
  collared.forEach((a,i)=>{
    const az = anchorZone[a.id] || zoneKeys[Math.floor(rnd()*zoneKeys.length)];
    a.zone = az;
    a.home = ZONE_HOME[az];
    const V = zones[a.home];
    const cls = classes[i];
    const mag = cls==="high" ? 2 + rnd()*6 : cls==="mod" ? 9 + rnd()*16 : 27 + rnd()*20;
    let x = V.x, y = V.y;
    for(let t=0;t<12;t++){
      const ang = rnd()*6.283;
      x = V.x + Math.cos(ang)*mag;
      y = V.y + Math.sin(ang)*mag*0.9;
      if(x>6 && x<94 && y>6 && y<94) break;
    }
    a.x = Math.min(94, Math.max(6, x));
    a.y = Math.min(94, Math.max(6, y));
    a.distM = Math.round(nearestSettlement(a.x,a.y).units * MAP_SCALE / 10) * 10;
    a.risk = deriveRisk(a.distM);
    a.maxR = Math.min(44, Math.max(10, mag + 7));
    a.wander = rnd()*6.283;
    a.lastUpdate = new Date(Date.now() - Math.floor(rnd()*240000));
    a.movement = ["Grazing / foraging","Moving slowly","Resting"][Math.floor(rnd()*3)];
  });
}
initCollared();

/* past 6 days of the 7-day trend (synthetic); "today" is derived live from the alert log */
const trendPast = [
  {h:6,m:5,l:3},{h:8,m:6,l:4},{h:9,m:7,l:4},{h:12,m:6,l:4},{h:10,m:8,l:3},{h:13,m:7,l:5}
];

/* hotspot base scores (synthetic 30-day frequency) */
const hotspotBase = [
  {zone:"va", name:"Village A corridor",     base:86},
  {zone:"s3", name:"Sector 3 farmland",      base:71},
  {zone:"fb", name:"Forest boundary trail",  base:58},
  {zone:"vd", name:"Village D shed cluster", base:44},
  {zone:"s1", name:"Sector 1 paddy belt",    base:33}
];

/* base reports — structured synthetic snapshots for the demo period */
const baseReports = [
  {id:"R-001", kind:"summary", t:"Weekly risk summary — 15–21 Sep", period:"15–21 Sep 2026 (demo)", s:"Compiled 22 Sep, 06:00 AM",
   snap:{alerts:42, high:11, mod:15, low:16,
     species:{elephant:18, boar:12, leopard:8, tiger:4},
     hotspots:[{name:"Village A corridor",pct:86},{name:"Sector 3 farmland",pct:71},{name:"Forest boundary trail",pct:58}],
     response:{"New":3,"Under Review":5,"Verified":9,"Response Initiated":6,"Resolved":17,"Dismissed":2}}},
  {id:"R-002", kind:"incident", t:"High-risk incident log — Village A", period:"1–21 Sep 2026 (demo)", s:"Compiled 20 Sep, 11:30 PM",
   snap:{alerts:9, high:9, mod:0, low:0,
     species:{elephant:7, leopard:2, boar:0, tiger:0},
     hotspots:[{name:"Village A corridor",pct:92}],
     response:{"New":1,"Under Review":2,"Verified":2,"Response Initiated":2,"Resolved":2,"Dismissed":0},
     incidents:[
       {time:"09:30 PM", sp:"Elephant herd", loc:"Village A, moving toward settlement", status:"New"},
       {time:"08:12 PM", sp:"Elephant",      loc:"Village A boundary",                 status:"Verified"},
       {time:"07:40 PM", sp:"Elephant",      loc:"Village A, school route",            status:"Response Initiated"},
       {time:"06:55 PM", sp:"Elephant herd", loc:"Village A, crop fields",             status:"Resolved"},
       {time:"05:30 PM", sp:"Leopard",       loc:"Village A, forest edge",             status:"Verified"},
     ]}},
  {id:"R-003", kind:"hotspot", t:"Monthly conflict hotspot analysis", period:"Sep 2026 (demo)", s:"Compiled 1 Sep, 08:00 AM",
   snap:{alerts:118, high:24, mod:41, low:53,
     species:{elephant:46, boar:31, leopard:27, tiger:14},
     hotspots:[{name:"Village A corridor",pct:86},{name:"Sector 3 farmland",pct:71},{name:"Forest boundary trail",pct:58},{name:"Village D shed cluster",pct:44},{name:"Sector 1 paddy belt",pct:33}],
     response:{"New":4,"Under Review":9,"Verified":21,"Response Initiated":12,"Resolved":62,"Dismissed":10}}},
];

/* ---------- persisted state ---------- */
const SETTINGS_KEY = "hwcm-settings";
const VERIFIED_KEY = "hwcm-verified";
const defaultSettings = {highSms:true, modPush:true, dailySummary:false, autoHotspots:true};
let settingsState = {...defaultSettings};
try{ Object.assign(settingsState, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }catch(e){}
function saveSettings(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsState)); }catch(e){}
}
let verifiedIds = new Set();
try{ (JSON.parse(localStorage.getItem(VERIFIED_KEY)) || []).forEach(id=>verifiedIds.add(id)); }catch(e){}
function saveVerified(){
  try{ localStorage.setItem(VERIFIED_KEY, JSON.stringify([...verifiedIds])); }catch(e){}
}

/* ---------- helpers ---------- */
function fmtDist(m){ return m < 1000 ? `${m} m` : `${(m/1000).toFixed(1)} km`; }
function fmtTime(d){ return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
function timeAgo(d){
  const s = Math.max(0, (Date.now()-d.getTime())/1000);
  if(s < 90) return "just now";
  if(s < 3600) return `${Math.round(s/60)} min ago`;
  if(s < 86400) return `${Math.round(s/3600)} h ago`;
  return d.toLocaleDateString([], {day:"numeric", month:"short"});
}
function riskColor(r){ return r==="high" ? "var(--high)" : r==="mod" ? "var(--mod)" : "var(--low)"; }
function counts(){
  const c = {high:0, mod:0, low:0};
  alertData.forEach(a=>c[a.risk]++);
  return c;
}
function hasActiveAlert(animalId){ return alertData.some(a=>a.animalRef===animalId); }

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- toast notifications ---------- */
function showToast(msg){
  const wrap = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span>${msg}</span>`;
  wrap.appendChild(t);
  requestAnimationFrame(()=> t.classList.add("in"));
  setTimeout(()=>{
    t.classList.remove("in"); t.classList.add("out");
    setTimeout(()=> t.remove(), 350);
  }, 2800);
}

/* ---------- mobile navigation drawer ---------- */
const rail = document.getElementById("rail");
const navToggle = document.getElementById("nav-toggle");
const backdrop = document.getElementById("backdrop");
function setDrawer(open){
  rail.classList.toggle("open", open);
  backdrop.classList.toggle("show", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
}
navToggle.addEventListener("click", ()=> setDrawer(!rail.classList.contains("open")));
backdrop.addEventListener("click", ()=> setDrawer(false));
const mobileMq = window.matchMedia("(max-width:820px)");
if(mobileMq.addEventListener){
  mobileMq.addEventListener("change", e=>{ if(!e.matches) setDrawer(false); });
}

/* ---------- panel switching ---------- */
const panelTitles = {
  overview:["Early Warning & Decision Support","Simulated live feed · Panna–Bandhavgarh forest corridor, India"],
  map:["Live Map","Simulated live animal tracking across the monitored corridor"],
  alerts:["Risk Alerts","Full alert log with species, location and risk classification"],
  hotspots:["Hotspots","Areas with recurring conflict activity, ranked by frequency"],
  assess:["Risk Assessment","Demonstration decision-support model · transparent rule-based scoring"],
  reports:["Reports","Auto-compiled summaries for forest authorities"],
  settings:["Settings","Configure how and when alerts are dispatched"]
};
function switchPanel(key){
  document.querySelectorAll(".nav-item[data-panel]").forEach(n=>{
    n.classList.toggle("active", n.dataset.panel === key);
    if(n.dataset.panel === key) n.setAttribute("aria-current","page");
    else n.removeAttribute("aria-current");
  });
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.getElementById("p-"+key).classList.add("active");
  document.getElementById("panel-title").textContent = panelTitles[key][0];
  document.getElementById("panel-sub").textContent = panelTitles[key][1];
  setDrawer(false);
  if(key === "overview"){ renderTrend(); renderDonut(); }
  if(key === "hotspots"){ renderHotspots(); }
}
document.querySelectorAll(".nav-item[data-panel]").forEach(item=>{
  item.addEventListener("click", ()=> switchPanel(item.dataset.panel));
});

/* ---------- report modal ---------- */
const reportModal = document.getElementById("report-modal");
const modalBody = document.getElementById("modal-body");
let modalTimer = null;
let lastFocused = null;

const REPORT_KINDS = {summary:"Risk summary", incident:"Incident log", hotspot:"Hotspot analysis"};
let generatedReports = [];
let genSeq = 101;
let reportFilter = "all";
try{
  const saved = JSON.parse(localStorage.getItem(GENREPORTS_KEY));
  if(Array.isArray(saved)) generatedReports = saved.slice(0,12);
}catch(e){}
function saveGenReports(){
  try{ localStorage.setItem(GENREPORTS_KEY, JSON.stringify(generatedReports.slice(0,12))); }
  catch(e){ storageWarning(); }
}

function liveSnap(days){
  const c = counts();
  const archived = days >= 30 ? 76 : days >= 7 ? 21 : 0; // synthetic archived demo records
  const species = {elephant:0, leopard:0, boar:0, tiger:0};
  alertData.forEach(a=>species[a.type]++);
  [["elephant",.36],["boar",.30],["leopard",.22],["tiger",.12]].forEach(([k,w])=>{
    species[k] += Math.round(archived*w);
  });
  const response = {};
  STATUS_ORDER.forEach(st=>{ response[st] = alertData.filter(a=>a.status===st).length; });
  response["Verified"]  += Math.round(archived*0.14);
  response["Resolved"]  += Math.round(archived*0.78);
  response["Dismissed"] += Math.round(archived*0.08);
  return {
    alerts: alertData.length + archived,
    high: c.high + Math.round(archived*0.24),
    mod:  c.mod  + Math.round(archived*0.38),
    low:  c.low  + Math.round(archived*0.38),
    species, response,
    hotspots: getHotspots(),
    incidents: alertData.filter(a=>a.risk==="high").slice(0,5)
      .map(a=>({time:fmtTime(a.time), sp:a.sp, loc:a.loc, status:a.status}))
  };
}

function observations(snap){
  const o = [];
  const topH = snap.hotspots[0];
  if(topH) o.push(`${topH.name} remains the most active conflict zone (${topH.pct}% frequency).`);
  const topSp = Object.entries(snap.species).sort((a,b)=>b[1]-a[1])[0];
  o.push(`${speciesFull[topSp[0]]} accounted for ${topSp[1]} of ${snap.alerts} recorded alerts.`);
  o.push(`${(snap.response["New"]||0) + (snap.response["Under Review"]||0)} alert(s) currently awaiting authority review.`);
  o.push(`${snap.response["Response Initiated"]||0} response(s) in progress and ${snap.response["Resolved"]||0} incident(s) resolved in the period.`);
  if(snap.alerts && snap.high/snap.alerts > 0.3)
    o.push("High-risk share exceeds 30% — consider intensified patrolling near settlement edges.");
  return o;
}

function getReports(){
  const list = [];
  if(settingsState.dailySummary){
    list.push({id:"R-DAILY", kind:"summary",
      t:`Daily summary — ${new Date().toLocaleDateString([], {day:"numeric", month:"short"})}`,
      period:"Last 24 hours (demo)",
      s:"Auto-generated · updates with the live demo alert log",
      snap:liveSnap(1)});
  }
  list.push(...generatedReports, ...baseReports);
  return list;
}

function reportHTML(r){
  const s = r.snap;
  const speciesRows = Object.entries(s.species).map(([k,v])=>
    `<div class="spec-row"><span class="cl">${speciesFull[k]}</span><span class="contrib-bar"><span class="spec-fill" style="width:${(v/Math.max(1,s.alerts)*100).toFixed(0)}%"></span></span><span class="contrib-pts">${v}</span></div>`).join("");
  const hotRows = s.hotspots.map((h,i)=>
    `<div class="spec-row"><span class="cl">${i+1}. ${h.name}</span><span class="contrib-bar"><span class="contrib-fill md" style="width:${h.pct}%"></span></span><span class="contrib-pts">${h.pct}%</span></div>`).join("");
  const statusRows = STATUS_ORDER.map(st=>`<div class="rep-line"><b>${st}</b><span>${s.response[st]||0}</span></div>`).join("");
  const obs = observations(s).map(o=>`<li>${o}</li>`).join("");
  const incidentRows = (s.incidents||[]).map(i=>
    `<div class="rep-line"><b>${i.sp} — ${i.loc}</b><span>${i.time} · ${statusChip(i.status, true)}</span></div>`).join("");
  return `
    <div class="rep-meta"><span>Reporting period</span><b>${r.period}</b></div>
    <div class="rep-summary">
      <div class="rep-cell"><div class="rv">${s.alerts}</div><div class="rl">Alerts</div></div>
      <div class="rep-cell"><div class="rv" style="color:var(--high)">${s.high}</div><div class="rl">High</div></div>
      <div class="rep-cell"><div class="rv" style="color:var(--mod)">${s.mod}</div><div class="rl">Moderate</div></div>
      <div class="rep-cell"><div class="rv" style="color:var(--low)">${s.low}</div><div class="rl">Low</div></div>
    </div>
    <div class="rep-sec">Species distribution</div>${speciesRows}
    <div class="rep-sec">Top hotspots</div>${hotRows}
    <div class="rep-sec">Response status</div>${statusRows}
    ${s.incidents ? `<div class="rep-sec">Recent high-risk incidents</div>${incidentRows}` : ""}
    <div class="rep-sec">Key observations</div><ul class="factor-list">${obs}</ul>
    <div class="rep-note">Synthetic demo report generated for the CHE110 academic prototype — no live wildlife data or trained ML model is used.</div>`;
}

function reportText(r){
  const s = r.snap;
  const L = [];
  L.push("HWCM MONITOR — REPORT (DEMO)");
  L.push(r.t);
  L.push("=".repeat(48));
  L.push(`Reporting period: ${r.period}`);
  L.push(`Generated: ${r.s}`);
  L.push("");
  L.push(`ALERTS: ${s.alerts}  (High ${s.high} · Moderate ${s.mod} · Low ${s.low})`);
  L.push("");
  L.push("SPECIES DISTRIBUTION");
  Object.entries(s.species).forEach(([k,v])=> L.push(`  ${speciesFull[k]}: ${v}`));
  L.push("");
  L.push("TOP HOTSPOTS");
  s.hotspots.forEach((h,i)=> L.push(`  ${i+1}. ${h.name} — ${h.pct}%`));
  L.push("");
  L.push("RESPONSE STATUS");
  STATUS_ORDER.forEach(st=> L.push(`  ${st}: ${s.response[st]||0}`));
  if(s.incidents && s.incidents.length){
    L.push("");
    L.push("RECENT HIGH-RISK INCIDENTS");
    s.incidents.forEach(i=> L.push(`  [${i.time}] ${i.sp} — ${i.loc} (${i.status})`));
  }
  L.push("");
  L.push("KEY OBSERVATIONS");
  observations(s).forEach(o=> L.push(`  · ${o}`));
  L.push("");
  L.push("-".repeat(48));
  L.push("Synthetic demo report — CHE110 academic prototype. No live wildlife data or trained ML model is used.");
  return L.join("\n");
}

function openReport(i){
  lastFocused = document.activeElement;
  const r = getReports()[i];
  if(!r) return;
  document.getElementById("modal-title").textContent = r.t;
  document.getElementById("modal-sub").textContent = r.s;
  modalBody.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">
    <div class="skel" style="width:40%"></div>
    <div class="skel" style="width:90%"></div>
    <div class="skel" style="width:75%"></div>
  </div>`;
  reportModal.hidden = false;
  setTimeout(()=>{
    if(reportModal.hidden) return;
    modalBody.innerHTML = reportHTML(r);
  }, reducedMotion.matches ? 0 : 380);
  document.getElementById("modal-close").focus();
}
function closeModal(){
  clearTimeout(modalTimer);
  reportModal.hidden = true;
  if(lastFocused && lastFocused.focus) lastFocused.focus();
}
reportModal.addEventListener("click", e=>{ if(e.target.closest("[data-close-modal]")) closeModal(); });
document.getElementById("modal-download").addEventListener("click", ()=>{
  const title = document.getElementById("modal-title").textContent;
  const r = getReports().find(x=>x.t === title);
  if(!r) return;
  const blob = new Blob([reportText(r)], {type:"text/plain"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hwcm-report.txt";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Report downloaded (.txt)");
});

function generateReport(){
  const days = Number(document.getElementById("report-period").value);
  const kind = document.getElementById("report-kind").value;
  const pl = days===1 ? "Last 24 hours" : days===7 ? "Last 7 days" : "Last 30 days";
  const r = {
    id:`R-${genSeq++}`,
    kind,
    t:`${REPORT_KINDS[kind]} — ${pl}`,
    period:`${pl} (demo, generated from the current alert log)`,
    s:`Generated ${new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})} · demo data`,
    generated:true,
    snap:liveSnap(days)
  };
  generatedReports.unshift(r);
  genSeq++;
  saveGenReports();
  reportFilter = r.kind;
  syncReportChips();
  renderReports();
  showToast(`${REPORT_KINDS[kind]} generated (demo)`);
  openReport(getReports().indexOf(r));
}

/* ---------- alert detail modal ---------- */
const alertModal = document.getElementById("alert-modal");
const alertModalBody = document.getElementById("alert-modal-body");
let currentAlertId = null;

function statusChip(status, short){
  const map = {
    "New":               ["mod",     short ? "New" : "New"],
    "Under Review":      ["review",  short ? "Review" : "Under review"],
    "Verified":          ["low",     "Verified"],
    "Response Initiated":["action",  short ? "Response" : "Response initiated"],
    "Resolved":          ["resolved","Resolved"],
    "Dismissed":         ["neutral", "Dismissed"]
  };
  const [cls, label] = map[status] || ["neutral", status];
  return `<span class="status-chip ${cls}">${label}</span>`;
}

function openAlertDetail(id){
  const a = alertData.find(x=>x.id===id);
  if(!a) return;
  lastFocused = document.activeElement;
  currentAlertId = id;
  document.getElementById("alert-modal-title").textContent = `${a.sp} — ${riskLabel[a.risk]} risk`;
  document.getElementById("alert-modal-sub").textContent = `Alert ${a.id} · simulated demo data`;
  const steps = workflowSteps(a.status).map((s,i)=>
    `<li class="wf-step ${s.state}" style="--i:${i}"><span class="wf-dot" aria-hidden="true">${s.state==="done"?"✓":""}</span><span class="wf-lb">${s.label}</span></li>`).join("");
  const timeline = a.timeline.map((e,i)=>
    `<li style="--i:${Math.min(i,10)}"><span class="tl-dot" aria-hidden="true"></span><span><b>${fmtTime(e.t)}</b> — ${e.label}</span></li>`).join("");
  alertModalBody.innerHTML = `
    <ol class="wf-steps" aria-label="Alert workflow progress">${steps}</ol>
    <dl class="detail-grid">
      <dt>Animal</dt><dd>${a.sp}${a.animalRef ? ` · <b>${a.animalRef}</b> (GPS collar)` : ""}</dd>
      <dt>Location</dt><dd>${a.loc} <span class="dim">(${zones[a.zone].name})</span></dd>
      <dt>Distance</dt><dd>${fmtDist(a.distM)} from nearest settlement</dd>
      <dt>Risk</dt><dd><span class="tag ${a.risk}">${a.risk==="mod"?"MODERATE":a.risk.toUpperCase()}</span></dd>
      <dt>Time</dt><dd>${fmtTime(a.time)} · ${timeAgo(a.time)}</dd>
      <dt>Status</dt><dd>${statusChip(a.status)}</dd>
      <dt>Recommended action</dt><dd>${recommendedAction[a.risk]}</dd>
    </dl>
    <div class="rep-sec">Timeline</div>
    <ol class="timeline">${timeline}</ol>
    <div class="rep-note">Simulated demo alert from the CHE110 academic prototype — classification is rule-based demo logic, not a trained ML model.</div>`;
  renderAlertActions(a);
  alertModal.hidden = false;
  document.getElementById("alert-modal-close").focus();
}
function renderAlertActions(a){
  const host = document.getElementById("alert-actions");
  const btn = (label, st) => `<button type="button" class="btn-ghost" data-trans="${st}">${label}</button>`;
  let html = "";
  switch(a.status){
    case "New":              html = btn("Start review","Under Review") + btn("Dismiss","Dismissed"); break;
    case "Under Review":     html = btn("Verify alert","Verified") + btn("Dismiss","Dismissed"); break;
    case "Verified":         html = btn("Initiate response","Response Initiated"); break;
    case "Response Initiated": html = btn("Mark resolved","Resolved"); break;
    default: html = `<span class="wf-done">${a.status==="Resolved" ? "Workflow complete ✓" : "Closed as dismissed"}</span>`;
  }
  host.innerHTML = html + `<button type="button" class="btn-ghost" data-close-alert>Close</button>`;
  host.querySelectorAll("[data-trans]").forEach(b=> b.addEventListener("click", async ()=>{
    const st = b.dataset.trans;
    if(st === "Dismissed"){
      const ok = await confirmDialog("Dismiss this alert?",
        `Alert ${a.id} will be closed as a false positive. It stays in the log with a Dismissed status and can still be reviewed later.`,
        "Dismiss alert");
      if(!ok) return;
    }
    transitionAlert(a.id, st);
  }));
}
function closeAlertModal(){
  alertModal.hidden = true;
  currentAlertId = null;
  if(lastFocused && lastFocused.focus) lastFocused.focus();
}
alertModal.addEventListener("click", e=>{ if(e.target.closest("[data-close-alert]")) closeAlertModal(); });

/* ---------- map scene (layered) ---------- */
function treeCluster(cx,cy,n,spread){
  let s="";
  for(let i=0;i<n;i++){
    const a = (i/n)*6.28 + cx*0.7;
    const rr = spread*Math.sqrt((i*37 % 97)/97);
    const x = (cx + Math.cos(a)*rr).toFixed(1);
    const y = (cy + Math.sin(a)*rr*0.6).toFixed(1);
    const r = (0.6 + (i%3)*0.35).toFixed(2);
    const op = (0.28 + (i%4)*0.09).toFixed(2);
    s += `<circle class="m-tree" cx="${x}" cy="${y}" r="${r}" opacity="${op}"></circle>`;
  }
  return s;
}

function initMapScene(el, uid){
  const forestClusters = [[16,14,14,9],[38,10,12,8],[10,38,12,8],[30,32,16,10],[70,20,10,7],[80,32,12,8]];
  const trees = forestClusters.map(c=>treeCluster(c[0],c[1],c[2],c[3])).join("");
  el.innerHTML = `
    <svg class="map-terrain" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="forestFill-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" class="mf-forest-a"/><stop offset="1" class="mf-forest-b"/>
        </linearGradient>
        <linearGradient id="farmFill-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" class="mf-farm-a"/><stop offset="1" class="mf-farm-b"/>
        </linearGradient>
      </defs>
      <rect width="100" height="100" class="m-bg"></rect>
      <g class="layer-forest">
        <polygon points="4,6 52,4 62,28 44,50 20,54 6,36" fill="url(#forestFill-${uid})"></polygon>
        <ellipse cx="88" cy="70" rx="9" ry="6" fill="#8FB89F" opacity=".4"></ellipse>
        ${trees}
      </g>
      <g class="layer-farm">
        <polygon points="8,55 55,48 78,66 64,94 12,96 4,76" fill="url(#farmFill-${uid})"></polygon>
      </g>
      <g class="layer-river">
        <path class="m-river" d="M6,10 C26,26 15,42 38,50 C56,58 60,36 94,48" fill="none" stroke-opacity=".6" stroke-width="1.1"></path>
        <path class="m-river" d="M6,10 C26,26 15,42 38,50 C56,58 60,36 94,48" fill="none" stroke-opacity=".25" stroke-width="2.6"></path>
      </g>
      <g class="layer-roads">
        <line class="m-road" x1="25" y1="30" x2="60" y2="18" stroke-opacity=".55" stroke-width="0.45" stroke-dasharray="1.4 1.4"></line>
        <line class="m-road" x1="60" y1="18" x2="85" y2="42" stroke-opacity=".55" stroke-width="0.45" stroke-dasharray="1.4 1.4"></line>
        <line class="m-road" x1="25" y1="30" x2="35" y2="75" stroke-opacity=".55" stroke-width="0.45" stroke-dasharray="1.4 1.4"></line>
        <line class="m-road" x1="35" y1="75" x2="85" y2="42" stroke-opacity=".55" stroke-width="0.45" stroke-dasharray="1.4 1.4"></line>
      </g>
      <g class="layer-zone">
        <polygon points="20,20 60,14 78,34 70,58 40,52 22,40" fill="var(--primary)" fill-opacity=".07" stroke="var(--primary)" stroke-opacity=".45" stroke-width="0.5" stroke-dasharray="1.6 1.2"></polygon>
        <text x="49" y="12.5" text-anchor="middle" font-size="2.4" letter-spacing="0.3" fill="var(--primary)" font-family="Inter,sans-serif" font-weight="600" opacity=".8">MONITORING ZONE · CORE</text>
      </g>
      <g class="layer-boundary">
        <rect x="3" y="3" width="94" height="94" rx="6" fill="none" stroke="var(--primary)" stroke-opacity=".35" stroke-width="0.6" stroke-dasharray="2.2 1.8"></rect>
      </g>
    </svg>
    <div class="map-tag">Buffer Zone 4 · Panna–Bandhavgarh corridor</div>
    <div class="map-live"><i aria-hidden="true"></i>SIMULATED LIVE DATA</div>
    <svg class="compass" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="15" cy="15" r="13.5" fill="none" stroke="var(--line-soft)" stroke-width="1"></circle>
      <path d="M15,4 L18,15 L15,26 L12,15 Z" fill="var(--primary)" opacity=".85"></path>
      <text x="15" y="8" font-size="6" fill="var(--ink)" text-anchor="middle" font-family="Inter,sans-serif">N</text>
    </svg>
    <div class="scale-bar"><span class="ln"></span>2 km</div>
    <div class="map-coord coord-n">22.58°N</div>
    <div class="map-coord coord-e">80.93°E</div>
    <div class="map-legend">
      <div><span class="sw" style="background:var(--map-forest-a)"></span>Forest</div>
      <div><span class="sw" style="background:var(--map-farm-a)"></span>Farmland</div>
      <div><span class="sw" style="background:var(--map-river)"></span>River</div>
      <div><span class="sw" style="background:var(--ink-dim)"></span>Settlement</div>
    </div>
    <div class="map-pins"></div>`;
  Object.entries(zones).forEach(([key,v])=>{
    const layerCls = v.village ? "layer-villages" : (key==="fb" ? "layer-boundary" : "layer-farm");
    const lab = document.createElement("div");
    lab.className = `village ${layerCls}`;
    lab.style.left = v.x+"%"; lab.style.top = v.y+"%";
    lab.innerHTML = `<span class="v-dot"></span>${v.name}`;
    el.appendChild(lab);
  });
}

/* ---------- map markers (collared animals) ---------- */
const mapFull = document.getElementById("map-full");
const mapPreview = document.getElementById("map-preview");
let mapFilter = "all", mapRisk = "all", mapActiveOnly = false;
let layerState = {};

function saveFilters(){
  try{
    localStorage.setItem(FILTERS_KEY, JSON.stringify({
      alert: alertState, mapFilter, mapRisk, mapActiveOnly, reportFilter, layers: layerState
    }));
  }catch(e){ storageWarning(); }
}
function loadFilters(){
  let f = null;
  try{ f = JSON.parse(localStorage.getItem(FILTERS_KEY)); }catch(e){}
  if(!f || typeof f !== "object") return;
  try{
    if(f.alert && typeof f.alert === "object"){
      if(["all","high","mod","low"].includes(f.alert.severity)) alertState.severity = f.alert.severity;
      if(["all","elephant","leopard","boar","tiger"].includes(f.alert.species)) alertState.species = f.alert.species;
      if(f.alert.zone in zones) alertState.zone = f.alert.zone;
      if(typeof f.alert.search === "string") alertState.search = f.alert.search.slice(0,80);
      if(f.alert.sort && ["time","dist","risk"].includes(f.alert.sort.key) && ["asc","desc"].includes(f.alert.sort.dir))
        alertState.sort = {key:f.alert.sort.key, dir:f.alert.sort.dir};
    }
    if(["all","elephant","leopard","boar","tiger"].includes(f.mapFilter)) mapFilter = f.mapFilter;
    if(["all","high","mod","low"].includes(f.mapRisk)) mapRisk = f.mapRisk;
    mapActiveOnly = !!f.mapActiveOnly;
    if(["all","summary","incident","hotspot"].includes(f.reportFilter)) reportFilter = f.reportFilter;
    if(f.layers && typeof f.layers === "object") layerState = f.layers;
  }catch(e){}
}
function applyLayers(){
  Object.entries(layerState).forEach(([k,off])=>{
    mapFull.classList.toggle("hide-"+k, !!off);
    const chip = document.querySelector(`.lbtn[data-layer="${k}"]`);
    if(chip){
      chip.classList.toggle("off", !!off);
      chip.setAttribute("aria-pressed", String(!off));
    }
  });
}

function markerList(){
  return collared.filter(a=>
    (mapFilter==="all" || a.species===mapFilter) &&
    (mapRisk==="all" || a.risk===mapRisk) &&
    (!mapActiveOnly || hasActiveAlert(a.id))
  );
}
function markerLabel(a){
  return `${a.id} · ${speciesFull[a.species]} · ${riskLabel[a.risk]} risk · ${fmtDist(a.distM)} from settlement · updated ${timeAgo(a.lastUpdate)}`;
}
function updateMarkerEl(m,a){
  m.style.left = a.x+"%";
  m.style.top = a.y+"%";
  m.style.color = riskColor(a.risk);
  m.classList.toggle("high", a.risk==="high");
  m.classList.toggle("mod", a.risk==="mod");
  m.classList.toggle("low", a.risk==="low");
  m.title = markerLabel(a);
  m.setAttribute("aria-label", markerLabel(a) + " — open details");
}
function createMarker(a, preview){
  const m = document.createElement("button");
  m.type = "button";
  m.className = "pin";
  m.dataset.animal = a.id;
  m.innerHTML = `<span class="pin-label" aria-hidden="true">${a.id}</span>`;
  m.addEventListener("click", ()=>{
    if(preview){ switchPanel("map"); }
    openAnimalInfo(a.id);
  });
  return m;
}
function renderMap(el, useFilters){
  const layer = el.querySelector(".map-pins");
  if(!layer) return;
  const list = useFilters ? markerList() : collared;
  const keep = new Set(list.map(a=>a.id));
  [...layer.querySelectorAll(".pin")].forEach(m=>{
    if(!keep.has(m.dataset.animal)) m.remove();
  });
  list.forEach(a=>{
    let m = layer.querySelector(`[data-animal="${a.id}"]`);
    if(!m){
      m = createMarker(a, el===mapPreview);
      layer.appendChild(m);
    }
    updateMarkerEl(m,a);
  });
}

/* ---------- animal info panel ---------- */
const mapPanel = document.getElementById("map-panel");
let panelAnimalId = null;

function riskFactors(a){
  const f = [];
  if(a.distM < 1000) f.push("Very close to settlement (<1 km)");
  else if(a.distM < 3000) f.push("Within 3 km of a settlement");
  const hb = hotspotBase.find(h=>h.zone===a.zone);
  if(hb) f.push(`Recurring hotspot zone (${hb.name})`);
  const hr = new Date().getHours();
  if(hr >= 18 || hr < 6) f.push("Evening/night activity window");
  if(String(a.movement).startsWith("Moving toward")) f.push("Recent movement toward settlement");
  if(!f.length) f.push("No elevated factors — routine monitoring");
  return f;
}

function openAnimalInfo(id){
  const a = collared.find(x=>x.id===id);
  if(!a) return;
  panelAnimalId = id;
  renderAnimalPanel();
  mapPanel.hidden = false;
  requestAnimationFrame(()=> mapPanel.classList.add("open"));
}
function renderAnimalPanel(){
  const a = collared.find(x=>x.id===panelAnimalId);
  if(!a) return;
  const near = nearestSettlement(a.x, a.y);
  document.getElementById("mp-title").textContent = a.id;
  document.getElementById("mp-sub").textContent = `${speciesFull[a.species]} · simulated live data`;
  const alert = [...alertData].reverse().find(x=>x.animalRef===a.id);
  document.getElementById("mp-alert").hidden = !alert;
  if(alert) document.getElementById("mp-alert").textContent = `View alert ${alert.id}`;
  document.getElementById("mp-body").innerHTML = `
    <dl class="detail-grid">
      <dt>Animal ID</dt><dd><b>${a.id}</b></dd>
      <dt>Species</dt><dd>${speciesFull[a.species]}</dd>
      <dt>Risk level</dt><dd><span class="tag ${a.risk}">${a.risk==="mod"?"MODERATE":a.risk.toUpperCase()}</span></dd>
      <dt>Location</dt><dd>Near ${zones[a.zone].name} <span class="dim">· Buffer Zone 4</span></dd>
      <dt>Distance</dt><dd>~${fmtDist(a.distM)} from ${near.name}</dd>
      <dt>Movement</dt><dd>${a.movement}</dd>
      <dt>Last update</dt><dd>${fmtTime(a.lastUpdate)} · ${timeAgo(a.lastUpdate)}</dd>
    </dl>
    <div class="rep-sec">Risk factors</div>
    <ul class="factor-list">${riskFactors(a).map(f=>`<li>${f}</li>`).join("")}</ul>
    <div class="rep-note">Position, movement and risk are simulated demo data — not real GPS telemetry.</div>`;
}
function closeAnimalPanel(){
  mapPanel.classList.remove("open");
  panelAnimalId = null;
  setTimeout(()=>{ mapPanel.hidden = true; }, 220);
}
function updateAnimalPanel(){
  if(mapPanel.hidden || !panelAnimalId) return;
  const a = collared.find(x=>x.id===panelAnimalId);
  if(!a){ closeAnimalPanel(); return; }
  renderAnimalPanel();
}
document.getElementById("mp-close").addEventListener("click", closeAnimalPanel);
document.getElementById("mp-alert").addEventListener("click", ()=>{
  const alert = [...alertData].reverse().find(x=>x.animalRef===panelAnimalId);
  if(alert) openAlertDetail(alert.id);
});

/* ---------- controlled movement simulation ---------- */
let simRunning = true;
function tickSim(){
  collared.forEach(a=>{
    const prev = {x:a.x, y:a.y, d:a.distM};
    a.wander += (Math.random()-0.5)*0.9;
    const step = 0.3 + Math.random()*0.35;
    let nx = a.x + Math.cos(a.wander)*step;
    let ny = a.y + Math.sin(a.wander)*step;
    const V = zones[a.home];
    const dx = nx-V.x, dy = ny-V.y, d = Math.hypot(dx,dy);
    if(d > a.maxR){
      nx = V.x + dx/d*a.maxR;
      ny = V.y + dy/d*a.maxR;
      a.wander += 2.2;
    }
    a.x = Math.min(94, Math.max(6, nx));
    a.y = Math.min(94, Math.max(6, ny));
    a.distM = Math.round(nearestSettlement(a.x,a.y).units * MAP_SCALE / 10) * 10;
    const newRisk = deriveRisk(a.distM);
    const movedM = Math.hypot(a.x-prev.x, a.y-prev.y) * MAP_SCALE;
    a.movement = movedM < 45 ? "Resting"
      : movedM < 130 ? "Grazing / foraging"
      : (a.distM < prev.d ? `Moving toward ${zones[a.home].name}` : `Moving away from ${zones[a.home].name}`);
    a.lastUpdate = new Date();
    if(newRisk !== a.risk){
      a.risk = newRisk;
      if(newRisk === "high" && settingsState.highSms){
        showToast(`${a.id} movement alert — now HIGH risk, ${fmtDist(a.distM)} from ${zones[a.home].name} (simulated)`);
      }
    }
  });
  renderMap(mapFull, true);
  renderMap(mapPreview, false);
  updateAnimalPanel();
}
setInterval(()=>{ if(simRunning && !document.hidden) tickSim(); }, 3000);
document.getElementById("sim-toggle").addEventListener("click", ()=>{
  simRunning = !simRunning;
  const btn = document.getElementById("sim-toggle");
  btn.textContent = simRunning ? "⏸ Pause movement" : "▶ Resume movement";
  btn.setAttribute("aria-pressed", String(!simRunning));
  showToast(simRunning ? "Movement simulation resumed" : "Movement simulation paused");
});

/* ---------- map filters & layers ---------- */
document.querySelectorAll("#p-map .fbtn[data-mf]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll("#p-map .fbtn[data-mf]").forEach(b=>b.classList.remove("on"));
    btn.classList.add("on");
    mapFilter = btn.dataset.mf;
    saveFilters();
    renderMap(mapFull, true);
  });
});
document.querySelectorAll("#p-map .fbtn[data-rf]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll("#p-map .fbtn[data-rf]").forEach(b=>b.classList.remove("on"));
    btn.classList.add("on");
    mapRisk = btn.dataset.rf;
    saveFilters();
    renderMap(mapFull, true);
  });
});
document.getElementById("active-only").addEventListener("click", ()=>{
  mapActiveOnly = !mapActiveOnly;
  const btn = document.getElementById("active-only");
  btn.classList.toggle("on", mapActiveOnly);
  btn.setAttribute("aria-pressed", String(mapActiveOnly));
  saveFilters();
  renderMap(mapFull, true);
});
document.querySelectorAll("#p-map .lbtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const layer = btn.dataset.layer;
    const off = btn.classList.toggle("off");
    btn.setAttribute("aria-pressed", String(!off));
    layerState[layer] = off;
    saveFilters();
    mapFull.classList.toggle("hide-"+layer, off);
  });
});

/* ---------- rendering: alerts ---------- */
const alertState = {
  severity:"all", species:"all", zone:"all", search:"",
  sort:{key:"time", dir:"desc"}
};

function syncFilterChips(){
  document.querySelectorAll("#alert-filters .fbtn").forEach(b=>
    b.classList.toggle("on", b.dataset.f === alertState.severity));
  document.querySelectorAll("#species-filters .fbtn").forEach(b=>
    b.classList.toggle("on", b.dataset.sf === alertState.species));
}

function filteredAlerts(){
  const q = alertState.search.trim().toLowerCase();
  let list = alertData.filter(a=>
    (alertState.severity==="all" || a.risk===alertState.severity) &&
    (alertState.species==="all" || a.type===alertState.species) &&
    (alertState.zone==="all" || a.zone===alertState.zone) &&
    (!q || a.sp.toLowerCase().includes(q) || a.loc.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
  );
  const {key, dir} = alertState.sort;
  const mul = dir==="asc" ? 1 : -1;
  list = [...list].sort((a,b)=>{
    if(key==="time") return (a.time - b.time)*mul;
    if(key==="dist") return (a.distM - b.distM)*mul;
    const sev = (riskRank[a.risk] - riskRank[b.risk]) * (dir==="desc" ? 1 : -1);
    return sev || (b.time - a.time);
  });
  return list;
}

function renderAlertTable(highlightId){
  const body = document.getElementById("alert-table");
  const empty = document.getElementById("alerts-empty");
  const meta = document.getElementById("alerts-meta");
  const list = filteredAlerts();
  body.innerHTML = "";
  meta.textContent = `Showing ${list.length} of ${alertData.length} alerts`;
  if(!list.length){
    empty.hidden = false;
    document.querySelector("#alerts-empty .empty-t").textContent =
      alertState.search ? "No alerts match your search" : "No alerts match these filters";
    return;
  }
  empty.hidden = true;
  list.forEach((a,i)=>{
    const tr = document.createElement("tr");
    if(a.id===highlightId) tr.className = "row-new";
    if(a.status==="Dismissed") tr.classList.add("row-dismissed");
    tr.style.animationDelay = Math.min(i,10)*30 + "ms";
    tr.tabIndex = 0;
    tr.setAttribute("aria-label", `Alert ${a.id}: ${a.sp}, ${a.loc}, ${riskLabel[a.risk]} risk, status ${a.status}. Press Enter for details.`);
    tr.innerHTML = `
      <td class="main"><span class="sp-mono ${a.type}" aria-hidden="true">${speciesIcon[a.type]||"—"}</span> ${a.sp}</td>
      <td>${a.loc}</td><td>${fmtDist(a.distM)}</td><td>${fmtTime(a.time)}</td>
      <td><span class="tag ${a.risk}">${a.risk==="mod"?"MODERATE":a.risk.toUpperCase()}</span></td>
      <td class="cell-status">${statusChip(a.status, true)}</td>
      <td class="cell-actions"><button type="button" class="icon-btn btn-xs" data-detail="${a.id}" aria-label="View details for alert ${a.id}">↗</button></td>`;
    tr.addEventListener("click", e=>{
      if(e.target.closest("[data-detail]")) return;
      openAlertDetail(a.id);
    });
    tr.addEventListener("keydown", e=>{
      if(e.key==="Enter" || e.key===" "){ e.preventDefault(); openAlertDetail(a.id); }
    });
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-detail]").forEach(btn=>
    btn.addEventListener("click", ()=> openAlertDetail(btn.dataset.detail)));
}

function renderAlertsPreview(){
  const wrap = document.getElementById("alerts-preview");
  wrap.innerHTML = "";
  alertData.slice(0,4).forEach(a=>{
    const row = document.createElement("button");
    row.type = "button";
    row.className = "alert-row";
    row.setAttribute("aria-label", `Open details: ${a.sp} near ${a.loc}`);
    row.innerHTML = `<span class="a-main">
      <span class="sp-mono ${a.type}" aria-hidden="true">${speciesIcon[a.type]||"—"}</span>
      <span class="a-text"><span>${a.sp} detected near ${a.loc}</span><span class="a-time">${fmtTime(a.time)} · ${timeAgo(a.time)}</span></span></span>
      <span class="tag ${a.risk}">${a.risk==="mod"?"MODERATE":a.risk.toUpperCase()}</span>`;
    row.addEventListener("click", ()=> openAlertDetail(a.id));
    wrap.appendChild(row);
  });
}

/* ---------- rendering: stats / charts / hotspots ---------- */
function setKpi(id, value){
  const el = document.getElementById(id);
  if(el.textContent !== String(value)){
    el.textContent = value;
    if(!reducedMotion.matches){
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
  }
}
function refreshStats(){
  const c = counts();
  setKpi("s-high", c.high);
  setKpi("s-mod", c.mod);
  setKpi("s-low", c.low);
  setKpi("s-total", animals.length);
}

function getHotspots(){
  return hotspotBase.map(h=>{
    let pct = h.base;
    if(settingsState.autoHotspots){
      const live = alertData.filter(a=>a.zone===h.zone).length;
      pct = Math.min(98, h.base + live*3);
    }
    return {zone:h.zone, name:h.name, pct};
  }).sort((a,b)=>b.pct-a.pct);
}

function renderHotspots(){
  const el = document.getElementById("hotspot-list");
  el.innerHTML = "";
  getHotspots().forEach((h,i)=>{
    const row = document.createElement("div");
    row.className = "hotspot-row";
    row.innerHTML = `<div class="name">${h.name}</div>
      <div class="bar-track" role="img" aria-label="${h.name}: ${h.pct}% conflict frequency"><div class="bar-fill" style="width:0%"></div></div>
      <div class="pct">0%</div>`;
    el.appendChild(row);
    // grow-in with stagger; counts tick up alongside
    requestAnimationFrame(()=> requestAnimationFrame(()=>{
      const fill = row.querySelector(".bar-fill");
      const num = row.querySelector(".pct");
      fill.style.transition = `width .8s var(--ease) ${i*90}ms`;
      fill.style.width = h.pct + "%";
      if(!reducedMotion.matches){
        const start = performance.now();
        const dur = 850 + i*90;
        const frame = t=>{
          const p = Math.min(1, (t-start)/dur);
          num.textContent = Math.round(h.pct * (1-Math.pow(1-p,3))) + "%";
          if(p<1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }else{
        num.textContent = h.pct + "%";
      }
    }));
  });
  const mode = document.getElementById("hotspot-mode");
  if(mode) mode.textContent = settingsState.autoHotspots
    ? "auto-recalculated from the live demo alert log"
    : "frozen snapshot · auto-recalculation off";
}

function renderReports(){
  const el = document.getElementById("report-list");
  const all = getReports();
  const list = all.filter(r=>reportFilter==="all" || r.kind===reportFilter);
  el.innerHTML = "";
  if(!list.length){
    el.innerHTML = `<div class="empty"><div class="empty-ic" aria-hidden="true">▤</div><div class="empty-t">No reports of this type</div><div class="empty-s">Generate a new simulated report, or switch the filter above.</div></div>`;
    return;
  }
  list.forEach(r=>{
    const idx = all.indexOf(r);
    const row = document.createElement("div");
    row.className = "report-item";
    row.innerHTML = `<div><div class="rt"><span class="kind-tag">${REPORT_KINDS[r.kind]}</span>${r.t}${r.generated ? ' <span class="live-tag">new</span>' : (r.daily ? ' <span class="live-tag">today</span>' : "")}</div><div class="rs">${r.period} · ${r.s}</div></div>
      <button type="button" class="btn-ghost" data-report="${idx}">View</button>`;
    el.appendChild(row);
  });
  el.querySelectorAll("[data-report]").forEach(btn=>
    btn.addEventListener("click", ()=> openReport(Number(btn.dataset.report))));
}
function syncReportChips(){
  document.querySelectorAll("#report-filters .fbtn[data-rk]").forEach(b=>
    b.classList.toggle("on", b.dataset.rk === reportFilter));
}
document.querySelectorAll("#report-filters .fbtn[data-rk]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    reportFilter = btn.dataset.rk;
    syncReportChips();
    saveFilters();
    renderReports();
  });
});
document.getElementById("generate-report").addEventListener("click", generateReport);

const settings = [
  {t:"High-risk SMS alerts", s:"Toast notifications for new high-risk alerts and risk escalations (simulated dispatch)",
   get:()=>settingsState.highSms, set:v=>settingsState.highSms=v},
  {t:"Moderate-risk notifications", s:"Toast notifications for new moderate-risk alerts (community app, simulated)",
   get:()=>settingsState.modPush, set:v=>settingsState.modPush=v},
  {t:"Daily summary", s:"Add an auto-compiled daily summary to the Reports panel",
   get:()=>settingsState.dailySummary, set:v=>settingsState.dailySummary=v,
   onChange:()=>renderReports()},
  {t:"Auto hotspot recalculation", s:"Recompute hotspot scores from the live demo alert log",
   get:()=>settingsState.autoHotspots, set:v=>settingsState.autoHotspots=v,
   onChange:()=>renderHotspots()},
];

function renderSettings(){
  const el = document.getElementById("settings-list");
  el.innerHTML = "";
  settings.forEach(s=>{
    const row = document.createElement("div");
    row.className = "setting-row";
    row.innerHTML = `<div><div class="st">${s.t}</div><div class="ss">${s.s}</div></div>
      <button type="button" class="switch ${s.get()?'on':''}" role="switch" aria-checked="${s.get()}" aria-label="${s.t}"><i></i></button>`;
    el.appendChild(row);
  });
  el.querySelectorAll(".switch").forEach((sw,i)=>{
    sw.addEventListener("click", ()=>{
      const s = settings[i];
      s.set(!s.get());
      sw.classList.toggle("on", s.get());
      sw.setAttribute("aria-checked", String(s.get()));
      s.onChange && s.onChange();
      saveSettings();
      showToast(`${s.t} — preferences saved`);
    });
  });
}

/* ---------- charts (data-driven) ---------- */
function smoothPath(pts){
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for(let i=0;i<pts.length-1;i++){
    const p0 = pts[Math.max(0,i-1)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(pts.length-1,i+2)];
    const c1x = p1[0]+(p2[0]-p0[0])/6, c1y = p1[1]+(p2[1]-p0[1])/6;
    const c2x = p2[0]-(p3[0]-p1[0])/6, c2y = p2[1]-(p3[1]-p1[1])/6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function getTrendData(){
  const days = trendPast.map(d=>({...d}));
  const c = counts();
  days.push({h:c.high, m:c.mod, l:c.low});
  return days;
}

let trendDays = [];
function renderTrend(){
  const host = document.getElementById("chart-trend");
  const tip = document.getElementById("chart-tip");
  const data = getTrendData();
  const W=340, H=190, padL=26, padR=12, padT=14, padB=26;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const maxV = Math.max(16, ...data.map(d=>d.h+d.m+d.l)) + 2;
  const now = new Date();
  trendDays = [];
  for(let i=6;i>=0;i--){
    const d = new Date(now.getTime() - i*86400000);
    trendDays.push({
      short: i===0 ? "Today" : d.toLocaleDateString([], {weekday:"short"}),
      full: d.toLocaleDateString([], {day:"numeric", month:"short"})
    });
  }
  const X = i => padL + i*(plotW/(data.length-1));
  const Y = v => padT + plotH - (v/maxV)*plotH;

  let grid = "";
  const step = Math.ceil(maxV/4/2)*2;
  for(let g=step; g<=maxV; g+=step){
    grid += `<line x1="${padL}" y1="${Y(g).toFixed(1)}" x2="${W-padR}" y2="${Y(g).toFixed(1)}" stroke="var(--line-soft)" stroke-width="1"></line>
      <text x="${padL-6}" y="${(Y(g)+2.5).toFixed(1)}" text-anchor="end" font-size="7.5" fill="var(--ink-faint)" font-family="Inter,sans-serif">${g}</text>`;
  }
  let labels = "";
  trendDays.forEach((d,i)=>{
    labels += `<text x="${X(i).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="7.5" fill="${i===data.length-1?"var(--primary)":"var(--ink-faint)"}" font-family="Inter,sans-serif" font-weight="${i===data.length-1?"600":"400"}">${d.short}</text>`;
  });

  const series = [
    {label:"High", color:"var(--high)", key:"h"},
    {label:"Moderate", color:"var(--mod)", key:"m"},
    {label:"Low", color:"var(--low)", key:"l"}
  ];
  let paths = "", dots = "";
  series.forEach((s,si)=>{
    const pts = data.map((d,i)=>[X(i), Y(d[s.key])]);
    paths += `<path class="trend-line" d="${smoothPath(pts)}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>`;
    data.forEach((d,i)=>{
      dots += `<circle class="trend-dot" data-si="${si}" data-i="${i}" cx="${X(i).toFixed(1)}" cy="${Y(d[s.key]).toFixed(1)}" r="3" fill="${s.color}" stroke="var(--panel)" stroke-width="1.5" opacity="0"></circle>`;
    });
  });
  let hits = "";
  const colW = plotW/data.length;
  data.forEach((d,i)=>{
    hits += `<rect data-hit="${i}" x="${(padL+i*colW).toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${plotH}" fill="transparent"></rect>`;
  });

  let guide = `<div class="trend-cursor" id="trend-cursor"></div>`;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of daily alert counts by risk level over the last 7 days, derived from the demo alert log">${grid}${labels}${paths}${dots}${hits}</svg>${guide}`;

  host.querySelectorAll(".trend-line").forEach((p,idx)=>{
    if(reducedMotion.matches) return;
    const len = p.getTotalLength();
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
    p.style.transition = "none";
    requestAnimationFrame(()=>{
      p.style.transition = `stroke-dashoffset .8s var(--ease) ${idx*120}ms`;
      p.style.strokeDashoffset = "0";
    });
  });

  const svg = host.querySelector("svg");
  const cursorEl = document.getElementById("trend-cursor");
  svg.addEventListener("mousemove", e=>{
    const hit = e.target.closest("[data-hit]");
    if(!hit){ tip.classList.remove("show"); cursorEl.classList.remove("show"); return; }
    const i = Number(hit.dataset.hit);
    const d = data[i];
    const rows = series.map(s=>
      `<div class="tt-row"><i style="background:${s.color}"></i>${s.label} <b>&nbsp;${d[s.key]}</b></div>`).join("");
    tip.innerHTML = `<div class="tt-d">${trendDays[i].full}${i===data.length-1?" · live":""}</div>${rows}`;
    const xPct = (X(i)/W)*100;
    tip.style.left = `min(max(${xPct}%, 60px), calc(100% - 60px))`;
    tip.style.top = "6px";
    tip.style.transform = "translateX(-50%)";
    tip.classList.add("show");
    cursorEl.style.left = xPct + "%";
    cursorEl.classList.add("show");
    svg.querySelectorAll(".trend-dot").forEach(dt=>{
      dt.style.opacity = (Number(dt.dataset.i)===i) ? "1" : "0";
    });
  });
  svg.addEventListener("mouseleave", ()=>{
    tip.classList.remove("show");
    cursorEl.classList.remove("show");
    svg.querySelectorAll(".trend-dot").forEach(dt=> dt.style.opacity="0");
  });
}

function renderDonut(){
  const host = document.getElementById("chart-donut");
  const c = counts();
  const total = alertData.length || 1;
  let pcts = [c.high, c.mod, c.low].map(v=>Math.round(v/total*100));
  const diff = 100 - (pcts[0]+pcts[1]+pcts[2]);
  pcts[2] += diff;
  const C = 99.9;
  const colors = ["var(--high)","var(--mod)","var(--low)"];
  const names = ["High risk","Moderate risk","Low risk"];
  let segs = "";
  let offset = 25;
  pcts.forEach((p,i)=>{
    segs += `<g transform="rotate(-90 21 21)"><circle class="donut-seg" cx="21" cy="21" r="15.9" fill="transparent" stroke="${colors[i]}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="0 ${C}" stroke-dashoffset="${offset}" data-target="${p}" tabindex="0" role="img" aria-label="${names[i]}: ${p}% of the alert log"></circle></g>`;
    offset -= p;
  });
  host.innerHTML = `<svg class="donut-svg" width="128" height="128" viewBox="0 0 42 42" role="img" aria-label="Donut chart of the current alert log: high risk ${pcts[0]}%, moderate risk ${pcts[1]}%, low risk ${pcts[2]}%. Hover a segment to highlight it.">
    <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="var(--panel-3)" stroke-width="6"></circle>
    ${segs}
    <text x="21" y="19.5" text-anchor="middle" font-size="5.2" font-weight="600" fill="var(--ink)" font-family="Fraunces,serif">${alertData.length}</text>
    <text x="21" y="25.5" text-anchor="middle" font-size="3" fill="var(--ink-faint)" font-family="Inter,sans-serif">alerts in log</text>
  </svg>`;
  ["leg-high","leg-mod","leg-low"].forEach((id,i)=>
    document.getElementById(id).textContent = `${pcts[i]}%`);

  const segEls = [...host.querySelectorAll(".donut-seg")];
  const legendRows = [...document.querySelectorAll(".legend [data-seg]")];
  segEls.forEach((seg,i)=>{
    const on  = ()=>{ seg.classList.add("lit"); host.classList.add("focus"); legendRows[i]?.classList.add("lit"); };
    const off = ()=>{ seg.classList.remove("lit"); host.classList.remove("focus"); legendRows[i]?.classList.remove("lit"); };
    seg.addEventListener("mouseenter", on);
    seg.addEventListener("mouseleave", off);
    seg.addEventListener("focus", on);
    seg.addEventListener("blur", off);
  });
  legendRows.forEach((row,i)=>{
    row.addEventListener("mouseenter", ()=>{
      segEls[i]?.classList.add("lit");
      host.classList.add("focus");
      row.classList.add("lit");
    });
    row.addEventListener("mouseleave", ()=>{
      segEls[i]?.classList.remove("lit");
      host.classList.remove("focus");
      row.classList.remove("lit");
    });
  });

  if(reducedMotion.matches){
    segEls.forEach(s=> s.style.strokeDasharray = `${s.dataset.target} ${C-s.dataset.target}`);
    return;
  }
  requestAnimationFrame(()=> requestAnimationFrame(()=>{
    segEls.forEach((s,idx)=>{
      s.style.transition = `stroke-dasharray .7s var(--ease) ${idx*130}ms, transform .18s var(--ease), opacity .18s var(--ease), stroke-width .18s var(--ease)`;
      s.style.strokeDasharray = `${s.dataset.target} ${C-s.dataset.target}`;
      setTimeout(()=>{ s.style.transition = ""; }, 1500 + idx*130);
    });
  }));
}

/* ---------- simulated alert stream ---------- */
const locTemplates = {
  va:["Village A, settlement edge","Village A, crop fields","Village A boundary"],
  vb:["Village B, east field","Village B, water point","Village B grazing land"],
  vc:["Village C outskirts","Village C, forest edge"],
  vd:["Village D, cattle shed area","Village D approach road"],
  s1:["Sector 1, paddy belt","Sector 1, canal edge"],
  s3:["Sector 3, maize belt","Sector 3, farm access track"],
  fb:["Forest boundary trail","Forest boundary, east ridge"]
};

function simulateAlert(){
  const animal = collared[Math.floor(Math.random()*collared.length)];
  const zoneKeys = Object.keys(locTemplates);
  const zk = zoneKeys[Math.floor(Math.random()*zoneKeys.length)];
  const tpl = locTemplates[zk];
  const loc = tpl[Math.floor(Math.random()*tpl.length)];
  const distM = 300 + Math.floor(Math.random()*6200);
  const risk = distM < 1000 ? "high" : distM < 3000 ? "mod" : "low";
  const alert = {
    id:`A-${String(idCounter++).padStart(4,"0")}`,
    type:animal.species,
    sp:speciesFull[animal.species],
    zone:zk, loc,
    distM,
    time:new Date(),
    risk,
    status:"New",
    animalRef:animal.id
  };
  alertData.unshift(alert);
  alert.timeline = [
    {t:alert.time, label:`${alert.sp} detected (${alert.animalRef ? "GPS collar "+alert.animalRef : "field sighting"})`},
    {t:new Date(alert.time.getTime()+60000), label:`Risk classified as ${riskLabel[alert.risk].toUpperCase()} (demo scoring model)`},
    {t:new Date(alert.time.getTime()+120000), label:"Alert dispatched to forest authority"},
  ];
  while(alertData.length > 40){
    const idx = [...alertData].reverse().findIndex(a=>a.risk==="low");
    if(idx === -1){ alertData.pop(); break; }
    alertData.splice(alertData.length-1-idx, 1);
  }
  notifyDataChanged(alert.id);
  if(risk==="high" && settingsState.highSms)
    showToast(`New HIGH-risk alert — ${alert.sp} near ${zones[zk].name} (simulated)`);
  else if(risk==="mod" && settingsState.modPush)
    showToast(`New moderate-risk alert — ${alert.sp} near ${zones[zk].name} (simulated)`);
}

function notifyDataChanged(highlightId){
  syncNow();
  refreshStats();
  renderAlertTable(highlightId);
  renderAlertsPreview();
  renderHotspots();
  renderReports();
  if(document.getElementById("p-overview").classList.contains("active")){
    renderTrend();
    renderDonut();
  }
}

/* ---------- filters & sorting wiring ---------- */
document.querySelectorAll("#alert-filters .fbtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    alertState.severity = btn.dataset.f;
    syncFilterChips();
    saveFilters();
    renderAlertTable();
  });
});
document.querySelectorAll("#species-filters .fbtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    alertState.species = btn.dataset.sf;
    syncFilterChips();
    saveFilters();
    renderAlertTable();
  });
});
document.getElementById("alert-search").addEventListener("input", e=>{
  alertState.search = e.target.value;
  saveFilters();
  renderAlertTable();
});
document.getElementById("zone-select").addEventListener("change", e=>{
  alertState.zone = e.target.value;
  saveFilters();
  renderAlertTable();
});
document.getElementById("clear-alert-filter").addEventListener("click", ()=>{
  alertState.severity = "all"; alertState.species = "all"; alertState.zone = "all"; alertState.search = "";
  document.getElementById("alert-search").value = "";
  document.getElementById("zone-select").value = "all";
  syncFilterChips();
  saveFilters();
  renderAlertTable();
  showToast("Showing all alerts");
});
document.querySelectorAll(".sort-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const key = btn.dataset.sort;
    if(alertState.sort.key === key) alertState.sort.dir = alertState.sort.dir==="asc" ? "desc" : "asc";
    else alertState.sort = {key, dir: key==="dist" ? "asc" : "desc"};
    syncSortIndicators();
    saveFilters();
    renderAlertTable();
  });
});
function syncSortIndicators(){
  document.querySelectorAll(".sort-btn").forEach(btn=>{
    const th = btn.closest("th");
    if(btn.dataset.sort === alertState.sort.key){
      btn.classList.add("sorted");
      btn.querySelector(".sort-ind").textContent = alertState.sort.dir==="asc" ? "▲" : "▼";
      th.setAttribute("aria-sort", alertState.sort.dir==="asc" ? "ascending" : "descending");
    }else{
      btn.classList.remove("sorted");
      btn.querySelector(".sort-ind").textContent = "↕";
      th.removeAttribute("aria-sort");
    }
  });
}

/* ---------- KPI navigation ---------- */
document.querySelectorAll(".stat[data-goto]").forEach(card=>{
  card.addEventListener("click", ()=>{
    const target = card.dataset.goto;
    if(target === "map"){ switchPanel("map"); return; }
    alertState.severity = target;
    syncFilterChips();
    switchPanel("alerts");
    renderAlertTable();
  });
});

/* ---------- live clock & sensor sync ---------- */
let lastSync = new Date();
function syncNow(){ lastSync = new Date(); }
setInterval(syncNow, 20000); // periodic telemetry sync (simulated)

function syncLabel(){
  const s = Math.floor((Date.now() - lastSync.getTime())/1000);
  if(s < 3) return "just now";
  if(s < 60) return `${s}s ago`;
  return `${Math.floor(s/60)}m ${s%60}s ago`;
}
function tick(){
  const now = new Date();
  document.getElementById("clock-time").textContent = now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  document.getElementById("clock-date").textContent = now.toLocaleDateString([], {day:'2-digit',month:'short',year:'numeric'});
  document.getElementById("last-sync").textContent = syncLabel();
}
setInterval(tick, 1000); tick();

/* ---------- KPI count-up on load ---------- */
function countUp(el, target, dur){
  if(reducedMotion.matches){ el.textContent = target; return; }
  const start = performance.now();
  function frame(t){
    const p = Math.min(1, (t-start)/dur);
    const eased = 1 - Math.pow(1-p, 3);
    el.textContent = Math.round(target*eased);
    if(p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------- confirmation dialog ---------- */
const confirmModal = document.getElementById("confirm-modal");
let confirmResolve = null;
function confirmDialog(title, msg, okLabel){
  return new Promise(res=>{
    confirmResolve = res;
    document.getElementById("cf-title").textContent = title;
    document.getElementById("cf-msg").textContent = msg;
    document.getElementById("cf-ok").textContent = okLabel || "Confirm";
    confirmModal.hidden = false;
    document.getElementById("cf-ok").focus();
  });
}
function closeConfirm(result){
  if(confirmModal.hidden) return;
  confirmModal.hidden = true;
  if(confirmResolve){ confirmResolve(result); confirmResolve = null; }
}
confirmModal.addEventListener("click", e=>{
  if(e.target.closest("[data-cf]")) closeConfirm(e.target.closest("[data-cf]").dataset.cf === "ok");
});

/* ---------- reset demo data ---------- */
document.getElementById("reset-demo").addEventListener("click", async ()=>{
  const ok = await confirmDialog("Reset demo data?",
    "This restores the original synthetic dataset, resets settings and filters, and clears alert status changes, generated reports and assessment history. This cannot be undone.",
    "Reset demo data");
  if(!ok) return;
  try{
    [SETTINGS_KEY, STATUS_KEY, "hwcm-verified", FILTERS_KEY, HISTORY_KEY, GENREPORTS_KEY, "hwcm-theme"]
      .forEach(k=>localStorage.removeItem(k));
  }catch(e){}
  showToast("Demo data reset — restoring original dataset…");
  setTimeout(()=> location.reload(), 700);
});

/* ---------- escape key ---------- */
document.addEventListener("keydown", e=>{
  if(e.key !== "Escape") return;
  if(!confirmModal.hidden){ closeConfirm(false); return; }
  if(!reportModal.hidden){ closeModal(); return; }
  if(!alertModal.hidden){ closeAlertModal(); return; }
  if(!mapPanel.hidden){ closeAnimalPanel(); return; }
  if(rail.classList.contains("open")) setDrawer(false);
});

/* ---------- demo error state (recoverable, rate-limited) ---------- */
let lastDemoError = 0;
window.addEventListener("error", ()=>{
  if(Date.now() - lastDemoError < 8000) return;
  lastDemoError = Date.now();
  showToast("A demo error occurred — the prototype recovered safely");
});

/* ---------- first-load splash ---------- */
const splash = document.getElementById("splash");
function hideSplash(){
  if(!splash || splash.classList.contains("gone")) return;
  splash.classList.add("gone");
  setTimeout(()=>{ if(splash.parentNode) splash.remove(); }, 500);
}
if(reducedMotion.matches || !splash){
  if(splash) splash.remove();
}else{
  setTimeout(hideSplash, 1500);
  splash.addEventListener("click", hideSplash);
  document.addEventListener("keydown", function onKey(){
    hideSplash();
    document.removeEventListener("keydown", onKey);
  }, {once:true});
}

/* ---------- simulated incoming alert stream (demo) ---------- */
setInterval(()=>{
  if(document.hidden) return;
  if(Math.random() < 0.6) simulateAlert();
}, 45000);
document.getElementById("simulate-btn").addEventListener("click", ()=> simulateAlert());

/* ============================================================
   Risk Assessment — DEMONSTRATION DECISION-SUPPORT MODEL.
   Transparent, rule-based scoring for the academic prototype.
   This is NOT a trained machine-learning model.
   ============================================================ */
const RISK_MODEL = {
  label: "Demonstration Decision-Support Model",
  factors: [
    {key:"species", label:"Species", weight:12, options:[
      {value:"elephant", label:"Elephant", f:1.0, note:"Elephant — frequent crop-raiding and settlement encounters"},
      {value:"leopard", label:"Leopard", f:0.85, note:"Leopard — high-risk predator near habitation"},
      {value:"tiger", label:"Tiger", f:0.75, note:"Tiger — large predator, usually forest interior"},
      {value:"boar", label:"Wild boar", f:0.7, note:"Wild boar — recurrent crop damage"},
    ]},
    {key:"villageDist", label:"Distance from village", weight:20, options:[
      {value:"lt500", label:"< 500 m", f:1.0, note:"Very close to settlement (< 500 m)"},
      {value:"500_1k", label:"500 m – 1 km", f:0.8, note:"Within 1 km of a settlement"},
      {value:"1_3k", label:"1 – 3 km", f:0.45, note:"Within 3 km of a settlement"},
      {value:"3_5k", label:"3 – 5 km", f:0.15, note:"3–5 km buffer from settlement"},
      {value:"gt5k", label:"> 5 km", f:0.0, note:"Deep forest range (> 5 km from settlement)"},
    ]},
    {key:"boundaryDist", label:"Distance from forest boundary", weight:10, options:[
      {value:"inside", label:"Inside forest", f:0.1, note:"Within core forest habitat"},
      {value:"near", label:"Near boundary (< 1 km)", f:0.6, note:"Close to forest boundary"},
      {value:"out1_2", label:"1–2 km outside forest", f:0.9, note:"Outside forest cover, 1–2 km from boundary"},
      {value:"out2", label:"> 2 km outside forest", f:1.0, note:"Deep inside human-use landscape"},
    ]},
    {key:"speed", label:"Movement speed", weight:8, options:[
      {value:"stationary", label:"Stationary", f:0.2, note:"Stationary / resting"},
      {value:"slow", label:"Slow (< 0.5 km/h)", f:0.4, note:"Slow movement through buffer zone"},
      {value:"moderate", label:"Moderate (0.5–2 km/h)", f:0.7, note:"Sustained movement toward human-use area"},
      {value:"fast", label:"Fast (> 2 km/h)", f:1.0, note:"Rapid displacement — erratic movement"},
    ]},
    {key:"timeOfDay", label:"Time of day", weight:10, options:[
      {value:"day", label:"Daytime", f:0.25, note:"Daytime activity"},
      {value:"dawnDusk", label:"Dawn / dusk", f:0.65, note:"Crepuscular activity window"},
      {value:"night", label:"Night", f:1.0, note:"Night-time movement"},
    ]},
    {key:"season", label:"Season", weight:7, options:[
      {value:"monsoon", label:"Monsoon", f:0.55, note:"Monsoon — dispersal along flooded corridors"},
      {value:"postmonsoon", label:"Post-monsoon (harvest)", f:1.0, note:"Harvest season — peak crop-raiding period"},
      {value:"winter", label:"Winter", f:0.35, note:"Winter — reduced conflict reports"},
      {value:"summer", label:"Summer", f:0.5, note:"Water scarcity drives movement to village water points"},
    ]},
    {key:"conflictFreq", label:"Previous conflict frequency", weight:13, options:[
      {value:"none", label:"No recorded conflicts", f:0.0, note:"No historical conflicts recorded"},
      {value:"low", label:"Low (1–2 per year)", f:0.35, note:"Low historical conflict frequency"},
      {value:"moderate", label:"Moderate (3–5 per year)", f:0.7, note:"Elevated historical conflict frequency"},
      {value:"high", label:"High (> 5 per year)", f:1.0, note:"High historical conflict frequency"},
    ]},
    {key:"agriDist", label:"Proximity to agricultural land", weight:8, options:[
      {value:"on", label:"On farmland", f:1.0, note:"Animal on agricultural land"},
      {value:"lt500", label:"< 500 m", f:0.75, note:"Adjacent to cropland"},
      {value:"500_1k", label:"500 m – 1 km", f:0.4, note:"Within 1 km of cropland"},
      {value:"gt1k", label:"> 1 km", f:0.1, note:"Away from agricultural land"},
    ]},
    {key:"sightings", label:"Recent sightings", weight:12, options:[
      {value:"none", label:"None this week", f:0.0, note:"No repeat presence this week"},
      {value:"1_2", label:"1–2 this week", f:0.4, note:"Repeat sightings this week"},
      {value:"3plus", label:"3+ this week", f:0.75, note:"Frequent sightings — established presence"},
      {value:"daily", label:"Daily sightings", f:1.0, note:"Daily sightings near settlement"},
    ]},
  ],
  levels: [
    {min:65, key:"high", label:"HIGH", response:"Flag for forest-authority verification and preventive response. Dispatch a field team and alert nearby settlements through community warning channels."},
    {min:35, key:"mod", label:"MODERATE", response:"Increase monitoring frequency and deploy an observation patrol. Verify the animal's movement corridor over the next 24 hours before any escalation."},
    {min:0, key:"low", label:"LOW", response:"Log the sighting and continue routine monitoring. No immediate action required."}
  ]
};
const ASSESS_DISCLAIMER = "This prototype demonstrates the intended decision-support workflow. It does not represent a validated ML model or real-time prediction system.";
const assessDefaults = {
  species:"elephant", villageDist:"lt500", boundaryDist:"near", speed:"moderate",
  timeOfDay:"night", season:"postmonsoon", conflictFreq:"high", agriDist:"on", sightings:"3plus"
};
const ARC_LEN = Math.PI * 42; // gauge arc length for r=42

function assessRisk(v){
  let score = 0;
  const contributions = [];
  RISK_MODEL.factors.forEach(f=>{
    const opt = f.options.find(o=>o.value===v[f.key]) || f.options[0];
    const points = Math.round(f.weight*opt.f*10)/10;
    score += points;
    contributions.push({label:f.label, weight:f.weight, points, fraction:opt.f,
      note:opt.note || `${f.label}: ${opt.label}`});
  });
  score = Math.round(score);
  const level = RISK_MODEL.levels.find(l=>score>=l.min);
  return {score, level, contributions};
}

function buildAssessForm(){
  const form = document.getElementById("assess-form");
  RISK_MODEL.factors.forEach(f=>{
    const wrap = document.createElement("label");
    wrap.className = "assess-field";
    wrap.innerHTML = `<span>${f.label} <em class="w" title="factor weight in the demo scoring model">w ${f.weight}</em></span>`;
    const sel = document.createElement("select");
    sel.className = "select assess-input";
    sel.id = "in-"+f.key;
    sel.setAttribute("aria-label", f.label);
    f.options.forEach(o=>{
      const opt = document.createElement("option");
      opt.value = o.value; opt.textContent = o.label;
      sel.appendChild(opt);
    });
    sel.value = assessDefaults[f.key];
    sel.addEventListener("change", renderAssessment);
    wrap.appendChild(sel);
    form.appendChild(wrap);
  });
  // prefill options from collared animals
  const pf = document.getElementById("in-prefill");
  collared.forEach(a=>{
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.id} — ${speciesFull[a.species]} (${riskLabel[a.risk]} risk demo)`;
    pf.appendChild(opt);
  });
  pf.addEventListener("change", ()=>{
    const a = collared.find(x=>x.id===pf.value);
    if(!a) return;
    prefillFromAnimal(a);
    renderAssessment();
    showToast(`Scenario prefilled from ${a.id} (simulated animal)`);
  });
}

function setAssess(key, value){
  const sel = document.getElementById("in-"+key);
  if(sel) sel.value = value;
}
function prefillFromAnimal(a){
  setAssess("species", a.species);
  const d = a.distM;
  setAssess("villageDist", d<500?"lt500":d<1000?"500_1k":d<3000?"1_3k":d<5000?"3_5k":"gt5k");
  setAssess("boundaryDist", a.zone==="fb" ? "near" : (zones[a.zone].village ? "out2" : "out1_2"));
  setAssess("speed", a.movement.startsWith("Resting") ? "stationary"
    : a.movement.startsWith("Moving") ? "moderate" : "slow");
  const h = new Date().getHours();
  setAssess("timeOfDay", (h>=5&&h<7)||(h>=17&&h<19) ? "dawnDusk" : (h>=7&&h<17) ? "day" : "night");
  const m = new Date().getMonth();
  setAssess("season", m>=5&&m<=8 ? "monsoon" : (m===9||m===10) ? "postmonsoon" : (m===11||m<=1) ? "winter" : "summer");
  const zoneAlerts = alertData.filter(x=>x.zone===a.zone).length;
  setAssess("conflictFreq", zoneAlerts===0?"none":zoneAlerts<=2?"low":zoneAlerts<=5?"moderate":"high");
  setAssess("agriDist", (a.zone==="s1"||a.zone==="s3") ? "on" : a.zone==="fb" ? "gt1k" : "lt500");
  const seen = alertData.filter(x=>x.animalRef===a.id).length;
  setAssess("sightings", seen===0?"none":seen<=2?"1_2":"3plus");
}

function gaugeMarkup(score, levelKey){
  const seg = (from,to)=>`stroke-dasharray="${((to-from)/100*ARC_LEN).toFixed(1)} 999" stroke-dashoffset="${(-(from/100*ARC_LEN)).toFixed(1)}"`;
  const d = "M8 50 A42 42 0 0 1 92 50";
  return `<svg class="gauge" viewBox="0 0 100 62" role="img" aria-hidden="true">
    <path class="g-track" d="${d}"></path>
    <path class="g-zone" d="${d}" stroke="var(--low)" ${seg(0,35)}></path>
    <path class="g-zone" d="${d}" stroke="var(--mod)" ${seg(35,65)}></path>
    <path class="g-zone" d="${d}" stroke="var(--high)" ${seg(65,100)}></path>
    <path class="g-prog" d="${d}" stroke="${riskColor(levelKey)}" stroke-dasharray="${(score/100*ARC_LEN).toFixed(1)} 999"></path>
    <text x="8" y="60" font-size="4.6" fill="var(--ink-faint)" text-anchor="middle" font-family="Inter,sans-serif">0</text>
    <text x="92" y="60" font-size="4.6" fill="var(--ink-faint)" text-anchor="middle" font-family="Inter,sans-serif">100</text>
    <text x="50" y="30" font-size="9.5" font-weight="600" fill="var(--ink)" text-anchor="middle" font-family="Fraunces,serif">${score}</text>
    <text x="50" y="37" font-size="3.4" fill="var(--ink-faint)" text-anchor="middle" font-family="Inter,sans-serif">RISK SCORE</text>
  </svg>`;
}

function renderAssessment(){
  const host = document.getElementById("assess-result");
  const v = {};
  RISK_MODEL.factors.forEach(f=>{
    const sel = document.getElementById("in-"+f.key);
    v[f.key] = sel ? sel.value : assessDefaults[f.key];
  });
  const {score, level, contributions} = assessRisk(v);
  const drivers = contributions.filter(c=>c.fraction>=0.5).sort((a,b)=>b.points-a.points);
  const driverList = drivers.length
    ? drivers.map(c=>`<li>${c.note} <span class="dim">+${c.points} pts</span></li>`).join("")
    : `<li>No factor above the contribution threshold — low-risk profile</li>`;
  const contribRows = [...contributions].sort((a,b)=>b.points-a.points).map(c=>{
    const cls = c.fraction>=0.7 ? "hi" : c.fraction>=0.4 ? "md" : "lo";
    return `<div class="contrib-row">
      <span class="cl">${c.label} <span class="dim">(w ${c.weight})</span></span>
      <span class="contrib-bar"><span class="contrib-fill ${cls}" style="width:${(c.points/RISK_MODEL.factors.reduce((s,f)=>Math.max(s,f.weight),0)*100).toFixed(0)}%"></span></span>
      <span class="contrib-pts">+${c.points}</span>
    </div>`;
  }).join("");
  host.innerHTML = `
    <div class="assess-top" style="--rc:${riskColor(level.key)}">
      ${gaugeMarkup(score, level.key)}
      <div class="assess-score">
        <div class="score-line"><span class="score-n">${score}</span><span class="score-max">/100</span></div>
        <span class="tag ${level.key}">${level.label}</span>
        <div class="score-cap">${RISK_MODEL.label}</div>
      </div>
    </div>
    <div class="rep-sec">Contributing factors</div>
    <ul class="factor-list">${driverList}</ul>
    <div class="rep-sec">How each factor contributes</div>
    <div class="contrib-chart">${contribRows}
      <div class="contrib-total"><span>Sum of weighted contributions</span><b>${score} / 100</b></div>
    </div>
    <div class="rep-sec">Recommended response</div>
    <div class="assess-response">${level.response}</div>
    <div class="rep-note">${ASSESS_DISCLAIMER}</div>`;

  // entrance animation: gauge sweeps, score counts up, bars grow in
  if(!reducedMotion.matches){
    const prog = host.querySelector(".g-prog");
    const finalDash = prog.getAttribute("stroke-dasharray");
    prog.style.transition = "none";
    prog.setAttribute("stroke-dasharray", "0 999");
    requestAnimationFrame(()=> requestAnimationFrame(()=>{
      prog.style.transition = "stroke-dasharray .9s var(--ease)";
      prog.setAttribute("stroke-dasharray", finalDash);
    }));
    countUp(host.querySelector(".score-n"), score, 850);
    host.querySelectorAll(".contrib-fill").forEach((b,i)=>{
      const w = b.style.width;
      b.style.transition = "none";
      b.style.width = "0%";
      requestAnimationFrame(()=> requestAnimationFrame(()=>{
        b.style.transition = `width .55s var(--ease) ${i*45}ms`;
        b.style.width = w;
      }));
    });
  }
}

function assessmentText(){
  const v = {};
  RISK_MODEL.factors.forEach(f=>{
    const sel = document.getElementById("in-"+f.key);
    v[f.key] = sel ? sel.value : assessDefaults[f.key];
  });
  const {score, level, contributions} = assessRisk(v);
  const lines = [];
  lines.push("HWCM MONITOR — RISK ASSESSMENT (DEMO)");
  lines.push("Demonstration Decision-Support Model — rule-based");
  lines.push("=".repeat(48));
  lines.push("");
  lines.push("SCENARIO INPUTS");
  RISK_MODEL.factors.forEach(f=>{
    const opt = f.options.find(o=>o.value===v[f.key]) || f.options[0];
    lines.push(`  ${f.label}: ${opt.label}  (weight ${f.weight}, contribution +${Math.round(f.weight*opt.f*10)/10})`);
  });
  lines.push("");
  lines.push(`RISK SCORE: ${score}/100 — ${level.label}`);
  lines.push("");
  lines.push("CONTRIBUTING FACTORS");
  contributions.filter(c=>c.fraction>=0.5).sort((a,b)=>b.points-a.points)
    .forEach(c=> lines.push(`  · ${c.note} (+${c.points} pts)`));
  lines.push("");
  lines.push("RECOMMENDED RESPONSE");
  lines.push(`  ${level.response}`);
  lines.push("");
  lines.push("-".repeat(48));
  lines.push(ASSESS_DISCLAIMER);
  return lines.join("\n");
}
document.getElementById("assess-download").addEventListener("click", ()=>{
  const blob = new Blob([assessmentText()], {type:"text/plain"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hwcm-risk-assessment.txt";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Risk assessment downloaded (.txt)");
});

/* ---------- assessment history (persisted) ---------- */
let assessHistory = [];
try{
  const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
  if(Array.isArray(saved)) assessHistory = saved.slice(0,12);
}catch(e){}
function saveAssessHistory(){
  try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(assessHistory.slice(0,12))); }
  catch(e){ storageWarning(); }
}
function currentAssessInputs(){
  const v = {};
  RISK_MODEL.factors.forEach(f=>{
    const sel = document.getElementById("in-"+f.key);
    v[f.key] = sel ? sel.value : assessDefaults[f.key];
  });
  return v;
}
function saveAssessmentToHistory(){
  const v = currentAssessInputs();
  const {score, level} = assessRisk(v);
  assessHistory.unshift({id:"H-"+Date.now().toString(36), ts:Date.now(), inputs:v, score, levelKey:level.key});
  assessHistory = assessHistory.slice(0,12);
  saveAssessHistory();
  renderAssessHistory();
  showToast(`Assessment saved to history (${score}/100 ${level.label})`);
}
function renderAssessHistory(){
  const host = document.getElementById("assess-history");
  if(!host) return;
  if(!assessHistory.length){
    host.innerHTML = `<div class="assess-hist-empty">No saved assessments yet — adjust the scenario above and save it.</div>`;
    return;
  }
  host.innerHTML = assessHistory.map(h=>{
    const d = new Date(h.ts);
    return `<div class="hist-row">
      <span class="hist-score ${h.levelKey}">${h.score}</span>
      <span class="hist-info"><b>${h.levelKey.toUpperCase()}</b> · ${fmtTime(d)} · ${timeAgo(d)}</span>
      <span class="hist-actions">
        <button type="button" class="icon-btn btn-xs" data-hload="${h.id}" aria-label="Load saved assessment">↥</button>
        <button type="button" class="icon-btn btn-xs" data-hdel="${h.id}" aria-label="Delete saved assessment">✕</button>
      </span>
    </div>`;
  }).join("");
  host.querySelectorAll("[data-hload]").forEach(b=>b.addEventListener("click", ()=>{
    const h = assessHistory.find(x=>x.id===b.dataset.hload);
    if(!h) return;
    Object.entries(h.inputs).forEach(([k,val])=> setAssess(k,val));
    renderAssessment();
    showToast("Saved assessment loaded into the scenario");
  }));
  host.querySelectorAll("[data-hdel]").forEach(b=>b.addEventListener("click", ()=>{
    assessHistory = assessHistory.filter(x=>x.id!==b.dataset.hdel);
    saveAssessHistory();
    renderAssessHistory();
    showToast("Saved assessment deleted");
  }));
}
document.getElementById("assess-save").addEventListener("click", saveAssessmentToHistory);

/* ---------- init ---------- */
(function init(){
  const c = counts();
  document.getElementById("s-total").dataset.count = animals.length;
  document.getElementById("s-high").dataset.count = c.high;
  document.getElementById("s-mod").dataset.count = c.mod;
  document.getElementById("s-low").dataset.count = c.low;
  document.querySelectorAll(".stat .n[data-count]").forEach((el,idx)=>
    countUp(el, Number(el.dataset.count), 850 + idx*120));

  const zs = document.getElementById("zone-select");
  Object.entries(zones).forEach(([k,z])=>{
    const opt = document.createElement("option");
    opt.value = k; opt.textContent = z.name;
    zs.appendChild(opt);
  });

  // restore persisted user filters / layers before first render
  loadFilters();
  document.getElementById("alert-search").value = alertState.search;
  zs.value = alertState.zone;
  applyLayers();
  const ao = document.getElementById("active-only");
  ao.classList.toggle("on", mapActiveOnly);
  ao.setAttribute("aria-pressed", String(mapActiveOnly));
  syncReportChips();

  initMapScene(mapPreview, "prev");
  initMapScene(mapFull, "full");
  renderMap(mapPreview, false);
  renderMap(mapFull, true);

  renderAlertsPreview();
  renderAlertTable();
  syncFilterChips();
  syncSortIndicators();
  renderHotspots();
  renderReports();
  renderSettings();
  renderTrend();
  renderDonut();
  buildAssessForm();
  renderAssessment();
  renderAssessHistory();
})();
