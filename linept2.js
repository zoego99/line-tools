/* ═══════════════════════════════════════════════════════════
   PAGE 2  ―  重新實作
   格線：細線 + 圓形把手（pointerCapture）
   單格微調：cellOverride，4 個邊框圓形把手，相鄰格同步
   去背：Flood-fill from edges + shrink + S-curve + decontaminate
════════════════════════════════════════════════════════════ */
const $ = s => document.querySelector(s);

/* ─── Constants ─── */
const GRID_SPECS = { "5x5":{rows:5,cols:5,count:25}, "3x3":{rows:3,cols:3,count:9} };
const STICKER_W=370, STICKER_H=320, MAIN_SZ=240, TAB_W=96, TAB_H=74;

/* ─── State ─── */
const S = {
  grid:"5x5", mode:"global",
  doRemoveBg:true,
  bgR:0,bgG:255,bgB:0,
  bgThreshold:55, edgeSoftness:8, shrinkEdge:1,
  decontaminate:true, spillSuppression:true, removeInternal:false,
  img:null, imgName:"", imgW:0, imgH:0,
  // Lines stored as pixel values in original image space
  colLines:[], rowLines:[],
  // Per-cell overrides (cell mode)
  cellOverride:{},
  selectedCell:null,   // {ri,ci}
  liveIdx:0,
};
let slicedCells=[], processed=[], mainIdx=0, tabIdx=0, _useProc=false;
let _drag=null;   // global drag state

/* ─── Utils ─── */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const even=n=>n%2===0?n:n-1;
function fitContain(sw,sh,dw,dh){const s=Math.min(dw/sw,dh/sh);return{x:(dw-sw*s)/2,y:(dh-sh*s)/2,w:sw*s,h:sh*s};}
function canvasToPng(cv){return new Promise(r=>cv.toBlob(b=>r(b),"image/png"));}

function initLines(){
  const spec=GRID_SPECS[S.grid];
  S.colLines=Array.from({length:spec.cols+1},(_,i)=>Math.round(i*S.imgW/spec.cols));
  S.rowLines=Array.from({length:spec.rows+1},(_,i)=>Math.round(i*S.imgH/spec.rows));
  S.cellOverride={};S.selectedCell=null;
}

/* ─── Cell rect (respects override) ─── */
function getCellRect(ri,ci){
  const k=`${ri}_${ci}`;
  if(S.cellOverride[k]) return {...S.cellOverride[k]};
  return{x0:S.colLines[ci],y0:S.rowLines[ri],x1:S.colLines[ci+1],y1:S.rowLines[ri+1]};
}

/* ─── Scale helpers ─── */
function getImgCon(){return document.getElementById("imgCon");}
function getScale(){
  const con=getImgCon(); if(!con) return{scX:1,scY:1};
  return{scX:con.clientWidth/S.imgW, scY:con.clientHeight/S.imgH};
}

/* ═══════════════════════════════════════════════════════════
   BG DETECTION
════════════════════════════════════════════════════════════ */
function detectBgColor(canvas){
  // 取四角 + 四邊中點各 30×30 區域，選出最常見的顏色（眾數）
  const ctx=canvas.getContext("2d");
  const W=canvas.width,H=canvas.height;
  const SZ=30;
  const regions=[
    [0,0],[W-SZ,0],[0,H-SZ],[W-SZ,H-SZ],         // 四角
    [Math.floor(W/2-SZ/2),0],                      // 上中
    [Math.floor(W/2-SZ/2),H-SZ],                   // 下中
    [0,Math.floor(H/2-SZ/2)],                      // 左中
    [W-SZ,Math.floor(H/2-SZ/2)],                   // 右中
  ];
  // 量化色桶（每通道除以8），找最多像素的桶
  const buckets={};
  regions.forEach(([cx,cy])=>{
    const d=ctx.getImageData(
      Math.max(0,cx),Math.max(0,cy),
      Math.min(SZ,W),Math.min(SZ,H)
    ).data;
    for(let i=0;i<d.length;i+=4){
      if(d[i+3]<128) continue; // 跳過透明
      const key=`${d[i]>>3}_${d[i+1]>>3}_${d[i+2]>>3}`;
      buckets[key]=(buckets[key]||{r:d[i],g:d[i+1],b:d[i+2],n:0});
      buckets[key].n++;
    }
  });
  // 找最多次的桶
  let best={n:0,r:0,g:255,b:0};
  Object.values(buckets).forEach(v=>{ if(v.n>best.n) best=v; });
  return{r:best.r,g:best.g,b:best.b};
}

function updateBgSwatch(){
  const sw=$("#bgSwatch"),tx=$("#bgColorTxt"); if(!sw||!tx) return;
  sw.style.background=`rgb(${S.bgR},${S.bgG},${S.bgB})`;
  tx.textContent=`rgb(${S.bgR},${S.bgG},${S.bgB})`;
}

