/* ══════════════════════════════════════════════════
   linept3.js — LINE 動態貼圖 Prompt 生成器
══════════════════════════════════════════════════ */
const $ = s => document.querySelector(s);

/* ── State ── */
const ST = { roleSource:"ref_image", artStyle:"chibi" };

/* ── 畫風對照（文字描述角色時使用）── */
const STYLE_MAP = {
  chibi:   { label:"日系Q版（Chibi）",  prompt:"日系Q版可愛插畫風格、頭身比約1:1~1:2、大眼睛、表情誇張可愛，線條乾淨俐落、馬卡龍色系" },
  kawaii:  { label:"Kawaii 萌系",       prompt:"超可愛療癒風格、表情豐富、角色圓潤可愛、糖果粉嫩色系" },
  clay:    { label:"黏土公仔（3D）",    prompt:"Cute Clay Character Style、玩具模型質感、圓潤立體、3D Render品質" },
  storybook:{ label:"治癒系繪本",       prompt:"溫暖療癒故事書插畫感、奶油暖色調、柔和手繪線條" },
  fun_draw:{ label:"童趣手繪",          prompt:"彩色鉛筆筆觸、手繪塗鴉感、線條自然隨性但一致" },
};

/* ── 預設主題資料 ── */
const TOPICS = {
  "":{label:"── 請選擇主題 ──", f1:"",f2:"",f3:"",f4:"",f5:"",f6:""},
  shock:{
    label:"😱 驚嚇過度",
    f1:"平靜站立、眼神突然察覺異狀、眉頭微皺",
    f2:"雙眼開始睜大、嘴巴微張、雙手往臉靠近",
    f3:"雙眼極度睜大、雙手驚恐抱住腦袋、冒汗",
    f4:"嘴巴大張、背景出現震驚放射線、全身抖動",
    f5:"整身開始褪色變灰白、表情空洞呆滯",
    f6:"完全石化呈灰白色、頭頂冒出一縷可愛小靈魂飄起",
  },
  cheer:{
    label:"💪 加油打氣",
    f1:"一臉平靜、開始將頭巾拿在手上",
    f2:"一臉嚴肅充滿鬥志、雙手往頭上綁紅色必勝頭巾",
    f3:"頭巾綁好、雙手握拳放在胸前蓄力",
    f4:"身體微微後傾、雙拳用力緊握準備爆發",
    f5:"單拳開始往上揮、背景出現Q版火苗",
    f6:"單拳用力揮到最高點、背景熊熊火焰、泡泡字「加油！」",
  },
  agree:{
    label:"👍 點頭比讚",
    f1:"面帶微笑、保持正面站立",
    f2:"頭部微微向前傾斜開始點頭",
    f3:"頭部往下點到最低點、表情認真",
    f4:"頭部往上抬、閉眼幸福微笑",
    f5:"頭部後方有動態殘影線條、大力點頭感",
    f6:"挺胸自信伸出大拇指比讚、泡泡字「YES!」",
  },
  received:{
    label:"📱 收到了解",
    f1:"手機訊息通知音、眼神往手機方向看",
    f2:"拿起手機、眼神專注看螢幕",
    f3:"眉頭微皺閱讀中、手指點螢幕",
    f4:"點頭確認、表情若有所思",
    f5:"放下手機、嘴角上揚",
    f6:"比OK手勢對著前方、泡泡字「收到！」",
  },
  crying:{
    label:"😭 哭哭崩潰",
    f1:"站立、嘴角微微下垂、眼神黯淡",
    f2:"眼眶泛紅、低頭委屈、手握衣角",
    f3:"眼淚開始滑落、嘴巴扁掉、用手擦眼淚",
    f4:"大顆淚珠滾落、嘴巴大張哭出聲音",
    f5:"身體前傾彎腰大哭、淚水四散飛濺",
    f6:"趴倒在地大哭、淚水流成小河、背景烏雲閃電",
  },
  happy:{
    label:"🎉 開心跳躍",
    f1:"嘴角微微上揚、雙眼彎彎",
    f2:"開心微笑、雙手開始往上舉",
    f3:"雙腳微微離地、雙手高舉",
    f4:"雙腳完全離地跳起、衣服或裙擺飄動",
    f5:"跳到最高點、雙手比愛心",
    f6:"最高點、背景閃亮星星四射、泡泡字「耶！」",
  },
  think:{
    label:"💡 思考靈感",
    f1:"正常站立、開始歪頭",
    f2:"歪著頭、一手手指輕觸下巴",
    f3:"眼神往上看、眉頭微皺認真思考",
    f4:"頭頂冒出大大問號、表情更認真",
    f5:"眼神一亮、表情逐漸開朗",
    f6:"靈感乍現、頭頂閃亮燈泡、泡泡字「有了！」",
  },
  passing:{
    label:"🚶 飄過路過",
    f1:"從畫面左側露出一隻眼睛偷看",
    f2:"探出半個頭和兩隻眼睛、好奇張望",
    f3:"整身出現側身站立、眼神看向前方",
    f4:"開始移動、雙腳快速碎步走",
    f5:"走到畫面中央、身體持續移動",
    f6:"走出畫面右側、只剩揮動的手和後腳尾端",
  },
};

