const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STATE = {
  contentMode: "role_text",   // role_text | role_only | text_only
  grid: "5x4",                // 3x3 | 5x4
  roleSource: "ref_image",    // ref_image | custom_role
  topic: "daily",             // daily | greeting | festival
  style: "cute_q",            // 7 styles
};

// 尺寸定案（你要求：自動切換模板）
const GRID_SPECS = {
  "5x4": { w: 2560, h: 1664, rows: 4, cols: 5, count: 20, cellW: 512, cellH: 416 },
  "3x3": { w: 1536, h: 1536, rows: 3, cols: 3, count: 9,  cellW: 512, cellH: 512 },
};

const TOPIC_TEXTS = {
  daily: [
    "收到","OK","謝謝","辛苦了","稍等一下","晚點回","沒問題","了解","好喔",
    "我先忙","等等我","抱歉","已處理","可以","不行","再說","哈哈","哭哭","傻眼","加油"
  ],
  greeting: [
    "早安","午安","晚安","嗨","在嗎","忙嗎","辛苦了","我來了","下班啦",
    "週末愉快","保重","晚點聊","先這樣","掰掰","改天約","請多指教","哈囉","有空嗎","早～","晚安安"
  ],
  festival: [
    "新年快樂","恭喜發財","紅包拿來","平安喜樂","心想事成",
    "春節快樂","走春中","開工大吉","元宵快樂",
    "清明安康","端午安康","粽子吃起來","好運連連","福氣滿滿","財運旺旺",
    "闔家平安","旅途平安","團圓時光","吉祥如意","萬事順心"
  ],
};

// 畫風描述（中文為主，適合 GPT/Gemini）
const STYLE_MAP = {
  cute_q: {
    name: "可愛Q版",
    prompt: "Q版可愛貼圖風格，頭大身小，線條清楚，色彩簡單，表情誇張可愛",
    negative: "寫實、照片感、擬真材質、3D、複雜背景、過度陰影"
  },
  photo_real: {
    name: "照片寫實",
    prompt: "照片寫實感，自然光，清晰細節，乾淨背景，仍需保留貼圖清楚可讀性",
    negative: "卡通線稿、過度Q版、誇張變形、雜亂背景、噪點、模糊"
  },
  toy_3d: {
    name: "3D公仔",
    prompt: "3D玩具公仔風格，圓潤可愛，柔和光影，材質乾淨，像公仔模型",
    negative: "2D線稿、照片噪點、背景複雜、金屬硬反光、文字模糊"
  },
  kids_book: {
    name: "童畫繪本",
    prompt: "溫馨童書繪本風格，柔和色調，溫暖筆觸，療癒感",
    negative: "硬邊寫實、強烈對比、商業硬光、背景雜訊、3D擬真"
  },
  fun_draw: {
    name: "童趣手繪",
    prompt: "童趣手繪塗鴉風，線條隨性但一致，簡單配色，表情可愛",
    negative: "精緻渲染、照片感、背景複雜、過度陰影、3D"
  },
  ink_style: {
    name: "古風水墨",
    prompt: "古風水墨風格，宣紙質感，留白，淡彩，筆觸自然",
    negative: "霓虹現代、3D、寫實照片、背景雜亂、過度銳利"
  },
  warm_anime: {
    name: "吉卜力氛圍",
    prompt: "日系溫暖動畫氛圍，治癒感，柔和光影，乾淨背景（不使用任何商標或角色）",
    negative: "照片寫實、商業硬光、背景繁雜、過度銳利、擬真材質"
  }
};

function bindSegGroups(){
  $$(`.seg[data-group]`).forEach(group=>{
    group.addEventListener("click", (e)=>{
      const btn = e.target.closest(".segbtn");
      if(!btn) return;
      const key = group.dataset.group;
      const value = btn.dataset.value;

      // 單選切換
      group.querySelectorAll(".segbtn").forEach(b=>b.classList.remove("is-on"));
      btn.classList.add("is-on");

      STATE[key] = value;

      refreshUI();
    });
  });
}

function bindStyleCards(){
  const grid = $("#styleGrid");
  if(!grid) return;

  grid.addEventListener("click", (e)=>{
    const card = e.target.closest(".style-card");
    if(!card) return;

    const styleKey = card.dataset.style;
    if(!styleKey) return;

    // UI：單選
    grid.querySelectorAll(".style-card").forEach(c=>c.classList.remove("is-on"));
    card.classList.add("is-on");

    // STATE
    STATE.style = styleKey;

    refreshUI();
  });
}