/* ═══════════════════════════════════════════════════════════
   SMART REMOVE BG  (ported from reference site)
════════════════════════════════════════════════════════════ */
function smartRemoveBg(canvas){
  const ctx=canvas.getContext("2d");
  const W=canvas.width,H=canvas.height;
  const imgData=ctx.getImageData(0,0,W,H);
  const d=imgData.data,N=W*H;
  const bgColor={r:S.bgR,g:S.bgG,b:S.bgB};

  const T1=S.bgThreshold;
  const T2=T1+S.edgeSoftness;
  const T1sq=T1*T1;

  // Step 1: distance to bg color
  const dist=new Float32Array(N);
  for(let i=0;i<N;i++){
    const pi=i*4;
    const dr=d[pi]-bgColor.r,dg=d[pi+1]-bgColor.g,db=d[pi+2]-bgColor.b;
    dist[i]=dr*dr+dg*dg+db*db;
  }

  // Step 2: flood-fill bg from edges
  const isBg=new Uint8Array(N);
  if(!S.removeInternal){
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
  }else{
    for(let i=0;i<N;i++){if(dist[i]<T1sq)isBg[i]=1;}
  }

  // Step 3: shrink edge
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

  // Step 4: 3×3 anti-alias blur on edges
  const alphaBuf=new Uint8ClampedArray(N);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const idx=y*W+x,m=mask[idx];
    let edge=false;
    if(x>0&&mask[idx-1]!==m)edge=true;
    else if(x<W-1&&mask[idx+1]!==m)edge=true;
    else if(y>0&&mask[idx-W]!==m)edge=true;
    else if(y<H-1&&mask[idx+W]!==m)edge=true;
    else if(x>0&&y>0&&mask[idx-W-1]!==m)edge=true;
    else if(x<W-1&&y>0&&mask[idx-W+1]!==m)edge=true;
    else if(x>0&&y<H-1&&mask[idx+W-1]!==m)edge=true;
    else if(x<W-1&&y<H-1&&mask[idx+W+1]!==m)edge=true;
    if(!edge){alphaBuf[idx]=m;continue;}
    let sum=0,cnt=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<W&&ny>=0&&ny<H){sum+=mask[ny*W+nx];cnt++;}
    }
    alphaBuf[idx]=Math.round(sum/cnt);
  }

  // Step 4.5: S-curve sharpening (softer edge → keep; sharp → push to 0/255)
  if(S.edgeSoftness<50){
    for(let i=0;i<N;i++){
      const a=alphaBuf[i];if(a===0||a===255)continue;
      if(a<48)alphaBuf[i]=0;
      else if(a>208)alphaBuf[i]=255;
      else{const x=(a-48)/160;alphaBuf[i]=Math.round(x*x*(3-2*x)*255);}
    }
  }

  // Step 5: spill channel detection
  let spillCh=-1;
  if(S.spillSuppression){
    if(bgColor.g>bgColor.r+30&&bgColor.g>bgColor.b+30)spillCh=1;
    else if(bgColor.b>bgColor.r+30&&bgColor.b>bgColor.g+30)spillCh=2;
  }

  // Step 6: apply alpha + decontaminate + spill
  for(let i=0;i<N;i++){
    const pi=i*4,a=alphaBuf[i];
    d[pi+3]=a;
    if(S.decontaminate&&a>0&&a<250){
      const af=a/255;
      d[pi]  =Math.max(0,Math.min(255,(d[pi]  -(1-af)*bgColor.r)/af));
      d[pi+1]=Math.max(0,Math.min(255,(d[pi+1]-(1-af)*bgColor.g)/af));
      d[pi+2]=Math.max(0,Math.min(255,(d[pi+2]-(1-af)*bgColor.b)/af));
    }
    if(S.spillSuppression&&a>0&&spillCh!==-1){
      if(spillCh===1&&d[pi+1]>d[pi]&&d[pi+1]>d[pi+2]) d[pi+1]=Math.max(d[pi],d[pi+2]);
      else if(spillCh===2&&d[pi+2]>d[pi]&&d[pi+2]>d[pi+1]) d[pi+2]=Math.max(d[pi],d[pi+1]);
    }
  }
  ctx.putImageData(imgData,0,0);
  return canvas;
}

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

function resizeSticker(canvas){
  // autoTrim 不做，直接以完整格子縮放至 LINE 規格
  // 這樣下載的圖與網頁預覽看到的比例完全一致
  const src=canvas;
  // 以高度填滿 320px 為優先，寬度不超過 370px
  const scaleH = STICKER_H / src.height;
  const scaleW = STICKER_W / src.width;
  const scale = (src.width * scaleH <= STICKER_W) ? scaleH : scaleW;
  const dw=Math.max(1,Math.round(src.width*scale));
  const dh=Math.max(1,Math.round(src.height*scale));
  // 固定輸出 370×320 畫布（全透明背景）
  const out=document.createElement("canvas");
  out.width=STICKER_W; out.height=STICKER_H;
  const ctx=out.getContext("2d");
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality="high";
  // 置底置中
  const dx=Math.round((STICKER_W-dw)/2);
  const dy=STICKER_H-dh;
  ctx.drawImage(src,dx,dy,dw,dh);
  return out;
}

