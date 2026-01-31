const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** 切割模板（目標大圖） */
const GRID_SPECS = {
  "5x4": { w: 2560, h: 1664, rows: 4, cols: 5, count: 20 },
  "3x3": { w: 1536, h: 1536, rows: 3, cols: 3, count: 9  },
};

/** 固定輸出：一般貼圖 */
const STICKER_MAX_W = 370;
const STICKER_MAX_H = 320;
const MAIN_SIZE = 240;       // main.png 240x240
const TAB_W = 96;            // tab.png 96x74
const TAB_H = 74;

const STATE = {
  grid: "5x4",
  tol: 24,        // 白底去背容差（進階）
  outType: "sticker",

  img: null,
  imgName: "",
  imgW: 0,
  imgH: 0,

  // transform controls
  xPct: 0,    // -100..100
  yPct: 0,    // -100..100
  sPct: 100,  // 50..150
};

let slicedCells = [];  // { index, canvasRaw }
let processed = [];    // { index, canvasOut }
let mainIndex = 0;
let tabIndex = 0;

/* ---------- utils ---------- */
function even(n){ return (n % 2 === 0) ? n : (n - 1); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function parseIntSafe(v, fallback){
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** 等比 contain：回傳放置資訊 */
function fitContain(srcW, srcH, dstW, dstH){
  const s = Math.min(dstW/srcW, dstH/srcH);
  const w = srcW*s, h = srcH*s;
  const x = (dstW - w)/2, y = (dstH - h)/2;
  return { s, x, y, w, h };
}

/* ---------- overlay grid (preview only) ---------- */
function drawOverlayGrid(ctx, w, h, rows, cols){
  ctx.clearRect(0,0,w,h);

  ctx.strokeStyle = "rgba(34,197,94,.55)";
  ctx.lineWidth = 2;

  for(let c=1;c<cols;c++){
    const x = (w/cols)*c;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for(let r=1;r<rows;r++){
    const y = (h/rows)*r;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/* ---------- PREVIEW: resize canvas to container (no stretch) ---------- */
function drawPreview() {
  const spec = GRID_SPECS[STATE.grid];

  const c = document.getElementById("cPreview");
  const o = document.getElementById("cOverlay");
  if (!c || !o) return;

  const ctx = c.getContext("2d");
  const ox  = o.getContext("2d");

  const stack = document.getElementById("previewStack");
  if (!stack) return;

  // container aspect follows selected grid
  stack.style.aspectRatio = `${spec.w} / ${spec.h}`;

  // canvas pixel size = container size (avoid CSS stretch + cropping)
  const dpr = window.devicePixelRatio || 1;
  const rect = stack.getBoundingClientRect();
  const pw = Math.max(1, Math.round(rect.width));
  const ph = Math.max(1, Math.round(rect.height));

  c.width  = Math.round(pw * dpr);
  c.height = Math.round(ph * dpr);
  o.width  = Math.round(pw * dpr);
  o.height = Math.round(ph * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ox.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, pw, ph);
  ox.clearRect(0, 0, pw, ph);

  $("#gridHint").textContent = `切割：${spec.rows}×${spec.cols}（共${spec.count}張）｜目標大圖：${spec.w}×${spec.h}`;

  // No image yet → grid only
  if(!STATE.img){
    drawOverlayGrid(ox, pw, ph, spec.rows, spec.cols);
    return;
  }

  // Draw image into preview (contain + user transform)
  const baseScale = Math.min(pw / STATE.imgW, ph / STATE.imgH);
  const userScale = STATE.sPct / 100;
  const scale = baseScale * userScale;

  const drawW = STATE.imgW * scale;
  const drawH = STATE.imgH * scale;

  // translate range: 25% of preview size
  const dx = (STATE.xPct / 100) * (pw * 0.25);
  const dy = (STATE.yPct / 100) * (ph * 0.25);

  const x = (pw - drawW) / 2 + dx;
  const y = (ph - drawH) / 2 + dy;

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(STATE.img, x, y, drawW, drawH);

  // overlay grid
  drawOverlayGrid(ox, pw, ph, spec.rows, spec.cols);

  // info
  const imgInfo = $("#imgInfo");
  const cellInfo = $("#cellInfo");
  if (imgInfo) imgInfo.textContent = `${STATE.imgName}｜${STATE.imgW}×${STATE.imgH}`;
  if (cellInfo) cellInfo.textContent = `切割：${spec.rows}×${spec.cols}（${spec.count} 張）`;
}

/* ---------- slicing (uses same transform logic as preview but in target spec resolution) ---------- */
function sliceToCells(){
  const spec = GRID_SPECS[STATE.grid];
  const targetW = spec.w;
  const targetH = spec.h;

  // offscreen base canvas at target spec size
  const base = document.createElement("canvas");
  base.width = targetW;
  base.height = targetH;
  const bctx = base.getContext("2d");
  bctx.clearRect(0,0,targetW,targetH);

  // contain in target canvas + user transform
  const fit = fitContain(STATE.imgW, STATE.imgH, targetW, targetH);
  const userScale = STATE.sPct/100;
  const s = fit.s * userScale;

  const dx = (STATE.xPct/100) * (targetW * 0.25);
  const dy = (STATE.yPct/100) * (targetH * 0.25);

  const w = STATE.imgW * s;
  const h = STATE.imgH * s;
  const x = (targetW - w)/2 + dx;
  const y = (targetH - h)/2 + dy;

  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(STATE.img, x, y, w, h);

  // crop each cell
  const cellW = Math.floor(targetW / spec.cols);
  const cellH = Math.floor(targetH / spec.rows);

  const out = [];
  let idx = 0;
  for(let r=0;r<spec.rows;r++){
    for(let c=0;c<spec.cols;c++){
      const cell = document.createElement("canvas");
      cell.width = cellW;
      cell.height = cellH;
      const cx = cell.getContext("2d");
      cx.drawImage(base, c*cellW, r*cellH, cellW, cellH, 0, 0, cellW, cellH);
      out.push({ index: idx, canvasRaw: cell });
      idx++;
    }
  }

  slicedCells = out;
  processed = [];
  mainIndex = 0;
  tabIndex = 0;
  renderThumbs(false);
}

/* ---------- white background removal (fixed mode) ---------- */
function removeWhiteBg(canvas, tol){
  const T = clamp(tol, 0, 80);

  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;

  const ctx = c.getContext("2d");
  ctx.drawImage(canvas, 0, 0);

  const imgData = ctx.getImageData(0,0,c.width,c.height);
  const d = imgData.data;

  for(let i=0;i<d.length;i+=4){
    const r = d[i], g = d[i+1], b = d[i+2];

    // near white: high RGB OR low chroma + high brightness
    const max = Math.max(r,g,b);
    const min = Math.min(r,g,b);

    const nearWhite =
      (r > 255-T && g > 255-T && b > 255-T) ||
      (max > 245 && (max-min) < (T+10));

    if(nearWhite){
      d[i+3] = 0;
    }
  }

  ctx.putImageData(imgData,0,0);
  return c;
}

/* ---------- resize to LINE sticker max ---------- */
function resizeToMax(canvas, maxW, maxH){
  const w = canvas.width, h = canvas.height;
  const s = Math.min(maxW/w, maxH/h, 1);

  const nw = Math.max(2, even(Math.floor(w*s)));
  const nh = Math.max(2, even(Math.floor(h*s)));

  const out = document.createElement("canvas");
  out.width = nw;
  out.height = nh;

  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/* main/tab fixed canvas with contain placement */
function makeFixed(canvas, W, H){
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d");
  ctx.clearRect(0,0,W,H);

  const fit = fitContain(canvas.width, canvas.height, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, fit.x, fit.y, fit.w, fit.h);
  return out;
}

/* ---------- process pipeline: slice → white remove → resize ---------- */
function processAll(){
  if(!slicedCells.length) return;

  const tol = STATE.tol;

  processed = slicedCells.map(({index, canvasRaw})=>{
    const bgRemoved = removeWhiteBg(canvasRaw, tol);
    const resized = resizeToMax(bgRemoved, STICKER_MAX_W, STICKER_MAX_H);
    return { index, canvasOut: resized };
  });

  renderThumbs(true);
  $("#btnZip").disabled = false;
}

/* ---------- thumbs + main/tab select ---------- */
function renderThumbs(useProcessed=false){
  const grid = $("#thumbGrid");
  grid.innerHTML = "";

  const arr = useProcessed ? processed : slicedCells;
  if(!arr.length) return;

  arr.forEach((item, i)=>{
    const wrap = document.createElement("div");
    wrap.className = "thumb";

    const imgBox = document.createElement("div");
    imgBox.className = "img";

    const src = useProcessed ? item.canvasOut : item.canvasRaw;

    // draw into a canvas for display
    const cv = document.createElement("canvas");
    cv.width = src.width;
    cv.height = src.height;
    cv.getContext("2d").drawImage(src, 0, 0);
    imgBox.appendChild(cv);

    const meta = document.createElement("div");
    meta.className = "meta";

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = `${String(i+1).padStart(2,'0')}.png`;

    const picker = document.createElement("div");
    picker.className = "picker";

    const btnMain = document.createElement("button");
    btnMain.type = "button";
    btnMain.className = "btn tiny ghost" + (i===mainIndex ? " is-on" : "");
    btnMain.textContent = "Main";
    btnMain.addEventListener("click", ()=>{
      mainIndex = i;
      renderThumbs(useProcessed);
    });

    const btnTab = document.createElement("button");
    btnTab.type = "button";
    btnTab.className = "btn tiny ghost" + (i===tabIndex ? " is-on" : "");
    btnTab.textContent = "Tab";
    btnTab.addEventListener("click", ()=>{
      tabIndex = i;
      renderThumbs(useProcessed);
    });

    picker.appendChild(btnMain);
    picker.appendChild(btnTab);

    meta.appendChild(badge);
    meta.appendChild(picker);

    wrap.appendChild(imgBox);
    wrap.appendChild(meta);
    grid.appendChild(wrap);
  });
}

/* ---------- ZIP download ---------- */
function canvasToPngBlob(canvas){
  return new Promise((resolve)=>{
    canvas.toBlob((b)=>resolve(b), "image/png");
  });
}

async function downloadZip(){
  if(!processed.length){
    alert("請先執行「去背與輸出預覽」，再下載 ZIP。");
    return;
  }

  const start = parseIntSafe($("#startNo").value, 1);
  const zip = new JSZip();

  // numbered stickers
  for(let i=0;i<processed.length;i++){
    const num = start + i;
    const name = `${String(num).padStart(2,'0')}.png`;
    const blob = await canvasToPngBlob(processed[i].canvasOut);
    zip.file(name, blob);
  }

  // main/tab from selected indices
  const mainSrc = processed[mainIndex]?.canvasOut || processed[0].canvasOut;
  const tabSrc  = processed[tabIndex]?.canvasOut  || processed[0].canvasOut;

  const mainCanvas = makeFixed(mainSrc, MAIN_SIZE, MAIN_SIZE);
  const tabCanvas  = makeFixed(tabSrc, TAB_W, TAB_H);

  zip.file("main.png", await canvasToPngBlob(mainCanvas));
  zip.file("tab.png",  await canvasToPngBlob(tabCanvas));

  const readme =
`LINE Sticker Export (Standard)
- Stickers : PNG, max ${STICKER_MAX_W}x${STICKER_MAX_H}
- main.png : ${MAIN_SIZE}x${MAIN_SIZE}
- tab.png  : ${TAB_W}x${TAB_H}
Notes:
- Background removal is fixed to WHITE background.
- If LINE rejects due to file size (>1MB), reduce complexity or regenerate with cleaner white background.
`;
  zip.file("README.txt", readme);

  const blob = await zip.generateAsync({ type:"blob", compression:"DEFLATE", compressionOptions:{level:6} });
  saveAs(blob, `LINE_stickers_${STATE.grid}_standard.zip`);
}

/* ---------- events ---------- */
function bindUI(){
  $("#year").textContent = new Date().getFullYear();

  const btnPick = $("#btnPick2");
  const fileBig = $("#fileBig");
  const btnReset = $("#btnReset");
  const btnSlice = $("#btnSlice");
  const btnProcess = $("#btnProcess");
  const btnZip = $("#btnZip");

  const rx = $("#rx"), ry = $("#ry"), rs = $("#rs");
  const vx = $("#vx"), vy = $("#vy"), vs = $("#vs");
  const rt = $("#rt"), vt = $("#vt");

  // pick image
  btnPick.addEventListener("click", ()=> fileBig.click());
  fileBig.addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    await loadImageFile(file);
  });

  // grid select
  $("#gridSeg").addEventListener("click", (e)=>{
    const btn = e.target.closest(".segbtn");
    if(!btn) return;

    $("#gridSeg").querySelectorAll(".segbtn").forEach(b=>b.classList.remove("is-on"));
    btn.classList.add("is-on");

    STATE.grid = btn.dataset.grid;

    // reset results
    slicedCells = [];
    processed = [];
    $("#thumbGrid").innerHTML = "";
    btnProcess.disabled = true;
    btnZip.disabled = true;

    drawPreview();
  });

  // sliders X/Y/Scale (affect alignment)
  function syncTransform(){
    STATE.xPct = parseInt(rx.value,10);
    STATE.yPct = parseInt(ry.value,10);
    STATE.sPct = parseInt(rs.value,10);
    vx.textContent = `${STATE.xPct}%`;
    vy.textContent = `${STATE.yPct}%`;
    vs.textContent = `${STATE.sPct}%`;

    // changing alignment invalidates processed output
    processed = [];
    btnZip.disabled = true;
    btnProcess.disabled = !slicedCells.length;

    drawPreview();
  }
  [rx,ry,rs].forEach(el=>el.addEventListener("input", syncTransform));

  // tolerance (advanced)
  function syncTol(){
    STATE.tol = parseInt(rt.value,10);
    vt.textContent = `${STATE.tol}`;
    // if already processed, user may want re-process
    btnZip.disabled = true;
  }
  rt.addEventListener("input", syncTol);
  syncTol();

  // reset transform
  btnReset.addEventListener("click", ()=>{
    rx.value = 0; ry.value = 0; rs.value = 100;
    syncTransform();
  });

  // slice
  btnSlice.addEventListener("click", ()=>{
    if(!STATE.img) return;
    sliceToCells();
    btnProcess.disabled = false;
    btnZip.disabled = true;
  });

  // process
  btnProcess.addEventListener("click", ()=>{
    if(!slicedCells.length){
      alert("請先切割。");
      return;
    }
    processAll();
  });

  // zip
  btnZip.addEventListener("click", downloadZip);

  // resize: keep preview correct after window changes
  window.addEventListener("resize", ()=>{
    // only redraw if already has container on screen
    drawPreview();
  });

  drawPreview();
}

async function loadImageFile(file){
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();

  STATE.img = img;
  STATE.imgName = file.name;
  STATE.imgW = img.naturalWidth || img.width;
  STATE.imgH = img.naturalHeight || img.height;

  // enable actions
  $("#btnSlice").disabled = false;
  $("#btnReset").disabled = false;

  // reset transform for new image
  $("#rx").value = 0; $("#ry").value = 0; $("#rs").value = 100;
  STATE.xPct = 0; STATE.yPct = 0; STATE.sPct = 100;
  $("#vx").textContent = "0%";
  $("#vy").textContent = "0%";
  $("#vs").textContent = "100%";

  // reset outputs
  slicedCells = [];
  processed = [];
  $("#thumbGrid").innerHTML = "";
  $("#btnProcess").disabled = true;
  $("#btnZip").disabled = true;

  drawPreview();
}

bindUI();