/* ── Seg clicks ── */
function setActive(groupEl, btn){
  groupEl.querySelectorAll(".segbtn").forEach(b=>b.classList.remove("is-on"));
  btn.classList.add("is-on");
}

function refreshRoleUI(){
  const rw=$("#refHintWrap"), cw=$("#customRoleWrap"), sw=$("#styleWrap");
  if(rw) rw.hidden = ST.roleSource !== "ref_image";
  if(cw) cw.hidden = ST.roleSource !== "custom_role";
  // 畫風選擇：只有「文字描述角色」時才顯示
  if(sw) sw.hidden = ST.roleSource !== "custom_role";
}

/* ── Topic select handler ── */
function applyTopic(selEl, prefix){
  const key = selEl.value;
  const t = TOPICS[key];
  if(!t) return;
  for(let i=1;i<=6;i++){
    const el=document.getElementById(prefix+i);
    if(el) el.value = t["f"+i]||"";
  }
  scheduleSync();
}

document.addEventListener("click", async e => {
  const sb = e.target.closest(".segbtn");
  if(sb){
    const g = sb.closest(".seg[data-group]"); if(!g) return;
    const key=g.dataset.group, val=sb.dataset.value;
    ST[key]=val; setActive(g,sb); refreshRoleUI(); scheduleSync(); return;
  }
  const sc = e.target.closest(".style-card3");
  if(sc){
    document.querySelectorAll(".style-card3").forEach(c=>c.classList.remove("is-on"));
    sc.classList.add("is-on");
    ST.artStyle=sc.dataset.style; scheduleSync(); return;
  }

  if(e.target.closest("#btnGen")||e.target.closest("#btnReset")){ syncPrompt(); return; }

  if(e.target.closest("#btnCopy")){
    const txt=$("#outAll")?.value||""; if(!txt) return;
    try{ await navigator.clipboard.writeText(txt); }
    catch{ $("#outAll")?.select(); document.execCommand("copy"); }
    const bc=$("#btnCopy"),old=bc.textContent;
    bc.textContent="✓ 已複製！"; setTimeout(()=>bc.textContent=old,1500); return;
  }

  const rc = e.target.closest(".rescue-copy");
  if(rc){
    const txt=rc.dataset.copy||"";
    try{ await navigator.clipboard.writeText(txt); }catch{}
    const old=rc.textContent; rc.textContent="✓"; setTimeout(()=>rc.textContent=old,1200); return;
  }

  if(e.target.closest("#rescueToggle")){
    const body=$("#rescueBody"), arr=$("#rescueArrow");
    const open=body.style.display!=="none";
    body.style.display=open?"none":"flex";
    if(!open){ body.style.flexDirection="column"; body.style.gap="6px"; }
    if(arr) arr.textContent=open?"▶":"▼";
  }
});

document.addEventListener("change", e => {
  if(e.target.id==="selA") applyTopic(e.target,"a");
});

/* ── Input sync ── */
let _t=null;
function scheduleSync(){ clearTimeout(_t); _t=setTimeout(syncPrompt,200); }
document.addEventListener("input", e=>{
  const ids=["customRole","a1","a2","a3","a4","a5","a6"];
  if(ids.includes(e.target.id)) scheduleSync();
});