/* ═══════════════════════════════════════════════════════════
   GRID DRAWING
════════════════════════════════════════════════════════════ */
function drawGrid(){
  const con=getImgCon(); if(!con) return;
  con.querySelectorAll(".gl").forEach(e=>e.remove());
  const{scX,scY}=getScale();
  const spec=GRID_SPECS[S.grid];

  if(S.mode==="global"){
    // Vertical lines (col dividers)
    S.colLines.slice(1,-1).forEach((px,i)=>{
      const sx=px*scX;
      // thin line
      const line=mk("div",{position:"absolute",top:"0",left:(sx-1)+"px",
        width:"2px",height:"100%",background:"rgba(79,110,247,.6)",
        pointerEvents:"none",zIndex:"5"});
      line.className="gl gl-line";
      // handle circle
      const h=mk("div",{position:"absolute",left:sx+"px",top:"50%",
        transform:"translate(-50%,-50%)",zIndex:"7",touchAction:"none"});
      h.className="gl gl-handle";h.textContent="⇔";
      h.dataset.axis="col";h.dataset.idx=i+1;
      con.appendChild(line);con.appendChild(h);
    });
    // Horizontal lines (row dividers)
    S.rowLines.slice(1,-1).forEach((py,i)=>{
      const sy=py*scY;
      const line=mk("div",{position:"absolute",left:"0",top:(sy-1)+"px",
        height:"2px",width:"100%",background:"rgba(79,110,247,.6)",
        pointerEvents:"none",zIndex:"5"});
      line.className="gl gl-line";
      const h=mk("div",{position:"absolute",top:sy+"px",left:"50%",
        transform:"translate(-50%,-50%)",zIndex:"7",touchAction:"none"});
      h.className="gl gl-handle";h.textContent="⇕";
      h.dataset.axis="row";h.dataset.idx=i+1;
      con.appendChild(line);con.appendChild(h);
    });
    // Cell numbers
    S.rowLines.slice(0,-1).forEach((ry,ri)=>S.colLines.slice(0,-1).forEach((cx,ci)=>{
      const n=mk("div",{position:"absolute",left:(cx*scX+4)+"px",top:(ry*scY+3)+"px",
        fontSize:"10px",fontWeight:"800",color:"rgba(79,110,247,.7)",
        pointerEvents:"none",textShadow:"0 1px 2px #fff",zIndex:"4"},
        `#${ri*spec.cols+ci+1}`);
      n.className="gl";con.appendChild(n);
    }));
  } else {
    // Cell mode: draw cell boxes + selected cell handles
    const rows=spec.rows,cols=spec.cols;
    for(let ri=0;ri<rows;ri++) for(let ci=0;ci<cols;ci++){
      const{x0,y0,x1,y1}=getCellRect(ri,ci);
      const isSel=S.selectedCell&&S.selectedCell.ri===ri&&S.selectedCell.ci===ci;
      const hasOv=!!S.cellOverride[`${ri}_${ci}`];
      const box=mk("div",{
        position:"absolute",
        left:(x0*scX)+"px",top:(y0*scY)+"px",
        width:((x1-x0)*scX)+"px",height:((y1-y0)*scY)+"px",
        border:`2px solid ${isSel?"rgba(79,110,247,.9)":hasOv?"rgba(176,128,0,.7)":"rgba(79,110,247,.25)"}`,
        borderRadius:"2px",cursor:"pointer",zIndex:"3",
        background:isSel?"rgba(79,110,247,.07)":"transparent",boxSizing:"border-box"
      });
      box.className="gl gl-cell";
      const lbl=mk("div",{position:"absolute",top:"3px",left:"4px",
        fontSize:"10px",fontWeight:"800",
        color:isSel?"rgba(79,110,247,.9)":hasOv?"#b08000":"rgba(79,110,247,.6)",
        pointerEvents:"none"},`#${ri*cols+ci+1}${hasOv?" ★":""}`);
      box.appendChild(lbl);
      const _ri=ri,_ci=ci;
      box.addEventListener("click",e=>{
        e.stopPropagation();
        S.selectedCell={ri:_ri,ci:_ci};
        drawGrid();
        updateCellSelHint();
        // sync live preview
        S.liveIdx=_ri*cols+_ci;updateLive();
      });
      con.appendChild(box);
    }
    // Edge handles for selected cell
    if(S.selectedCell){
      const{ri,ci}=S.selectedCell;
      const{x0,y0,x1,y1}=getCellRect(ri,ci);
      const cx=(x0+x1)/2*scX, cy=(y0+y1)/2*scY;
      const handles=[
        {label:"⇕",lx:cx,ly:y0*scY,edge:"y0"},
        {label:"⇕",lx:cx,ly:y1*scY,edge:"y1"},
        {label:"⇔",lx:x0*scX,ly:cy,  edge:"x0"},
        {label:"⇔",lx:x1*scX,ly:cy,  edge:"x1"},
      ];
      handles.forEach(h=>{
        // skip boundary edges (first/last row/col)
        if(h.edge==="y0"&&ri===0)return;
        if(h.edge==="y1"&&ri===spec.rows-1)return;
        if(h.edge==="x0"&&ci===0)return;
        if(h.edge==="x1"&&ci===spec.cols-1)return;

        const el=document.createElement("div");
        el.className="gl gl-cell-handle";
        el.style.left=h.lx+"px"; el.style.top=h.ly+"px";
        el.style.transform="translate(-50%,-50%)";
        el.textContent=h.label;
        el.dataset.edge=h.edge;
        con.appendChild(el);
      });
    }
  }
  setupHandleDrag();
}

