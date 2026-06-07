/* ══════════════════════════════════════════════════
   linept4.js — LINE 動態貼圖切割處理器
   固定 2列×3欄，去背邏輯同 linept2
══════════════════════════════════════════════════ */
const $ = s => document.querySelector(s);

/* ── Constants ── */
const ROWS=2, COLS=3, COUNT=6;
const ANIM_W=320, ANIM_H=270;  // LINE 動圖上限

/* ── State ── */
const S = {
  img:null, imgName:"", imgW:0, imgH:0,
  doRemoveBg:true,
  bgR:255,bgG:255,bgB:255,
  bgThreshold:35, edgeSoftness:6, shrinkEdge:0,
  decontaminate:true, spillSuppression:true,
  _imgFile:null,
  // 四邊留白（佔圖片百分比 0~25）
  mTop:0, mBottom:0, mLeft:0, mRight:0,
};
let slicedCells=[], processed=[], cellChecked=[], cellNames=[];

/* ── Utils ── */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const even=n=>n%2===0?n:n-1;
function canvasToPng(cv){return new Promise(r=>cv.toBlob(b=>r(b),"image/png"));}

/* ── BG Detection ── */
function detectBgColor(canvas){
  const ctx=canvas.getContext("2d");
  const W=canvas.width,H=canvas.height;
  let r=0,g=0,b=0,n=0;
  [[0,0],[W-20,0],[0,H-20],[W-20,H-20]].forEach(([cx,cy])=>{
    const d=ctx.getImageData(Math.max(0,cx),Math.max(0,cy),Math.min(20,W),Math.min(20,H)).data;
    for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
  });
  return{r:Math.round(r/n),g:Math.round(g/n),b:Math.round(b/n)};
}
function updateBgSwatch(){
  const sw=$("#bgSwatch"),tx=$("#bgColorTxt");
  if(sw) sw.style.background=`rgb(${S.bgR},${S.bgG},${S.bgB})`;
  if(tx) tx.textContent=`rgb(${S.bgR},${S.bgG},${S.bgB})`;
}