function refreshUI(){
  // 顯示尺寸提示
  const spec = GRID_SPECS[STATE.grid];
  $("#sizeHint").textContent =
    `自動切換尺寸：${spec.w} × ${spec.h}｜排列：${spec.rows}×${spec.cols}｜共 ${spec.count} 張｜每格約 ${spec.cellW}×${spec.cellH}（無格線、留白裁切友善）`;

  // 角色來源顯示/隱藏
  const uploadWrap = $("#uploadWrap");
  const customRoleWrap = $("#customRoleWrap");
  if(STATE.roleSource === "ref_image"){
    uploadWrap.hidden = false;
    customRoleWrap.hidden = true;
  }else{
    uploadWrap.hidden = true;
    customRoleWrap.hidden = false;
  }

  // 畫風提示
  const s = STYLE_MAP[STATE.style] || STYLE_MAP.cute_q;
  $("#styleHint").textContent = `風格描述：${s.prompt}`;
}

function parseCustomTexts(){
  const raw = ($("#customTexts").value || "").trim();
  if(!raw) return [];
  return raw
    .split(/[\n,，、]+/g)
    .map(s=>s.trim())
    .filter(Boolean);
}

function buildTextsList(){
  const spec = GRID_SPECS[STATE.grid];
  const need = spec.count;
  const base = TOPIC_TEXTS[STATE.topic] || TOPIC_TEXTS.daily;
  const custom = parseCustomTexts();

  const list = [];
  custom.forEach(t=>{
    if(list.length < need) list.push(t);
  });

  for(const t of base){
    if(list.length >= need) break;
    if(!list.includes(t)) list.push(t);
  }

  while(list.length < need){
    list.push(`文字${list.length+1}`);
  }

  return list;
}

function topicName(){
  if(STATE.topic === "daily") return "日常用語";
  if(STATE.topic === "greeting") return "打招呼";
  return "年節（半年內常見）";
}

function modeLine(){
  if(STATE.contentMode === "role_only"){
    return "內容模式：主角貼圖（以動作/表情/情緒為主，不一定要文字）。";
  }
  if(STATE.contentMode === "text_only"){
    return "內容模式：純文字貼圖（大字短句為主，可搭配小圖示點綴，但以可讀性為優先）。";
  }
  return "內容模式：主角 + 文字（每格都有主角動作與大字短句，手機一眼可讀）。";
}