function setupHandleDrag(){
  const con=getImgCon(); if(!con) return;
  const spec=GRID_SPECS[S.grid];

  // Global mode handles
  con.querySelectorAll(".gl-handle").forEach(h=>{
    h.addEventListener("pointerdown",ev=>{
      ev.preventDefault();ev.stopPropagation();
      h.setPointerCapture(ev.pointerId);
      _drag={type:"global",axis:h.dataset.axis,idx:+h.dataset.idx};
      h.classList.add("active");
    });
    h.addEventListener("pointermove",ev=>{
      if(!_drag||_drag.type!=="global") return;
      const{scX,scY}=getScale();
      const r=con.getBoundingClientRect();
      if(_drag.axis==="col"){
        const x=Math.round((ev.clientX-r.left)/scX);
        const arr=[...S.colLines];
        arr[_drag.idx]=Math.max((arr[_drag.idx-1]||0)+8,Math.min((arr[_drag.idx+1]||S.imgW)-8,x));
        S.colLines=arr;
      }else{
        const y=Math.round((ev.clientY-r.top)/scY);
        const arr=[...S.rowLines];
        arr[_drag.idx]=Math.max((arr[_drag.idx-1]||0)+8,Math.min((arr[_drag.idx+1]||S.imgH)-8,y));
        S.rowLines=arr;
      }
      drawGrid();
    });
    h.addEventListener("pointerup",()=>{_drag=null;h.classList.remove("active");});
    h.addEventListener("pointercancel",()=>{_drag=null;h.classList.remove("active");});
  });

  // Cell mode edge handles
  con.querySelectorAll(".gl-cell-handle").forEach(h=>{
    h.addEventListener("pointerdown",ev=>{
      ev.preventDefault();ev.stopPropagation();
      h.setPointerCapture(ev.pointerId);
      const{ri,ci}=S.selectedCell;
      const k=`${ri}_${ci}`;
      if(!S.cellOverride[k]) S.cellOverride[k]={...getCellRect(ri,ci)};
      _drag={type:"cell",ri,ci,edge:h.dataset.edge};
      h.classList.add("active");
    });
    h.addEventListener("pointermove",ev=>{
      if(!_drag||_drag.type!=="cell") return;
      const{scX,scY}=getScale();
      const r=con.getBoundingClientRect();
      const{ri,ci,edge}=_drag;
      const k=`${ri}_${ci}`;
      if(!S.cellOverride[k]) S.cellOverride[k]={...getCellRect(ri,ci)};
      const ov=S.cellOverride[k];
      let nv;
      switch(edge){
        case"x0":
          nv=Math.max(0,Math.min(ov.x1-10,Math.round((ev.clientX-r.left)/scX)));
          ov.x0=nv;
          if(ci>0){const kl=`${ri}_${ci-1}`;if(!S.cellOverride[kl])S.cellOverride[kl]={...getCellRect(ri,ci-1)};S.cellOverride[kl].x1=nv;}
          break;
        case"x1":
          nv=Math.max(ov.x0+10,Math.min(S.imgW,Math.round((ev.clientX-r.left)/scX)));
          ov.x1=nv;
          if(ci<spec.cols-1){const kr=`${ri}_${ci+1}`;if(!S.cellOverride[kr])S.cellOverride[kr]={...getCellRect(ri,ci+1)};S.cellOverride[kr].x0=nv;}
          break;
        case"y0":
          nv=Math.max(0,Math.min(ov.y1-10,Math.round((ev.clientY-r.top)/scY)));
          ov.y0=nv;
          if(ri>0){const kt=`${ri-1}_${ci}`;if(!S.cellOverride[kt])S.cellOverride[kt]={...getCellRect(ri-1,ci)};S.cellOverride[kt].y1=nv;}
          break;
        case"y1":
          nv=Math.max(ov.y0+10,Math.min(S.imgH,Math.round((ev.clientY-r.top)/scY)));
          ov.y1=nv;
          if(ri<spec.rows-1){const kb=`${ri+1}_${ci}`;if(!S.cellOverride[kb])S.cellOverride[kb]={...getCellRect(ri+1,ci)};S.cellOverride[kb].y0=nv;}
          break;
      }
      drawGrid();updateCellSelHint();
    });
    h.addEventListener("pointerup",()=>{_drag=null;h.classList.remove("active");});
    h.addEventListener("pointercancel",()=>{_drag=null;h.classList.remove("active");});
  });
}