/* ── Smart Remove BG（同 linept2 演算法）── */
function smartRemoveBg(canvas){
  const ctx=canvas.getContext("2d");
  const W=canvas.width,H=canvas.height;
  const imgData=ctx.getImageData(0,0,W,H);
  const d=imgData.data,N=W*H;
  const bg={r:S.bgR,g:S.bgG,b:S.bgB};
  const T1sq=S.bgThreshold*S.bgThreshold;

  const dist=new Float32Array(N);
  for(let i=0;i<N;i++){
    const pi=i*4;
    const dr=d[pi]-bg.r,dg=d[pi+1]-bg.g,db=d[pi+2]-bg.b;
    dist[i]=dr*dr+dg*dg+db*db;
  }
  const isBg=new Uint8Array(N);
  const queue=[];
  function tryEnq(idx){if(isBg[idx])return;if(dist[idx]<T1sq){isBg[idx]=1;queue.push(idx);}}
  for(let x=0;x<W;x++){tryEnq(x);tryEnq((H-1)*W+x);}
  for(let y=1;y<H-1;y++){tryEnq(y*W);tryEnq(y*W+W-1);}
  let head=0;
  while(head<queue.length){
    const idx=queue[head++];const x=idx%W,y=(idx-x)/W;
    if(x>0)tryEnq(idx-1);if(x<W-1)tryEnq(idx+1);
    if(y>0)tryEnq(idx-W);if(y<H-1)tryEnq(idx+W);
  }
  let mask=new Uint8Array(N);
  for(let i=0;i<N;i++) mask[i]=isBg[i]?0:255;
  for(let pass=0;pass<S.shrinkEdge;pass++){
    const nm=new Uint8Array(mask);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const idx=y*W+x; if(mask[idx]===0) continue;
      if((x>0&&mask[idx-1]===0)||(x<W-1&&mask[idx+1]===0)||
         (y>0&&mask[idx-W]===0)||(y<H-1&&mask[idx+W]===0)) nm[idx]=0;
    }
    mask.set(nm);
  }
  const alphaBuf=new Uint8ClampedArray(N);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const idx=y*W+x,m=mask[idx];
    let edge=false;
    if(x>0&&mask[idx-1]!==m)edge=true;
    else if(x<W-1&&mask[idx+1]!==m)edge=true;
    else if(y>0&&mask[idx-W]!==m)edge=true;
    else if(y<H-1&&mask[idx+W]!==m)edge=true;
    if(!edge){alphaBuf[idx]=m;continue;}
    let sum=0,cnt=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<W&&ny>=0&&ny<H){sum+=mask[ny*W+nx];cnt++;}
    }
    alphaBuf[idx]=Math.round(sum/cnt);
  }
  if(S.edgeSoftness<50){
    for(let i=0;i<N;i++){
      const a=alphaBuf[i];if(a===0||a===255)continue;
      if(a<48)alphaBuf[i]=0;
      else if(a>208)alphaBuf[i]=255;
      else{const x2=(a-48)/160;alphaBuf[i]=Math.round(x2*x2*(3-2*x2)*255);}
    }
  }
  let spillCh=-1;
  if(S.spillSuppression){
    if(bg.g>bg.r+30&&bg.g>bg.b+30)spillCh=1;
    else if(bg.b>bg.r+30&&bg.b>bg.g+30)spillCh=2;
  }
  for(let i=0;i<N;i++){
    const pi=i*4,a=alphaBuf[i];
    d[pi+3]=a;
    if(S.decontaminate&&a>0&&a<250){
      const af=a/255;
      d[pi]  =Math.max(0,Math.min(255,(d[pi]  -(1-af)*bg.r)/af));
      d[pi+1]=Math.max(0,Math.min(255,(d[pi+1]-(1-af)*bg.g)/af));
      d[pi+2]=Math.max(0,Math.min(255,(d[pi+2]-(1-af)*bg.b)/af));
    }
    if(S.spillSuppression&&a>0&&spillCh!==-1){
      if(spillCh===1&&d[pi+1]>d[pi]&&d[pi+1]>d[pi+2]) d[pi+1]=Math.max(d[pi],d[pi+2]);
      else if(spillCh===2&&d[pi+2]>d[pi]&&d[pi+2]>d[pi+1]) d[pi+2]=Math.max(d[pi],d[pi+1]);
    }
  }
  ctx.putImageData(imgData,0,0);
  return canvas;
}

/* ── autoTrim + resize to LINE anim spec ── */
function autoTrim(canvas){
  const ctx=canvas.getContext("2d");
  const W=canvas.width,H=canvas.height;
  const d=ctx.getImageData(0,0,W,H).data;
  let x0=W,x1=0,y0=H,y1=0;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    if(d[(y*W+x)*4+3]>15){
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
    }
  }
  if(x0>x1||y0>y1)return null;
  return{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
}

function resizeAnimCell(canvas){
  let src=canvas;
  const trim=autoTrim(src);
  if(trim){
    const tc=document.createElement("canvas");tc.width=trim.w;tc.height=trim.h;
    tc.getContext("2d").drawImage(src,trim.x,trim.y,trim.w,trim.h,0,0,trim.w,trim.h);
    src=tc;
  }
  // 固定輸出 ANIM_W × ANIM_H，角色置底對齊，確保動畫每幀尺寸相同、腳部位置一致
  const scale=Math.min(ANIM_W/src.width,ANIM_H/src.height,1);
  const dw=Math.max(1,Math.round(src.width*scale));
  const dh=Math.max(1,Math.round(src.height*scale));
  const out=document.createElement("canvas");out.width=ANIM_W;out.height=ANIM_H;
  const ctx=out.getContext("2d");
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  // 置底：x 置中，y 貼底
  const dx=Math.round((ANIM_W-dw)/2);
  const dy=ANIM_H-dh;
  ctx.drawImage(src,dx,dy,dw,dh);
  return out;
}

