
/******** CONFIG ********/
const SHEET_ID = "YOUR_SHEET_ID";   // e.g. 1AbCdEFG... from the sheet URL
const GID = "0";                    // worksheet gid (tab id)
const TIMEZONE = "America/Chicago"; // Irving CST
const DEFAULT_ORIGIN = "TLAG Church, Irving, TX"; // optional; else first stop

const REFRESH_MINUTES = 3;
const STATUS_KEY = "tlag_carols_status_2025"; // localStorage key

/******** UTILITIES ********/
const $ = sel => document.querySelector(sel);
const cardsEl = $("#cards");

function gvizUrl(dateStr){
  const tq = encodeURIComponent(`select * where A='${dateStr}'`);
  // GViz: returns JSON (wrapped); supports filters without API key for public sheets.  [2](https://stackoverflow.com/questions/70902197/accessing-a-public-google-sheets-data-directly-from-client-side-javascript)
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}&tq=${tq}`;
}
function parseGviz(text){
  const json = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}")+1));
  const cols = json.table.cols.map(c => c.label || c.id);
  return json.table.rows.map(r => {
    const o = {};
    r.c.forEach((cell, i) => o[cols[i]] = cell ? (cell.f ?? cell.v ?? "") : "");
    return o;
  });
}

function getStatusMap(){
  try { return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}"); }
  catch { return {}; }
}
function setStatus(dateStr, sno, status){
  const map = getStatusMap();
  map[dateStr] = map[dateStr] || {};
  map[dateStr][sno] = status; // "completed" | "upcoming" | "skipped" | null
  localStorage.setItem(STATUS_KEY, JSON.stringify(map));
}
function getStatus(dateStr, sno){
  const map = getStatusMap();
  return map[dateStr]?.[sno] || null;
}

function parseTimeRange(rangeStr, dateStr){
  const parts = (rangeStr||"").replace(/\s+/g," ").trim().split("-");
  if(parts.length!==2) return null;
  const rightHasAMPM = /am|pm/i.test(parts[1]);
  const left = parts[0].trim() + (rightHasAMPM ? "" : " " + (parts[1].match(/am|pm/i)?.[0]||""));
  const right = parts[1].trim();
  const start = new Date(`${dateStr} ${left}`);
  const end = new Date(`${dateStr} ${right}`);
  return { start, end };
}

function fmtTime(d){ return d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:TIMEZONE}); }

/******** RENDER ********/
async function loadDate(dateStr){
  try{
    const res = await fetch(gvizUrl(dateStr));
    const txt = await res.text();
    const rows = parseGviz(txt); // [{Date,S.No,FamilyName,Address,TimeSlot,BibleVerse,GMapLink,Lat,Lng}...]

    renderCards(rows, dateStr);
    renderSummary(rows, dateStr);
    attachRoute(rows);
  }catch(e){
    console.error(e);
    cardsEl.innerHTML = `<div class="card">Failed to load data. Check Sheet ID / permissions.</div>`;
  }
}

function renderCards(items, dateStr){
  cardsEl.innerHTML = "";
  items.forEach((it, idx) => {
    const sno = it["S.No"] || (idx+1);
    const family = it["FamilyName"] || "";
    const address = it["Address"] || "";
    const slot = it["TimeSlot"] || "";
    const verse = it["BibleVerse"] || "";
    const link = it["GMapLink"] || "#";

    const pill = document.createElement("span");
    pill.className = "pill";
    setPill(pill, getStatus(dateStr, sno));

    const card = document.createElement("article");
    card.className = "card";
    card.dataset.sno = sno;

    card.innerHTML = `
      <div class="row1">
        <div class="title">${sno}. ${family}</div>
        <div class="pill-wrap"></div>
      </div>
      <div class="meta">
        <div><strong>Address:</strong> ${address}</div>
        <div><strong>Time:</strong> ${slot}</div>
        <div><strong>Bible Verse:</strong> ${verse}</div>
      </div>
      <a class="map" href="${link}" target="_blank" rel=""actions">
        <button class="btn done" data-status="completed">Mark Completed</button>
        <button class="btn upc" data-status="upcoming">Mark Upcoming</button>
        <button class="btn skip" data-status="skipped">Skip</button>
        <button class="btn" data-status="">Clear</button>
      </div>
    `;
    card.querySelector(".pill-wrap").appendChild(pill);

    card.querySelectorAll(".actions .btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const status = btn.getAttribute("data-status") || null;
        setStatus(dateStr, sno, status);
        setPill(pill, status);
      });
    });

    cardsEl.appendChild(card);
  });
}

function setPill(el, status){
  el.textContent = "";
  el.className = "pill";
  if(status==="completed"){ el.classList.add("completed"); el.textContent="COMPLETED"; }
  else if(status==="upcoming"){ el.classList.add("upcoming"); el.textContent="UPCOMING"; }
  else if(status==="skipped"){ el.classList.add("skipped"); el.textContent="SKIPPED"; }
}

function renderSummary(items, dateStr){
  const now = new Date().toLocaleString("en-US",{timeZone:TIMEZONE});
  const nowDate = new Date(now);
  let currentIdx=-1, nextIdx=-1;

  items.forEach((it, idx)=>{
    const rng = parseTimeRange(it["TimeSlot"], dateStr);
    if(!rng) return;
    if(nowDate>=rng.start && nowDate<=rng.end) currentIdx = idx;
    else if(nowDate<rng.start && nextIdx===-1) nextIdx = idx;
  });

  $("#nowFamily").textContent = currentIdx>=0 ? items[currentIdx]["FamilyName"] : "—";
  $("#nextFamily").textContent = nextIdx>=0 ? items[nextIdx]["FamilyName"] : "—";
}

function attachRoute(items){
  $("#routeBtn").onclick = () => {
    // Google Maps URLs: https://www.google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=a|b|c&travelmode=driving
    // This universal URL opens Maps on any device, no API key needed. [1](https://developers.google.com/maps/documentation/urls/get-started)
    const addresses = items.map(it => (it["Address"]||"").trim()).filter(Boolean);
    if(addresses.length < 2){
      alert("Need at least 2 addresses to build a route."); return;
    }
    const origin = encodeURIComponent(DEFAULT_ORIGIN || addresses[0]);
    const destination = encodeURIComponent(addresses[addresses.length-1]);
    const waypoints = addresses.slice(DEFAULT_ORIGIN ? 0 : 1, addresses.length-1)
      .map(encodeURIComponent).join("|");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`
              + (waypoints ? `&waypoints=${waypoints}` : "")
              + `&travelmode=driving`;
    window.open(url, "_blank");
  };
}

/******** INIT ********/
function tick(){ $("#clock").textContent = new Date().toLocaleString("en-US",{timeZone:TIMEZONE}); }
tick(); setInterval(tick,1000);

const dateSelect = $("#dateSelect");
dateSelect.addEventListener("change", ()=> loadDate(dateSelect.value));
loadDate(dateSelect.value);
setInterval(()=> loadDate(dateSelect.value), REFRESH_MINUTES*60*1000);