/* ─── DOM helper ─── */
function mk(tag,styles,text){
  const e=document.createElement(tag);
  if(styles) Object.assign(e.style,styles);
  if(text!=null) e.textContent=text;
  return e;
}

function updateCellSelHint(){
  const el=$("#cellSelHint"); if(!el||!S.selectedCell) return;
  const{ri,ci}=S.selectedCell;
  const spec=GRID_SPECS[S.grid];
  const{x0,y0,x1,y1}=getCellRect(ri,ci);
  const hasOv=!!S.cellOverride[`${ri}_${ci}`];
  el.textContent=`已選 #${ri*spec.cols+ci+1}${hasOv?" ★":""}  (${Math.round(x0)},${Math.round(y0)}) → (${Math.round(x1)},${Math.round(y1)})`;
}

/* ═══════════════════════════════════════════════════════════
   IMAGE CONTAINER BUILD / RESIZE
════════════════════════════════════════════════════════════ */
function buildImgCon(){
  const area=$("#canvasArea");
  // remove old
  const old=document.getElementById("imgCon");if(old)old.remove();
  // compute display size (fit in area — strip is already in sibling, area.clientWidth is correct)
  const pad=16;
  const maxW=area.clientWidth-pad*2,maxH=area.clientHeight-pad*2;
  const scale=Math.min(maxW/S.imgW,maxH/S.imgH,1);
  const dW=Math.round(S.imgW*scale),dH=Math.round(S.imgH*scale);

  const con=document.createElement("div");
  con.id="imgCon";
  con.style.cssText=`width:${dW}px;height:${dH}px;position:relative;` +
    `flex-shrink:0;overflow:visible;`;

  const img=document.createElement("img");
  img.src=URL.createObjectURL(S._imgFile);
  img.style.cssText="display:block;width:100%;height:100%;border-radius:6px;pointer-events:none";
  con.appendChild(img);
  area.appendChild(con);
  drawGrid();
}

/* ═══════════════════════════════════════════════════════════
   SLICING
════════════════════════════════════════════════════════════ */
function sliceToCells(){
  const spec=GRID_SPECS[S.grid];
  const base=document.createElement("canvas");
  base.width=S.imgW;base.height=S.imgH;
  base.getContext("2d").drawImage(S.img,0,0,S.imgW,S.imgH);

  const out=[];
  for(let ri=0;ri<spec.rows;ri++) for(let ci=0;ci<spec.cols;ci++){
    const{x0,y0,x1,y1}=getCellRect(ri,ci);
    const sx=Math.round(x0),sy=Math.round(y0),sw=Math.round(x1-x0),sh=Math.round(y1-y0);
    if(sw<4||sh<4)continue;
    const cell=document.createElement("canvas");cell.width=sw;cell.height=sh;
    cell.getContext("2d").drawImage(base,sx,sy,sw,sh,0,0,sw,sh);
    out.push({index:ri*spec.cols+ci,canvasRaw:cell});
  }
  slicedCells=out;processed=[];mainIdx=0;tabIdx=0;_useProc=false;

  // Auto detect bg from first cell
  if(slicedCells.length){
    const col=detectBgColor(slicedCells[0].canvasRaw);
    S.bgR=col.r;S.bgG=col.g;S.bgB=col.b;
    updateBgSwatch();
    $("#btnDetect").disabled=false;
  }

  renderThumbs(false);
  S.liveIdx=0;updateLive();
  $("#btnProcess").disabled=false;
  $("#btnZip").disabled=true;
}

/* ═══════════════════════════════════════════════════════════
   PROCESS
════════════════════════════════════════════════════════════ */
function processAll(){
  if(!slicedCells.length) return;
  processed=slicedCells.map(({index,canvasRaw})=>{
    // clone raw，去背後保留原始大小（不縮圖），縮圖只在下載 ZIP 時才做
    const clone=document.createElement("canvas");clone.width=canvasRaw.width;clone.height=canvasRaw.height;
    clone.getContext("2d").drawImage(canvasRaw,0,0);
    if(S.doRemoveBg) smartRemoveBg(clone);
    return{index,canvasOut:clone};
  });
  _useProc=true;
  renderThumbs(true);updateMtPreview();updateLive();
  $("#btnZip").disabled=false;
}