/* ── Drag frame + grid overlay ── */
let _dragInfo = null; // {edge, startX,startY, startVals}

function updateMarginChips(){
  const fmt = v => `${Math.round(v)}%`;
  const t=document.getElementById("vTop"),    b=document.getElementById("vBottom");
  const l=document.getElementById("vLeft"),   r=document.getElementById("vRight");
  if(t) t.textContent=fmt(S.mTop);
  if(b) b.textContent=fmt(S.mBottom);
  if(l) l.textContent=fmt(S.mLeft);
  if(r) r.textContent=fmt(S.mRight);
}

function buildDragFrame(con){
  // Remove old frame
  const old=document.getElementById("dragFrame");
  if(old) old.remove();

  const W=con.clientWidth, H=con.clientHeight;
  const x0=S.mLeft/100*W, y0=S.mTop/100*H;
  const x1=W-S.mRight/100*W, y1=H-S.mBottom/100*H;

  const frame=document.createElement("div");
  frame.id="dragFrame";
  frame.style.left=x0+"px"; frame.style.top=y0+"px";
  frame.style.width=(x1-x0)+"px"; frame.style.height=(y1-y0)+"px";

  // Edge handles
  [
    {cls:"top",    cursor:"ns-resize"},
    {cls:"bottom", cursor:"ns-resize"},
    {cls:"left",   cursor:"ew-resize"},
    {cls:"right",  cursor:"ew-resize"},
  ].forEach(({cls,cursor})=>{
    const e=document.createElement("div");
    e.className="df-edge "+cls; e.dataset.edge=cls;
    frame.appendChild(e);
    setupEdgeDrag(e, con);
  });

  // Corner handles with arrows
  const ARROWS={tl:"↖",tr:"↗",bl:"↙",br:"↘"};
  Object.entries(ARROWS).forEach(([cls,arrow])=>{
    const h=document.createElement("div");
    h.className="df-handle "+cls; h.dataset.corner=cls;
    h.textContent=arrow;
    frame.appendChild(h);
    setupCornerDrag(h, con);
  });

  con.appendChild(frame);
  redrawGridLines(con);
}

function redrawGridLines(con){
  con.querySelectorAll(".gl4").forEach(e=>e.remove());
  const W=con.clientWidth, H=con.clientHeight;
  const x0=S.mLeft/100*W, y0=S.mTop/100*H;
  const cw=W*(1-S.mLeft/100-S.mRight/100);
  const ch=H*(1-S.mTop/100-S.mBottom/100);

  for(let r=1;r<ROWS;r++){
    const l=document.createElement("div");
    l.className="gl4 gl4-h";
    l.style.top=(y0+ch*r/ROWS)+"px";
    l.style.left=x0+"px"; l.style.width=cw+"px";
    con.appendChild(l);
  }
  for(let c=1;c<COLS;c++){
    const l=document.createElement("div");
    l.className="gl4 gl4-v";
    l.style.left=(x0+cw*c/COLS)+"px";
    l.style.top=y0+"px"; l.style.height=ch+"px";
    con.appendChild(l);
  }
}

function clampMargin(){
  const gap=5; // min gap between left+right or top+bottom
  S.mTop    = clamp(S.mTop,    0, 45);
  S.mBottom = clamp(S.mBottom, 0, 45);
  S.mLeft   = clamp(S.mLeft,   0, 45);
  S.mRight  = clamp(S.mRight,  0, 45);
  if(S.mTop+S.mBottom>90){S.mTop=Math.min(S.mTop,45);S.mBottom=90-S.mTop;}
  if(S.mLeft+S.mRight>90){S.mLeft=Math.min(S.mLeft,45);S.mRight=90-S.mLeft;}
}

