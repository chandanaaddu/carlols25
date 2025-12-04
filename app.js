
/* ===== CONFIG ===== */
const TIMEZONE = "America/Chicago";                // Irving CST
const SHEET_ID = "YOUR_SHEET_ID";                  // <-- paste your sheet id
const GID = "0";                                   // <-- worksheet gid (tab id)
const DEFAULT_ORIGIN = "TLAG Church, Irving, TX";  // start of route (or leave empty for first stop)
const STATUS_KEY = "tlag_levels_status_2025";      // localStorage key per device

/* ===== UTILITIES ===== */
const $ = sel => document.querySelector(sel);
function tick(){ $("#clock").textContent = new Date().toLocaleString("en-US",{timeZone:TIMEZONE}); }
function gvizUrl(dateStr){
  const tq = encodeURIComponent(`select * where A='${dateStr}'`);
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}&tq=${tq}`;
}
function parseGviz(txt){
  // GViz returns JSON wrapped in JSONP; strip wrapper and parse.  (Examples & background) [5](https://stackoverflow.com/questions/29202686/google-visualization-api-gviz-query-and-fetching-data-from-a-spreadsheet)
  const json = JSON.parse(txt.substring(txt.indexOf("{"), txt.lastIndexOf("}")+1));
  const cols = json.table.cols.map(c => c.label || c.id);
  return json.table.rows.map(r=>{
    const o={}; r.c.forEach((cell,i)=>o[cols[i]] = cell ? (cell.f ?? cell.v ?? "") : ""); return o;
  });
}
function parseTimeRange(rangeStr,dateStr){
  const parts = (rangeStr||"").replace(/\s+/g," ").trim().split("-");
  if(parts.length!==2) return null;
  const rightHas = /am|pm/i.test(parts[1]);
  const left = parts[0].trim() + (rightHas ? "" : " " + (parts[1].match(/am|pm/i)?.[0]||""));
  const right = parts[1].trim();
  const start = new Date(`${dateStr} ${left}`);
  const end   = new Date(`${dateStr} ${right}`);
  return {start,end};
}
function statusMap(){ try{ return JSON.parse(localStorage.getItem(STATUS_KEY)||"{}"); }catch{ return {}; } }
function setStatus(date,sno,val){ const m=statusMap(); (m[date]??={})[sno]=val; localStorage.setItem(STATUS_KEY,JSON.stringify(m)); }
function getStatus(date,sno){ return statusMap()[date]?.[sno] || null; }

/* ===== RENDER ===== */
function setBadge(el,status){
  el.textContent=""; el.className="badge";
  if(status==="completed"){ el.classList.add("completed"); el.textContent="COMPLETED"; }
  else if(status==="upcoming"){ el.classList.add("upcoming"); el.textContent="UPCOMING"; }
  else if(status==="skipped"){ el.classList.add("skipped"); el.textContent="SKIPPED"; }
}
function renderGrid(items,dateStr){
  const grid = $("#grid"); grid.innerHTML = "";
  items.forEach((it,idx)=>{
    const sno = it["S.No"] || (idx+1);
    const level = document.createElement("article"); level.className="level"; level.dataset.sno=sno;

    const badge = document.createElement("div"); badge.className="badge";
    setBadge(badge, getStatus(dateStr, sno));

    level.innerHTML = `
      <div class="num">#${sno}</div>
      <div class="family">${it["FamilyName"]||""}</div>
      <div class="time">${it["TimeSlot"]||""}</div>
      <div class="verse">📖 ${it["BibleVerse"]||""}</div>
      <a class="maplink" href="${it["G      <div class="actions">
        <button class="btn done">Completed</button>
        <button class="btn upc">Upcoming</button>
        <button class="btn skip">Skip</button>
        <button class="btn">Clear</button>
      </div>`;
    level.appendChild(badge);

    level.querySelector(".done").onclick = ()=>{ setStatus(dateStr,sno,"completed"); setBadge(badge,"completed"); updateProgress(items,dateStr); };
    level.querySelector(".upc").onclick  = ()=>{ setStatus(dateStr,sno,"upcoming");  setBadge(badge,"upcoming");  updateProgress(items,dateStr); };
    level.querySelector(".skip").onclick = ()=>{ setStatus(dateStr,sno,"skipped");   setBadge(badge,"skipped");   updateProgress(items,dateStr); };
    level.querySelector(".actions .btn:last-child").onclick = ()=>{ setStatus(dateStr,sno,null); setBadge(badge,null); updateProgress(items,dateStr); };

    grid.appendChild(level);
  });
  updateProgress(items,dateStr);
}
function updateProgress(items,dateStr){
  const total = items.length;
  const done  = items.filter((it,idx)=> (getStatus(dateStr, it["S.No"] || (idx+1)))==="completed").length;
  $("#progressText").textContent = `${done}/${total}`;
  $("#progressFill").style.width = total ? `${Math.round((done/total)*100)}%` : "0%";
}
function renderSummary(items,dateStr){
  const nowDate = new Date(new Date().toLocaleString("en-US",{timeZone:TIMEZONE}));
  let curr=-1,next=-1;
  items.forEach((it,idx)=>{
    const rng = parseTimeRange(it["TimeSlot"],dateStr);
    if(!rng) return;
    if(nowDate>=rng.start && nowDate<=rng.end) curr=idx;
    else if(nowDate<rng.start && next===-1) next=idx;
  });
  $("#nowFamily").textContent  = curr>=0 ? items[curr]["FamilyName"] : "—";
  $("#nextFamily").textContent = next>=0 ? items[next]["FamilyName"] : "—";
}

/* ===== ROUTE ===== */
function attachRoute(items){
  $("#routeBtn").onclick = ()=>{
    // Google Maps URLs (directions with waypoints). No key required. [4](https://developers.google.com/maps/documentation/urls/get-started)
    const addrs = items.map(it => (it["Address"]||"").trim()).filter(Boolean);
    if(addrs.length<2){ alert("Need at least 2 addresses to build a route."); return; }
    const origin = encodeURIComponent(DEFAULT_ORIGIN || addrs[0]);
    const dest   = encodeURIComponent(addrs[addrs.length-1]);
    const way    = addrs.slice(DEFAULT_ORIGIN?0:1, addrs.length-1).map(encodeURIComponent).join("|");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`
               + (way?`&waypoints=${way}`:"") + `&travelmode=driving`;
    window.open(url, "_blank");
  };
}