/* ═══════════════════════════════════════════════════════════
   RENDER THUMBS
════════════════════════════════════════════════════════════ */
function renderThumbs(useProc){
  const grid=$("#thumbGrid"),sec=$("#thumbStrip");
  grid.innerHTML="";
  const arr=useProc?processed:slicedCells;
  if(!arr.length){if(sec)sec.style.display="none";return;}
  if(sec)sec.style.display="flex";
  const startNo=parseInt($("#startNo").value||"1")||1;
  const spec=GRID_SPECS[S.grid];

  arr.forEach((item,i)=>{
    const src=useProc?item.canvasOut:item.canvasRaw;
    const ri=Math.floor(i/spec.cols),ci=i%spec.cols;
    const isSel=S.mode==="cell"&&S.selectedCell&&S.selectedCell.ri===ri&&S.selectedCell.ci===ci;
    const wrap=document.createElement("div");
    wrap.className="thumb"+(i===mainIdx?" is-main":"")+(i===tabIdx?" is-tab":"")+(isSel?" cell-sel":"");
    wrap.addEventListener("click",()=>{
      if(S.mode==="cell"){
        S.selectedCell={ri,ci};S.liveIdx=i;
        drawGrid();renderThumbs(useProc);updateCellSelHint();updateLive();
      }
    });
    const imgBox=document.createElement("div");imgBox.className="thumb-img";
    // 縮圖預覽：統一縮到 120px，不因原圖大小而縮放不一
    const THUMB_PX=120;
    const tScale=Math.min(THUMB_PX/src.width,THUMB_PX/src.height,1);
    const tw=Math.max(1,Math.round(src.width*tScale));
    const th=Math.max(1,Math.round(src.height*tScale));
    const cv=document.createElement("canvas");cv.width=tw;cv.height=th;
    cv.getContext("2d").drawImage(src,0,0,tw,th);imgBox.appendChild(cv);
    const meta=document.createElement("div");meta.className="thumb-meta";
    const num=document.createElement("div");num.className="thumb-num";
    num.textContent=String(startNo+i).padStart(2,"0");
    const picks=document.createElement("div");picks.className="thumb-picks";
    const bm=document.createElement("button");bm.type="button";
    bm.className="pick-btn"+(i===mainIdx?" main-on":"");bm.textContent="★";
    bm.onclick=e=>{e.stopPropagation();mainIdx=i;renderThumbs(useProc);updateMtPreview();};
    const bt=document.createElement("button");bt.type="button";
    bt.className="pick-btn"+(i===tabIdx?" tab-on":"");bt.textContent="◈";
    bt.onclick=e=>{e.stopPropagation();tabIdx=i;renderThumbs(useProc);updateMtPreview();};
    picks.appendChild(bm);picks.appendChild(bt);
    meta.appendChild(num);meta.appendChild(picks);
    wrap.appendChild(imgBox);wrap.appendChild(meta);
    grid.appendChild(wrap);
  });
}

function updateMtPreview(){
  const sec=$("#mtPreviewSec");
  if(!processed.length){sec.style.display="none";return;}
  sec.style.display="";
  function drawTo(cvId,src,W,H){
    const out=document.createElement("canvas");out.width=W;out.height=H;
    const ctx=out.getContext("2d");
    const s=fitContain(src.width,src.height,W,H);
    ctx.drawImage(src,s.x,s.y,s.w,s.h);
    const cv=$(cvId);cv.width=W;cv.height=H;
    cv.getContext("2d").clearRect(0,0,W,H);
    cv.getContext("2d").drawImage(out,0,0);
  }
  const mSrc=processed[mainIdx]?.canvasOut||processed[0].canvasOut;
  const tSrc=processed[tabIdx]?.canvasOut||processed[0].canvasOut;
  drawTo("#mainCv",mSrc,MAIN_SZ,MAIN_SZ);
  drawTo("#tabCv",tSrc,TAB_W,TAB_H);
}

function updateLive(){
  const cv=$("#liveCv");if(!cv) return;
  const idx=S.liveIdx;
  const rawCell=slicedCells[idx];
  if(!rawCell){cv.width=1;cv.height=1;return;}
  const clone=document.createElement("canvas");
  clone.width=rawCell.canvasRaw.width;clone.height=rawCell.canvasRaw.height;
  clone.getContext("2d").drawImage(rawCell.canvasRaw,0,0);
  if(S.doRemoveBg) smartRemoveBg(clone);
  // 縮放到最大 340px 高或寬，避免撐破版面但不縮得太小
  const MAX=340;
  const scale=Math.min(MAX/clone.width,MAX/clone.height,1);
  const pw=Math.round(clone.width*scale), ph=Math.round(clone.height*scale);
  cv.width=pw;cv.height=ph;
  cv.getContext("2d").clearRect(0,0,pw,ph);
  cv.getContext("2d").drawImage(clone,0,0,pw,ph);
  const li=$("#liveIdx");if(li)li.textContent=idx+1;
}