function setupEdgeDrag(el, con){
  el.addEventListener("pointerdown", ev=>{
    ev.preventDefault(); ev.stopPropagation();
    el.setPointerCapture(ev.pointerId);
    _dragInfo={
      edge:el.dataset.edge,
      startX:ev.clientX, startY:ev.clientY,
      startVals:{...S},
      conW:con.clientWidth, conH:con.clientHeight,
    };
    el.classList.add("active");
  });
  el.addEventListener("pointermove", ev=>{
    if(!_dragInfo||_dragInfo.edge!==el.dataset.edge) return;
    const {edge,startX,startY,startVals,conW,conH}=_dragInfo;
    const dx=(ev.clientX-startX)/conW*100;
    const dy=(ev.clientY-startY)/conH*100;
    if(edge==="top")    S.mTop    = clamp(startVals.mTop+dy,    0,45);
    if(edge==="bottom") S.mBottom = clamp(startVals.mBottom-dy, 0,45);
    if(edge==="left")   S.mLeft   = clamp(startVals.mLeft+dx,   0,45);
    if(edge==="right")  S.mRight  = clamp(startVals.mRight-dx,  0,45);
    clampMargin();
    buildDragFrame(con);
    updateMarginChips();
  });
  el.addEventListener("pointerup", ()=>{_dragInfo=null; el.classList.remove("active");});
  el.addEventListener("pointercancel", ()=>{_dragInfo=null; el.classList.remove("active");});
}

function setupCornerDrag(el, con){
  el.addEventListener("pointerdown", ev=>{
    ev.preventDefault(); ev.stopPropagation();
    el.setPointerCapture(ev.pointerId);
    _dragInfo={
      corner:el.dataset.corner,
      startX:ev.clientX, startY:ev.clientY,
      startVals:{...S},
      conW:con.clientWidth, conH:con.clientHeight,
    };
    el.classList.add("active");
  });
  el.addEventListener("pointermove", ev=>{
    if(!_dragInfo||_dragInfo.corner!==el.dataset.corner) return;
    const {corner,startX,startY,startVals,conW,conH}=_dragInfo;
    const dx=(ev.clientX-startX)/conW*100;
    const dy=(ev.clientY-startY)/conH*100;
    if(corner==="tl"){ S.mTop=clamp(startVals.mTop+dy,0,45);    S.mLeft=clamp(startVals.mLeft+dx,0,45); }
    if(corner==="tr"){ S.mTop=clamp(startVals.mTop+dy,0,45);    S.mRight=clamp(startVals.mRight-dx,0,45); }
    if(corner==="bl"){ S.mBottom=clamp(startVals.mBottom-dy,0,45); S.mLeft=clamp(startVals.mLeft+dx,0,45); }
    if(corner==="br"){ S.mBottom=clamp(startVals.mBottom-dy,0,45); S.mRight=clamp(startVals.mRight-dx,0,45); }
    clampMargin();
    buildDragFrame(con);
    updateMarginChips();
  });
  el.addEventListener("pointerup", ()=>{_dragInfo=null; el.classList.remove("active");});
  el.addEventListener("pointercancel", ()=>{_dragInfo=null; el.classList.remove("active");});
}

/* ── Preview image container ── */
function buildImgCon(){
  const area=$("#canvasArea");
  const old=document.getElementById("imgCon4");if(old)old.remove();
  const pad=16,maxW=area.clientWidth-pad*2,maxH=area.clientHeight-pad*2;
  const scale=Math.min(maxW/S.imgW,maxH/S.imgH,1);
  const dW=Math.round(S.imgW*scale),dH=Math.round(S.imgH*scale);

  const con=document.createElement("div");
  con.id="imgCon4";con.style.cssText=`width:${dW}px;height:${dH}px;position:relative;flex-shrink:0`;
  const img=document.createElement("img");
  img.src=URL.createObjectURL(S._imgFile);
  img.style.cssText="display:block;width:100%;height:100%;border-radius:6px;pointer-events:none";
  con.appendChild(img);

  // Draw margin boundary (orange) + inner grid lines (blue)
  buildDragFrame(con);
  area.appendChild(con);
  $("#emptyState").style.display="none";
}