function buildPrompt(){
  const spec = GRID_SPECS[STATE.grid];
  const style = STYLE_MAP[STATE.style] || STYLE_MAP.cute_q;

  const roleName = ($("#roleName").value || "").trim();

  // 尺寸 + 佈局（關鍵：自動切換）
  const layoutBlock = [
    `整體畫面為單一大圖，尺寸為 ${spec.w} × ${spec.h} px，橫向或正方形構圖均可（以此尺寸為準）。`,
    `請將畫面清楚等分排列為 ${spec.rows} 橫排 × ${spec.cols} 直欄，共 ${spec.count} 張貼圖（無任何格線或框線）。`,
  ].join("\n");

  // 白底（利於後續去背）
  const bgBlock = [
    "背景設定：背景需為乾淨、單一、接近純白的顏色，不可有紋理、陰影或雜訊，以利後續裁切與去背。",
  ].join("\n");

  // 裁切安全（10px 概念）
  const safeBlock = [
    "貼圖配置與留白：每一張貼圖內容必須置中呈現。",
    "請在每張貼圖四邊預留約 10px 的安全留白空間，避免角色或文字貼齊邊界，以確保裁切安全。",
    "可讀性：文字要大、清晰、對比足夠，避免小字與模糊。",
  ].join("\n");

  // 角色來源
  let roleBlock = "";
  if(STATE.roleSource === "ref_image"){
    roleBlock = "角色來源：以上傳參考圖為準（若工具支援參考圖/一致性，請使用同一張圖保持角色一致）。";
  }else{
    const customRole = ($("#customRole").value || "").trim() || "（請描述角色，例如：7歲小女孩，短髮，戴眼鏡，背小書包）";
    roleBlock = `角色來源：自訂角色。角色描述：${customRole}`;
  }

  // 文字清單
  const texts = buildTextsList();
  const textBlock =
    (STATE.contentMode === "role_only")
      ? `請依序呈現 ${spec.count} 個不同情緒/動作，表情動作要一秒理解，且不可重複。`
      : `文字清單（依序）：\n${texts.slice(0, spec.count).map((t,i)=>`${i+1}. ${t}`).join("\n")}`;

  // 文字/主角比例與描邊（偏實務）
  const typographyBlock = [
    "文字設計：語言為台灣繁體中文。",
    "單張貼圖中，主角約佔 60%，文字約佔 40%，文字不可遮擋臉部。",
    "為提升可讀性：文字與主角外圍可加入細薄深色描邊，外層再包覆柔和的白色外框。",
  ].join("\n");

  // 避免重複
  const uniqueness = "嚴禁重複：所有貼圖的姿勢、表情與文字組合不可重複，角色外型、畫風與比例需保持一致。";

  const prompt = [
    "【Prompt】",
    "請生成 LINE 貼圖用圖像（繁體中文）。",
    `主題：${topicName()}`,
    modeLine(),
    roleName ? `主角名稱：${roleName}` : null,
    roleBlock,
    `畫風：${style.name}。風格描述：${style.prompt}`,
    "",
    layoutBlock,
    bgBlock,
    safeBlock,
    typographyBlock,
    uniqueness,
    "",
    textBlock,
  ].filter(Boolean).join("\n\n");

  const negative = [
    "【Negative Prompt】",
    "避免生成：複雜背景、場景雜訊、漸層背景、格線或框線、主體貼邊、裁切吃到內容、文字模糊、小字、低解析、噪點。",
    `依畫風補充：${style.negative}`,
  ].join("\n");

  return `${prompt}\n\n${negative}\n`;
}

function setupUploader(){
  const input = $("#fileInput");
  const pick = $("#btnPick");
  const drop = $("#dropZone");
  const wrap = $("#previewWrap");
  const img = $("#previewImg");
  const meta = $("#previewMeta");
  const clear = $("#btnClear");

  pick.addEventListener("click", ()=> input.click());

  function showFile(file){
    if(!file) return;
    const url = URL.createObjectURL(file);
    img.src = url;
    wrap.hidden = false;
    meta.textContent = `${file.name}｜${Math.round(file.size/1024)} KB`;
  }

  input.addEventListener("change", (e)=>{
    const file = e.target.files?.[0];
    showFile(file);
  });

  ["dragenter","dragover"].forEach(ev=>{
    drop.addEventListener(ev, (e)=>{
      e.preventDefault();
      drop.classList.add("is-over");
    });
  });
  ["dragleave","drop"].forEach(ev=>{
    drop.addEventListener(ev, (e)=>{
      e.preventDefault();
      drop.classList.remove("is-over");
    });
  });
  drop.addEventListener("drop", (e)=>{
    const file = e.dataTransfer?.files?.[0];
    if(file){
      input.files = e.dataTransfer.files;
      showFile(file);
    }
  });

  clear.addEventListener("click", ()=>{
    input.value = "";
    wrap.hidden = true;
    img.src = "";
    meta.textContent = "";
  });
}

async function copyOut(){
  const all = ($("#outAll").value || "").trim();
  if(!all){
    alert("目前沒有內容可複製，請先產生 Prompt。");
    return;
  }

  try{
    await navigator.clipboard.writeText(all);
    $("#btnCopy").textContent = "已複製 ✅";
    setTimeout(()=>$("#btnCopy").textContent="一鍵複製", 1200);
  }catch{
    $("#outAll").focus();
    $("#outAll").select();
    alert("瀏覽器不允許剪貼簿，已幫你選取文字，請 Ctrl/Cmd + C 複製。");
  }
}

function init(){
  bindSegGroups();
  bindStyleCards();
  setupUploader();
  
  $("#btnGen").addEventListener("click", ()=>{
    const out = buildPrompt();
    $("#outAll").value = out;
    $("#btnCopy").disabled = false;
  });

  $("#btnCopy").addEventListener("click", copyOut);

  $("#year").textContent = new Date().getFullYear();

  // 初始提示
  refreshUI();
}

init();