/* ═══════════════════════════════════════════════════════════
   ZIP
════════════════════════════════════════════════════════════ */
async function downloadZip(){
  if(!processed.length){alert("請先執行「去背並預覽」");return;}
  const start=parseInt($("#startNo").value||"1")||1;
  const zip=new JSZip();
  for(let i=0;i<processed.length;i++){
    // 下載時才縮放到 LINE 規格 370×320
    const final=resizeSticker(processed[i].canvasOut);
    zip.file(`${String(start+i).padStart(2,"0")}.png`,await canvasToPng(final));
  }
  function mkFixed(src,W,H){
    const out=document.createElement("canvas");out.width=W;out.height=H;
    const ctx=out.getContext("2d");
    const s=fitContain(src.width,src.height,W,H);
    ctx.drawImage(src,s.x,s.y,s.w,s.h);
    return out;
  }
  const mSrc=resizeSticker(processed[mainIdx]?.canvasOut||processed[0].canvasOut);
  const tSrc=resizeSticker(processed[tabIdx]?.canvasOut||processed[0].canvasOut);
  zip.file("main.png",await canvasToPng(mkFixed(mSrc,MAIN_SZ,MAIN_SZ)));
  zip.file("tab.png", await canvasToPng(mkFixed(tSrc,TAB_W,TAB_H)));

  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
  saveAs(blob,`LINE_stickers_${S.grid}.zip`);
}

/* ═══════════════════════════════════════════════════════════
   LOAD IMAGE
════════════════════════════════════════════════════════════ */
async function loadImage(file){
  S._imgFile=file;
  const url=URL.createObjectURL(file);
  const img=new Image();img.src=url;
  await img.decode().catch(()=>{});
  S.img=img;S.imgName=file.name;
  S.imgW=img.naturalWidth||img.width;S.imgH=img.naturalHeight||img.height;
  initLines();
  $("#emptyState").style.display="none";
  buildImgCon();
  $("#imgInfo").textContent=`${S.imgName}｜${S.imgW}×${S.imgH}`;
  slicedCells=[];processed=[];_useProc=false;
  $("#thumbGrid").innerHTML="";const _ts=$("#thumbStrip");if(_ts)_ts.style.display="none";
  $("#btnReset").disabled=false;$("#btnSlice").disabled=false;
  $("#btnProcess").disabled=true;$("#btnZip").disabled=true;
  $("#bgColorTxt").textContent="切割後自動偵測…";
  $("#btnDetect").disabled=true;
  S.bgDetected=false;
}