/* ── Slice ── */
function sliceCells(){
  const base=document.createElement("canvas");
  base.width=S.imgW;base.height=S.imgH;
  base.getContext("2d").drawImage(S.img,0,0,S.imgW,S.imgH);

  // 計算有效內容區域（扣除四邊留白）
  const marginTop    = Math.round(S.imgH * S.mTop    / 100);
  const marginBottom = Math.round(S.imgH * S.mBottom / 100);
  const marginLeft   = Math.round(S.imgW * S.mLeft   / 100);
  const marginRight  = Math.round(S.imgW * S.mRight  / 100);
  const contentX = marginLeft;
  const contentY = marginTop;
  const contentW = S.imgW - marginLeft - marginRight;
  const contentH = S.imgH - marginTop  - marginBottom;

  slicedCells=[];
  const cw=Math.round(contentW/COLS), ch=Math.round(contentH/ROWS);
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const sx=contentX+c*cw, sy=contentY+r*ch;
    const cell=document.createElement("canvas");
    cell.width=cw; cell.height=ch;
    cell.getContext("2d").drawImage(base,sx,sy,cw,ch,0,0,cw,ch);
    slicedCells.push({row:r,col:c,canvasRaw:cell});
  }

  // auto detect bg from first cell
  const col=detectBgColor(slicedCells[0].canvasRaw);
  S.bgR=col.r;S.bgG=col.g;S.bgB=col.b;
  updateBgSwatch();
  $("#btnDetect").disabled=false;

  processed=[];
  cellChecked=Array(COUNT).fill(true);
  // Default names: 01-01, 01-02, 01-03, 02-01…
  cellNames=slicedCells.map(({row,col})=>
    `${String(row+1).padStart(2,"0")}-${String(col+1).padStart(2,"0")}`
  );

  renderCellGrid(false);
  $("#btnProcess").disabled=false;
  $("#btnZip").disabled=true;
  const sh=$("#sliceHint");
  if(sh) sh.textContent=`切割完成：${ROWS}列×${COLS}欄，共 ${COUNT} 格`;
}

/* ── Process (apply bg removal) ── */
function processAll(){
  processed=slicedCells.map(({row,col,canvasRaw},i)=>{
    const clone=document.createElement("canvas");
    clone.width=canvasRaw.width;clone.height=canvasRaw.height;
    clone.getContext("2d").drawImage(canvasRaw,0,0);
    if(S.doRemoveBg) smartRemoveBg(clone);
    const out=resizeAnimCell(clone);
    return{row,col,canvasOut:out};
  });
  renderCellGrid(true);
  $("#btnZip").disabled=false;
  const bd=document.getElementById("btnDropper");
  if(bd) bd.disabled=false;
}


/* ══════════════════════════════════════════════════
   滴管補去背（Flood-fill from click point）
══════════════════════════════════════════════════ */
let _dropperMode = false;
let _dropperCellIdx = -1;  // 目前滴管作用的格子索引

function setDropperMode(on){
  _dropperMode = on;
  const btn = document.getElementById("btnDropper");
  if(btn){
    btn.classList.toggle("is-on", on);
    btn.textContent = on ? "💧 點擊格子去背（再按取消）" : "💧 滴管補去背";
  }
  // 改變右欄所有格子的游標
  document.querySelectorAll(".cell-canvas-wrap canvas").forEach(cv=>{
    cv.style.cursor = on ? "crosshair" : "default";
  });
}