/* ===== LOAD ===== */
async function load(dateStr){
  tick();
  try{
    const res = await fetch(gvizUrl(dateStr));
    const txt = await res.text();
    const rows = parseGviz(txt);
    if(!rows.length) throw new Error("No rows. Check Date formatting in column A or sharing.");
    renderGrid(rows,dateStr); renderSummary(rows,dateStr); attachRoute(rows);
  }catch(err){
    console.warn("GViz failed, showing sample grid:", err);
    const sample = [
      {Date:dateStr,"S.No":1,FamilyName:"Jasper Uncle", Address:"1750 FM423, Frisco, TX 75033", TimeSlot:"6:00 - 6:20 PM", BibleVerse:"Isaiah 9:6", GMapLink:"https://maps.app.goo.gl/X"},
      {Date:dateStr,"S.No":2,FamilyName:"Vinod", Address:"1690 FM 423, #2209 Frisco, TX 75033", TimeSlot:"6:30 - 6:50 PM", BibleVerse:"Luke 2:10–11", GMapLink:"https://maps.app.goo.gl/Y"},
      {Date:dateStr,"S.No":3,FamilyName:"Suresh", Address:"1690 FM 423 #2203, Frisco, TX 75033", TimeSlot:"7:00 - 7:20 PM", BibleVerse:"John 1:14", GMapLink:"https://maps.app.goo.gl/Z"}
    ];
    renderGrid(sample,dateStr); renderSummary(sample,dateStr); attachRoute(sample);
    // To make live data work: set Sheet sharing to “Anyone with the link – Viewer” (or Publish to web). [3](https://stackoverflow.com/questions/70902197/accessing-a-public-google-sheets-data-directly-from-client-side-javascript)
  }
}

/* ===== INIT ===== */
const dateSelect = $("#dateSelect");
dateSelect.addEventListener("change", ()=> load(dateSelect.value));
tick(); setInterval(tick,1000);
load(dateSelect.value);