/* ═══════════════════════════════════════════════════════════
   BIND UI
════════════════════════════════════════════════════════════ */
function bindUI(){
  $("#yearTxt").textContent="© "+new Date().getFullYear();
  updateGridHint();

  $("#btnPick").onclick=()=>$("#fileBig").click();
  $("#fileBig").onchange=e=>{const f=e.target.files?.[0];if(f)loadImage(f);};

  $("#gridSeg").addEventListener("click",e=>{
    const b=e.target.closest(".segbtn");if(!b)return;
    $("#gridSeg").querySelectorAll(".segbtn").forEach(x=>x.classList.remove("is-on"));
    b.classList.add("is-on");S.grid=b.dataset.grid;
    slicedCells=[];processed=[];_useProc=false;
    $("#thumbGrid").innerHTML="";const _ts=$("#thumbStrip");if(_ts)_ts.style.display="none";
    if(S.img){initLines();buildImgCon();}
    updateGridHint();$("#btnProcess").disabled=true;$("#btnZip").disabled=true;
  });

  $("#modeSeg").addEventListener("click",e=>{
    const b=e.target.closest(".segbtn");if(!b)return;
    $("#modeSeg").querySelectorAll(".segbtn").forEach(x=>x.classList.remove("is-on"));
    b.classList.add("is-on");S.mode=b.dataset.mode;S.selectedCell=null;
    const chip=$("#modeChip");if(chip)chip.textContent=S.mode==="global"?"整欄整列":"單格微調";
    const hint=$("#modeHintTxt");
    if(hint)hint.textContent=S.mode==="global"
      ?"拖拉格線上的圓形把手移動整行/列。"
      :"在縮圖列點選格子，再拖拉畫布上的 4 個圓形把手調整邊界。";
    $("#cellInfoWrap").style.display=S.mode==="cell"?"":"none";
    if(S.img) drawGrid();
    if(slicedCells.length) renderThumbs(_useProc);
  });

  $("#btnReset").onclick=()=>{if(S.img){initLines();buildImgCon();}};
  $("#btnSlice").onclick=()=>{if(!S.img)return;sliceToCells();};

  $("#btnBgYes").onclick=()=>{
    S.doRemoveBg=true;
    $("#btnBgYes").classList.add("is-on");$("#btnBgNo").classList.remove("is-on");
    $("#bgAdvanced").style.display="";updateLive();
  };
  $("#btnBgNo").onclick=()=>{
    S.doRemoveBg=false;
    $("#btnBgNo").classList.add("is-on");$("#btnBgYes").classList.remove("is-on");
    $("#bgAdvanced").style.display="none";updateLive();
  };

  $("#btnDetect").onclick=()=>{
    if(!slicedCells.length)return;
    const col=detectBgColor(slicedCells[S.liveIdx]?.canvasRaw||slicedCells[0].canvasRaw);
    S.bgR=col.r;S.bgG=col.g;S.bgB=col.b;updateBgSwatch();updateLive();
  };

  function syncAdv(){
    S.bgThreshold=+$("#rt").value;S.edgeSoftness=+$("#rsoft").value;S.shrinkEdge=+$("#rerode").value;
    S.decontaminate=$("#chkDefringe").checked;S.spillSuppression=$("#chkSpill").checked;
    S.removeInternal=$("#chkHollow").checked;
    $("#vt").textContent=S.bgThreshold;$("#vsoft").textContent=S.edgeSoftness;
    $("#verode").textContent=S.shrinkEdge+"px";
    if(slicedCells.length) updateLive();
  }
  ["#rt","#rsoft","#rerode"].forEach(id=>$(id).addEventListener("input",syncAdv));
  ["#chkDefringe","#chkSpill","#chkHollow"].forEach(id=>$(id).addEventListener("change",syncAdv));

  $("#btnPrevLive").onclick=()=>{
    const arr=_useProc?processed:slicedCells;if(!arr.length)return;
    S.liveIdx=clamp(S.liveIdx-1,0,arr.length-1);updateLive();
  };
  $("#btnNextLive").onclick=()=>{
    const arr=_useProc?processed:slicedCells;if(!arr.length)return;
    S.liveIdx=clamp(S.liveIdx+1,0,arr.length-1);updateLive();
  };

  $("#btnProcess").onclick=processAll;
  $("#btnZip").onclick=downloadZip;
  window.addEventListener("resize",()=>{if(S.img)buildImgCon();});

  /* ── 上架資訊 Prompt 產生器 ── */
  function buildMetaPrompt(){
    const desc = (document.getElementById("metaDesc")?.value||"").trim()
                 || "可愛角色貼圖，日常生活與表情用語";
    return [
      "我有一套 LINE 貼圖，需要填寫上架資料，請幫我用口語自然的方式寫以下內容：",
      "",
      `貼圖內容：${desc}`,
      "",
      "請提供：",
      "1. 標題（英文）：40字以內，簡潔吸引人，適合 LINE 貼圖商店搜尋",
      "2. 標題（繁體中文）：40字以內",
      "3. 說明（英文）：160字以內，自然口語，描述貼圖適合的使用情境",
      "4. 說明（繁體中文）：160字以內",
      "5. 版權聲明：格式為 © [年份] [作者名]，簡短一行即可",
      "",
      "請直接給結果，不需要額外解釋。",
    ].join("\n");
  }

  const btnMetaGen  = document.getElementById("btnMetaGen");
  const btnMetaCopy = document.getElementById("btnMetaCopy");
  const metaOut     = document.getElementById("metaOut");

  if(btnMetaGen){
    btnMetaGen.addEventListener("click", ()=>{
      const p = buildMetaPrompt();
      if(metaOut) metaOut.value = p;
      if(btnMetaCopy) btnMetaCopy.disabled = false;
    });
  }
  if(btnMetaCopy){
    btnMetaCopy.addEventListener("click", async ()=>{
      const txt = metaOut?.value||""; if(!txt) return;
      try{ await navigator.clipboard.writeText(txt); }
      catch{ metaOut?.select(); document.execCommand("copy"); }
      const old = btnMetaCopy.textContent;
      btnMetaCopy.textContent = "✓ 已複製！";
      setTimeout(()=>btnMetaCopy.textContent=old, 1500);
    });
  }
  // 輸入時自動更新
  document.getElementById("metaDesc")?.addEventListener("input", ()=>{
    if(metaOut && metaOut.value) metaOut.value = buildMetaPrompt();
  });

}

function updateGridHint(){
  const spec=GRID_SPECS[S.grid];
  const h=$("#gridHint");
  if(h)h.textContent=`切割 ${spec.rows}×${spec.cols}（${spec.count}張）`;
}

document.addEventListener("DOMContentLoaded",()=>{
  updateBgSwatch();
  bindUI();
});