function dropperFill(canvas, px, py){
  // Flood-fill from (px,py)，去除與點擊位置色相近的連通區域
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const imgData = ctx.getImageData(0,0,W,H);
  const d = imgData.data;
  const idx = (py*W+px)*4;
  const tr = d[idx], tg = d[idx+1], tb = d[idx+2], ta = d[idx+3];
  if(ta === 0) return; // 已是透明，不需操作

  const thresh = S.bgThreshold * S.bgThreshold;
  const visited = new Uint8Array(W*H);
  const queue = [py*W+px];
  visited[py*W+px] = 1;

  while(queue.length){
    const i = queue.pop();
    const x = i%W, y = Math.floor(i/W);
    const pi = i*4;
    if(d[pi+3] === 0){ continue; } // 已透明跳過
    const dr=d[pi]-tr, dg=d[pi+1]-tg, db=d[pi+2]-tb;
    if(dr*dr+dg*dg+db*db > thresh) continue;
    // 去除這個像素
    d[pi+3] = 0;
    const ns = [];
    if(x>0)   ns.push(i-1);
    if(x<W-1) ns.push(i+1);
    if(y>0)   ns.push(i-W);
    if(y<H-1) ns.push(i+W);
    ns.forEach(ni=>{ if(!visited[ni]){visited[ni]=1;queue.push(ni);} });
  }
  ctx.putImageData(imgData,0,0);
}

function handleDropperClick(cellIdx, canvasEl, evt){
  if(!_dropperMode) return;
  const arr = processed.length ? processed : slicedCells;
  if(!arr[cellIdx]) return;

  // 取得點擊位置（相對於 canvas 實際像素）
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = canvasEl.width  / rect.width;
  const scaleY = canvasEl.height / rect.height;
  const px = Math.floor((evt.clientX - rect.left) * scaleX);
  const py = Math.floor((evt.clientY - rect.top)  * scaleY);

  // 對 processed 的 canvasOut 操作（去背後的圖）
  const src = processed.length ? processed[cellIdx].canvasOut : null;
  if(!src){ alert("請先套用去背再使用滴管"); return; }

  dropperFill(src, px, py);

  // 重繪這個格子的縮圖
  canvasEl.width  = src.width;
  canvasEl.height = src.height;
  canvasEl.getContext("2d").clearRect(0,0,src.width,src.height);
  canvasEl.getContext("2d").drawImage(src,0,0);
}

/* ── Render cell grid ── */
function renderCellGrid(useProc){
  const grid=$("#cellGrid");grid.innerHTML="";
  const arr=useProc?processed:slicedCells;
  if(!arr.length){
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--muted2);font-size:12px;padding:20px 0">切割後顯示</div>';
    return;
  }

  arr.forEach((item,i)=>{
    const src=useProc?item.canvasOut:item.canvasRaw;
    const checked=cellChecked[i];

    const wrap=document.createElement("div");
    wrap.className="cell-item"+(checked?"":" deselected");

    // canvas
    const cw=document.createElement("div");cw.className="cell-canvas-wrap";
    const cv=document.createElement("canvas");cv.width=src.width;cv.height=src.height;
    cv.getContext("2d").drawImage(src,0,0);
    const _idx=i;
    cv.addEventListener("click", evt=>handleDropperClick(_idx, cv, evt));
    cw.appendChild(cv);

    // meta
    const meta=document.createElement("div");meta.className="cell-meta";

    const lbl=document.createElement("div");lbl.className="cell-label";
    const{row,col}=item;
    lbl.textContent=`列${row+1}格${col+1}`;

    // filename input
    const inp=document.createElement("input");
    inp.type="text";inp.className="cell-name-input";
    inp.value=cellNames[i];
    inp.addEventListener("change",()=>{cellNames[i]=inp.value.trim()||cellNames[i];});
    inp.addEventListener("input",()=>{cellNames[i]=inp.value;});

    // checkbox
    const chk=document.createElement("input");
    chk.type="checkbox";chk.className="cell-check";chk.checked=checked;
    chk.addEventListener("change",()=>{
      cellChecked[i]=chk.checked;
      wrap.className="cell-item"+(chk.checked?"":" deselected");
    });

    meta.appendChild(lbl);meta.appendChild(inp);meta.appendChild(chk);
    wrap.appendChild(cw);wrap.appendChild(meta);
    grid.appendChild(wrap);
  });
}