/* ── Build Prompt ── */
function buildPrompt(){
  let roleBlock="";
  if(ST.roleSource==="ref_image"){
    roleBlock=[
      "角色來源：請完全依照生圖介面中上傳的參考圖生成。",
      "請保持臉型、髮型、服裝、線條風格、色彩風格與參考圖完全一致。",
      "兩列所有格子的主角必須是同一個角色，不可出現不同人物特徵或比例變形。",
    ].join("\n");
  } else {
    const desc=($("#customRole")?.value||"").trim()||"（請填寫角色描述）";
    const style=STYLE_MAP[ST.artStyle]||STYLE_MAP.chibi;
    roleBlock=[
      `角色來源：${desc}`,
      `畫風：${style.label}｜${style.prompt}`,
      "請保持臉型、髮型、服裝、畫風在所有格子中完全一致，不可出現不同人物特徵。",
    ].join("\n");
  }

  const tA=($("#selA")?.options[$("#selA").selectedIndex]?.text||"動畫主題").replace(/^[^\s]+\s/,"").trim();
  const frames=[];
  for(let i=1;i<=6;i++){
    frames.push((document.getElementById("a"+i)?.value||"").trim()||`第${i}格動作描述`);
  }

  return [
    "請幫我繪製一張 LINE 動態貼圖用的分鏡大圖。",
    "（請先完整閱讀所有說明後再開始繪製）",
    "",
    "【最重要限制——請先讀這段再開始繪製】",
    "・絕對禁止在任何格子周圍加上黑色邊框或格線",
    "・格子之間只用空白自然分隔，不可有任何分隔線、框線",
    "・背景必須是純白色（#ffffff），不可有漸層或陰影",
    "・禁止出現任何文字標號、頁碼、編號",
    "",
    "【版面規格】",
    "・整張畫面為橫式 3:2 比例（寬:高）",
    "・畫面嚴格分為 2 列 × 3 欄，共 6 個獨立正方形格子（逐幀動畫分鏡，由左至右、由上至下依序播放）",
    "・每格比例為 1:1（正方形），大小完全相等",
    "・格子之間不可混合不同格的場景或動作",
    "・每格四邊保留適當留白（至少 10px），利於裁切",
    "",
    "【背景設定】",
    "・每格背景必須是純白色（#ffffff）",
    "・不可有任何漸層、陰影、花紋，角色與背景邊界清晰銳利",
    "",
    "【角色設定（非常重要）】",
    roleBlock,
    "",
    `【逐幀動畫內容｜主題：${tA}】`,
    "（請閱讀所有 6 格說明後再開始繪製，確保動作連貫、幅度遞進）",
    "",
    `  第 1 列第 1 格：${frames[0]}`,
    `  第 1 列第 2 格：${frames[1]}`,
    `  第 1 列第 3 格：${frames[2]}`,
    `  第 2 列第 1 格：${frames[3]}`,
    `  第 2 列第 2 格：${frames[4]}`,
    `  第 2 列第 3 格：${frames[5]}`,
    "",
    "【逐幀動作連貫要求（非常重要）】",
    "・6 格是同一個連續動畫的逐幀分鏡，依序播放後需形成流暢動畫",
    "・相鄰兩格之間的動作差異要小而精準，不可跳躍式變化",
    "・每格角色的肢體姿勢、表情、手臂角度必須與前一格有明顯但自然的遞進",
    "・兩列是同一個動畫的上下排，第 2 列第 1 格緊接第 1 列第 3 格繼續",
    "・第 6 格（第 2 列第 3 格）為情緒最高潮，可加泡泡對話框文字",
    "",
    "【品質要求】",
    "・所有格子清晰銳利，無變形、無模糊、無錯字",
    "・每格可單獨裁切使用，符合 LINE 動態貼圖規格（最大 320×270px）",
    "",
    "【繪製前再次確認清單】",
    "・共 6 個正方形格子，2列×3欄 ✓",
    "・任何格子都沒有邊框或格線 ✓",
    "・背景純白色 #ffffff ✓",
    "・相鄰格動作自然連貫 ✓",
  ].join("\n");
}

function syncPrompt(){
  refreshRoleUI();
  const p=buildPrompt();
  const ta=$("#outAll"); if(ta) ta.value=p;
  const cp=$("#charCount"); if(cp) cp.textContent=p.length?`${p.length.toLocaleString()} 字元`:"";
  const bc=$("#btnCopy"); if(bc) bc.disabled=!p;
}

/* ── Populate topic selects ── */
function buildTopicSelects(){
  ["selA"].forEach(id=>{
    const sel=document.getElementById(id); if(!sel) return;
    Object.entries(TOPICS).forEach(([key,{label}])=>{
      const opt=document.createElement("option");
      opt.value=key; opt.textContent=label;
      sel.appendChild(opt);
    });
  });
}

/* ── Tooltip ── */
function initTooltip(){
  const tip=document.getElementById("tooltip-global"); if(!tip) return;
  document.querySelectorAll(".info-icon[data-tip]").forEach(el=>{
    el.addEventListener("mouseenter",ev=>{
      tip.textContent=el.dataset.tip||""; tip.style.display="block"; pos(ev);
    });
    el.addEventListener("mousemove",pos);
    el.addEventListener("mouseleave",()=>tip.style.display="none");
  });
  function pos(ev){
    const pad=10,tw=tip.offsetWidth,th=tip.offsetHeight;
    let x=ev.clientX+14,y=ev.clientY+14;
    if(x+tw>window.innerWidth-pad) x=ev.clientX-tw-10;
    if(y+th>window.innerHeight-pad) y=ev.clientY-th-10;
    tip.style.left=x+"px"; tip.style.top=y+"px";
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  buildTopicSelects();
  syncPrompt();
  initTooltip();
});