/* ── ZIP Download ── */
async function downloadZip(){
  const arr=processed.length?processed:slicedCells;
  if(!arr.length){alert("請先切割並套用去背");return;}
  const zip=new JSZip();
  for(let i=0;i<arr.length;i++){
    if(!cellChecked[i]) continue;
    const src=processed.length?processed[i].canvasOut:slicedCells[i].canvasRaw;
    const name=(cellNames[i]||`${i+1}`).replace(/[^a-zA-Z0-9\-_]/g,"_")+".png";
    zip.file(name,await canvasToPng(src));
  }
  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
  saveAs(blob,"LINE_anim_cells.zip");
}

/* ── Load image ── */
async function loadImage(file){
  S._imgFile=file;
  const url=URL.createObjectURL(file);
  const img=new Image();img.src=url;
  await img.decode().catch(()=>{});
  S.img=img;S.imgName=file.name;
  S.imgW=img.naturalWidth||img.width;S.imgH=img.naturalHeight||img.height;
  buildImgCon();
  $("#imgInfo").textContent=`${S.imgName}｜${S.imgW}×${S.imgH}`;
  slicedCells=[];processed=[];
  $("#btnSlice").disabled=false;
  $("#btnProcess").disabled=true;
  $("#btnZip").disabled=true;
  const sh=$("#sliceHint");if(sh)sh.textContent="";
  renderCellGrid(false);
}

/* ── Bind UI ── */
function bindUI(){
  $("#yearTxt").textContent="© "+new Date().getFullYear();

  $("#btnPick").onclick=()=>$("#fileBig").click();
  $("#fileBig").onchange=e=>{const f=e.target.files?.[0];if(f)loadImage(f);};
  $("#btnSlice").onclick=()=>{if(!S.img)return;sliceCells();};
  $("#btnProcess").onclick=processAll;
  $("#btnZip").onclick=downloadZip;

  $("#btnBgYes").onclick=()=>{
    S.doRemoveBg=true;
    $("#btnBgYes").classList.add("is-on");$("#btnBgNo").classList.remove("is-on");
    $("#bgAdv").style.display="";
  };
  $("#btnBgNo").onclick=()=>{
    S.doRemoveBg=false;
    $("#btnBgNo").classList.add("is-on");$("#btnBgYes").classList.remove("is-on");
    $("#bgAdv").style.display="none";
  };

  $("#btnDetect").onclick=()=>{
    if(!slicedCells.length)return;
    const col=detectBgColor(slicedCells[0].canvasRaw);
    S.bgR=col.r;S.bgG=col.g;S.bgB=col.b;updateBgSwatch();
  };

  function syncAdv(){
    S.bgThreshold=+$("#rt").value;
    S.edgeSoftness=+$("#rsoft").value;
    S.shrinkEdge=+$("#rerode").value;
    S.decontaminate=$("#chkDefringe").checked;
    S.spillSuppression=$("#chkSpill").checked;
    $("#vt").textContent=S.bgThreshold;
    $("#vsoft").textContent=S.edgeSoftness;
    $("#verode").textContent=S.shrinkEdge;
  }
  ["#rt","#rsoft","#rerode"].forEach(id=>$(id).addEventListener("input",syncAdv));
  ["#chkDefringe","#chkSpill"].forEach(id=>$(id).addEventListener("change",syncAdv));

  window.addEventListener("resize",()=>{if(S.img){buildImgCon();}});

  // 滴管補去背
  document.getElementById("btnDropper")?.addEventListener("click",()=>{
    if(!processed.length){ alert("請先套用去背再使用滴管功能"); return; }
    setDropperMode(!_dropperMode);
  });
}

document.addEventListener("DOMContentLoaded",()=>{
  updateBgSwatch();
  bindUI();
});
