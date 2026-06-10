/* ══════════════════════════════════════════
   DATA
══════════════════════════════════════════ */
const PACKS = {
  "3x3":{ rows:3, cols:3, count:9,  w:1536, h:1536, cellW:512, cellH:512, textCount:8  },
  "5x5":{ rows:5, cols:5, count:25, w:2560, h:2560, cellW:512, cellH:512, textCount:24 },
};

// 預設文字清單
const TOPIC_TEXTS = {
  daily_greet:[
    "收到","OK","謝謝","辛苦了","稍等一下","晚點回","沒問題","了解",
    "好喔","在嗎","掰掰","哈囉","早安","晚安","加油","抱抱",
    "有空嗎","保重","嗨","我先忙","等等我","哭哭","哈哈","確認"
  ],
  work:[
    "收到","了解","好的","馬上處理","想一下","不太行","再確認","搞定了",
    "辛苦了","拜託啦","感謝","晚點回","提時間","太棒了","沒問題","已處理",
    "稍等一下","交給我","可以","不行","再說","繼續加油","我先忙","確認中"
  ],
};

// 純主角無文字模式：主題情境說明
const ROLE_ONLY_GUIDE = {
  daily_greet:"日常打招呼情境：揮手、招手、微笑點頭、眨眼、比心、打氣手勢、抱抱姿勢、喝咖啡、看手機、伸懶腰、喜悅跳躍、疲憊攤倒、比讚、傻眼等。",
  work:       "職場日常情境：敲鍵盤打電腦、拿手機看訊息、思考抓頭、比OK手勢、舉手發言、鞠躬道歉、加油握拳、拿文件、開會點頭、看時鐘等。",
  custom:     "自訂主題：情緒與動作表達豐富，包含開心、疑惑、驚訝、疲累、專注等表情，以及揮手、思考、比讚、舉手、鞠躬等動作。",
};

// 畫風對照表（label/prompt 隨畫風變動；line/color/quality 各款獨立）
const STYLE_MAP = {
  chibi:{
    label:"日系Q版（Chibi）",
    prompt:"日系Q版可愛插畫風格、頭身比約1:1~1:2、大眼睛、表情誇張可愛、日本LINE官方貼圖感",
    line:"線條乾淨俐落、輪廓清晰、邊緣銳利",
    color:"馬卡龍色系、柔和明亮、色彩統一",
    quality:"高解析度、清晰銳利、商業級貼圖品質",
  },
  kawaii:{
    label:"Kawaii 萌系",
    prompt:"超可愛療癒風格、表情豐富、角色圓潤可愛、貼圖商店熱門風格",
    line:"圓潤簡潔線條、高辨識度",
    color:"糖果色系、粉嫩色系",
    quality:"高解析度、LINE熱銷貼圖風格",
  },
  korean:{
    label:"韓系簡約",
    prompt:"Korean Minimal Illustration、文青感、簡潔時尚、生活風格插畫",
    line:"極簡線條、乾淨輪廓、留白充足",
    color:"莫蘭迪色系、低飽和度、柔和高級感",
    quality:"高解析度、簡潔精緻、設計感強",
  },
  clay:{
    label:"黏土公仔（3D）",
    prompt:"Cute Clay Character Style、玩具模型質感、Q版公仔風格、收藏品感",
    line:"圓潤輪廓、立體雕塑感",
    color:"糖果色系、柔和色彩、色調統一",
    quality:"高解析度、3D Render品質、材質細膩",
  },
  storybook:{
    label:"治癒系繪本",
    prompt:"溫暖療癒、故事書插畫感、親和力高",
    line:"柔和手繪線條、筆觸自然",
    color:"奶油色系、暖色調、低對比",
    quality:"高解析度、溫馨質感",
  },
  chinese_modern:{
    label:"新中式插畫",
    prompt:"現代設計融合東方元素、文創品牌風格、高級感插畫",
    line:"乾淨流暢、現代感線條",
    color:"東方莫蘭迪色系、低彩度國風配色",
    quality:"高解析度、商業廣告等級品質",
  },
  fun_draw:{
    label:"童趣手繪",
    prompt:"兒童繪本風格、彩色鉛筆筆觸、手繪塗鴉感",
    line:"自然手繪線條、不規則筆觸",
    color:"柔和彩色系、溫暖配色",
    quality:"高解析度、手繪質感",
  },
};

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
const ST = {
  contentMode:"role_text",
  packSize:"5x5",
  roleSource:"ref_image",
  topic:"daily_greet",
  style:"chibi",
};
const $ = q => document.querySelector(q);
const spec = () => PACKS[ST.packSize];

/* ══════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════ */
const TOPIC_NAMES = {
  daily_greet:"日常用語 / 打招呼",
  work:       "職場情境用語",
  custom:     "其他（自訂主題）",
};

function refreshUI(){
  const s = spec();

  const sh = $("#sizeHint");
  if(sh) sh.textContent =
    `建議大圖：${s.w}×${s.h}（每格 ${s.cellW}×${s.cellH}，${s.count} 張）。` +
    `AI 若輸出標準尺寸，Page 2 會自動裁正後切割。`;

  const mh = $("#modeHint");
  if(mh) mh.textContent = ST.contentMode === "role_only"
    ? `純主角版：用表情 / 姿勢 / 道具表達情境，全部 ${s.count} 張均禁止出現任何文字。`
    : `主角 + 文字版：前 ${s.textCount} 張顯示指定文字，第 ${s.count} 張為 Tab（無文字、主角正面可愛表情）。`;

  const tb = $("#textBlock");
  if(tb) tb.hidden = ST.contentMode !== "role_text";

  // 自訂主題輸入框顯示/隱藏
  const ctw = $("#customTopicWrap");
  if(ctw) ctw.hidden = ST.topic !== "custom";

  const th = $("#textHint");
  if(th){
    if(ST.topic === "custom"){
      th.textContent = `自訂主題：可填寫貼圖文字（${s.textCount} 則），或留空讓 AI 依主題自動生成。`;
    } else {
      th.textContent = `已自動填入「${TOPIC_NAMES[ST.topic]}」預設文字 ${s.textCount} 則，可自行修改。`;
    }
  }

  const toph = $("#topicHint");
  if(toph){
    toph.textContent = ST.topic === "custom"
      ? "請填入自訂主題名稱；文字清單可填可不填（不填則 AI 依主題自動生成）"
      : "";
  }

  const rw = $("#refHintWrap"), cw = $("#customRoleWrap");
  if(rw) rw.hidden = ST.roleSource !== "ref_image";
  if(cw) cw.hidden = ST.roleSource !== "custom_role";
}

function applyTopicTexts(force = false){
  const el = $("#textList");
  if(!el) return;
  if(ST.topic === "custom"){
    // 切換到「其他」時清空文字清單
    if(force) el.value = "";
    return;
  }
  if(ST.contentMode !== "role_text") return;
  const arr = (TOPIC_TEXTS[ST.topic] || []).slice(0, spec().textCount);
  if(force || !el.value.trim()){
    el.value = arr.join("\n");
  }
}


/* ══════════════════════════════════════════
   PROMPT BUILD
══════════════════════════════════════════ */
function buildPrompt(){
  const s = spec();
  const style = STYLE_MAP[ST.style] || STYLE_MAP.cute_q;
  const roleName = ($("#roleName")?.value || "").trim();
  const customTopicName = ($("#customTopicName")?.value || "").trim();

  // 角色區塊
  let roleBlock = "";
  if(ST.roleSource === "ref_image"){
    roleBlock = "角色來源：請依照生圖介面中上傳的參考圖生成，保持臉型、髮型、服裝、比例完全一致，不可出現不同人物特徵。";
  } else {
    const desc = ($("#customRole")?.value || "").trim() || "（請填寫角色描述）";
    roleBlock = `角色來源：${desc}`;
  }
  if(roleName) roleBlock += `\n角色名稱：${roleName}`;
  roleBlock += "\n請保持每格角色臉型、髮型、服裝、比例完全一致，不可出現不同人物特徵。";

  const roleNameLine = roleName ? `（角色名稱：${roleName}）` : "";

  // 主題名稱
  const topicDisplayName = ST.topic === "custom"
    ? (customTopicName || "自訂主題")
    : TOPIC_NAMES[ST.topic];

  // 版面規格
  const layoutBlock = [
    "【版面設定】",
    "・輸出為「單一大圖」，正方形比例 1:1",
    `・建議尺寸：${s.w} × ${s.h} px（若 AI 工具限制尺寸，維持正方形 1:1 即可）`,
    `・畫面平均分割為 ${s.rows} × ${s.cols} 格，共 ${s.count} 張`,
    "・每格大小完全一致、間距平均、對齊精準",
    "・嚴禁任何格線、框線、分隔線出現在畫面上",
    "・每格四邊保留充足留白（至少 40px 安全邊距），確保角色與鄰近格子之間有明顯間隔，手勢、泡泡框、裝飾元素絕對不可超出格子範圍或碰觸到鄰近格子",
    "・每格構圖不重疊、不裁切主角",
    "・每格的角色構圖建議採用「直式」（角色高度大於寬度），不要讓角色填滿整個格子的寬度，左右需保留足夠空間",
    "・泡泡對話框、裝飾圖示必須在格子留白範圍內，不可靠近格子邊緣",
  ].join("\n");

  // 背景設定
  const bgBlock = [
    "【背景設定】",
    "・每格背景使用純綠幕色（#00FF00 / 純綠色 Chroma Key），不可有任何漸層、陰影、光暈，角色與背景之間邊界必須清晰",
    "・禁止使用白色或其他顏色背景",
    "・無陰影、無雜訊、無漸層背景",
    "・此設定是為了後製去背使用，請嚴格執行",
  ].join("\n");

  // 畫風（line/color/quality 各款獨立）
  const styleBlock = [
    "【畫風設定】",
    `・畫風：${style.label}`,
    `・風格描述：${style.prompt}`,
    `・線條：${style.line}`,
    `・色彩：${style.color}`,
    `・品質：${style.quality}`,
  ].join("\n");

  // 角色一致性
  const charBlock = [
    "【角色一致性（非常重要）】",
    roleBlock,
    "・角色為同一人，不可出現不同人物特徵或比例變形",
    "・每格需呈現不同表情（開心、疑惑、驚訝、疲累、專注等）",
    "・每格需呈現不同動作（姿勢、手勢、情緒道具等）",
  ].join("\n");

  // 裝飾元素
  const decoBlock = [
    "【裝飾元素】",
    "・可加入小圖示點綴：愛心、星星、燈泡、汗滴、感嘆號、音符等",
    "・裝飾僅作點綴，不可干擾主角主體",
    "・可加入簡單情境道具（筆電、手機、文件、咖啡杯等）",
  ].join("\n");

  // 品質要求
  const qualityBlock = [
    "【品質要求】",
    "・所有貼圖清晰銳利，無變形、無模糊",
    "・每格可單獨裁切使用（符合 LINE 貼圖用途）",
    "・角色比例與樣式在每格保持高度一致",
  ].join("\n");

  /* ── 純主角版（無文字）── */
  if(ST.contentMode === "role_only"){
    let guide = ROLE_ONLY_GUIDE[ST.topic] || ROLE_ONLY_GUIDE.daily_greet;
    if(ST.topic === "custom" && customTopicName){
      guide = `自訂主題「${customTopicName}」情境：請依此主題設計豐富的動作與表情，情境需符合主題氛圍，每格不重複。`;
    }
    return [
      `請生成一張 LINE 貼圖合集大圖，主題為「${topicDisplayName}」貼圖（純主角版，畫面中不得出現任何文字）。\n`,
      layoutBlock, "",
      bgBlock, "",
      styleBlock, "",
      charBlock, "",
      "【主題情境（用動作與表情表達，嚴禁文字）】",
      guide,
      `・第 ${s.count} 張（最後一格）為 Tab 候選：主角正面可愛表情、構圖置中清楚，不含任何文字或裝飾`, "",
      decoBlock, "",
      qualityBlock, "",
      "【禁止事項】",
      "・畫面中絕對禁止出現任何文字、數字、符號、對話框文字、路牌文字、衣服印字、Logo、水印",
      "・禁止出現格線或分隔線",
      "・禁止出現白色背景或非綠幕背景",
    ].join("\n");
  }

  /* ── 主角 + 文字版 ── */
  const rawLines = ($("#textList")?.value || "")
    .trim().split("\n").map(l => l.trim()).filter(Boolean).slice(0, s.textCount);
  const hasUserText = rawLines.length > 0;

  let textListBlock = "";
  let textRuleBlock = "";

  if(hasUserText){
    // 使用者有填文字清單
    const texts = rawLines;
    const textJoined = texts.join("、");
    textListBlock = [
      `【貼圖文字清單（前 ${s.textCount} 格依序各顯示一則）】`,
      `全部文字：${textJoined}`,
      "",
      "對應順序：",
      ...texts.map((t, i) => `  第 ${i+1} 格：「${t}」`),
      `  第 ${s.count} 格（Tab）：不顯示任何文字，僅呈現主角正面可愛表情`,
    ].join("\n");

    textRuleBlock = [
      "【文字規則（非常重要）】",
      `・前 ${s.textCount} 格各顯示一則指定文字（如上方清單），第 ${s.count} 格 Tab 無文字`,
      "・文字必須逐字原樣顯示，不可改寫、同義替換、翻譯或省略",
      "・必須使用台灣繁體中文（嚴禁簡體字）",
      "・字體風格：可愛手寫風或圓潤字體，清晰銳利，不可模糊",
      "・文字顏色多元（藍、粉、橘、綠等），可搭配對話泡泡框",
      "・文字與角色主體不可重疊，排版自然（上方 / 側邊 / 下方均可）",
      "・部分文字可放在泡泡框或對話框內，部分可直接排版（視情境而定）",
    ].join("\n");
  } else {
    // 使用者沒有填文字清單
    if(ST.topic === "custom"){
      // 自訂主題 + 無文字清單 → 請 AI 依主題生成
      const topicHint = customTopicName
        ? `依使用者自訂貼圖主題：「${customTopicName}」，依主題由 AI 提供適合的情境，並為每格設計對應的情境文字，每則情境文字字數不可超過 5 個字，必須使用台灣繁體中文。`
        : `使用者未指定主題，請以「日常生活與情緒表達」為主題，為每格設計對應的情境文字，每則情境文字字數不可超過 5 個字，必須使用台灣繁體中文。`;
      textListBlock = [
        `【貼圖文字（由 AI 依主題生成）】`,
        topicHint,
        `・共需生成 ${s.textCount} 則不同文字（每格各一則），第 ${s.count} 格 Tab 無文字`,
        "・每則文字需符合貼圖使用情境，自然口語、簡短有力",
      ].join("\n");
    } else {
      // 預設主題 + 無文字清單 → 自動帶入預設
      const fallback = (TOPIC_TEXTS[ST.topic] || TOPIC_TEXTS["daily_greet"]).slice(0, s.textCount);
      const textJoined = fallback.join("、");
      textListBlock = [
        `【貼圖文字清單（前 ${s.textCount} 格依序各顯示一則）】`,
        `全部文字：${textJoined}`,
        "",
        "對應順序：",
        ...fallback.map((t, i) => `  第 ${i+1} 格：「${t}」`),
        `  第 ${s.count} 格（Tab）：不顯示任何文字，僅呈現主角正面可愛表情`,
      ].join("\n");
    }

    textRuleBlock = [
      "【文字規則（非常重要）】",
      `・前 ${s.textCount} 格各顯示一則文字，第 ${s.count} 格 Tab 無文字`,
      "・必須使用台灣繁體中文（嚴禁簡體字）",
      "・字體風格：可愛手寫風或圓潤字體，清晰銳利，不可模糊",
      "・文字顏色多元（藍、粉、橘、綠等），可搭配對話泡泡框",
      "・文字與角色主體不可重疊，排版自然（上方 / 側邊 / 下方均可）",
    ].join("\n");
  }

  return [
    `請生成一張高品質 LINE 貼圖合集大圖，主題為「${topicDisplayName}」${roleNameLine}，風格一致、${style.label} 畫風。\n`,
    layoutBlock, "",
    bgBlock, "",
    styleBlock, "",
    charBlock, "",
    textListBlock, "",
    textRuleBlock, "",
    decoBlock, "",
    qualityBlock,
  ].filter(v => v !== null && v !== undefined && v !== "").join("\n");
}

/* ══════════════════════════════════════════
   LIVE SYNC — 任何輸入變動都重新產生
══════════════════════════════════════════ */
let _syncTimer = null;
function scheduleSync(){
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(syncPrompt, 180);
}
function syncPrompt(){
  const p = buildPrompt();
  const ta = $("#outAll");
  if(ta) ta.value = p;
  const cp = $("#charCount"); if(cp) cp.textContent = p.length ? `${p.length.toLocaleString()} 字元` : "";
  const bc = $("#btnCopy"); if(bc) bc.disabled = !p;
}

/* ══════════════════════════════════════════
   EVENTS
══════════════════════════════════════════ */
function setActive(groupEl, btn){
  groupEl.querySelectorAll(".segbtn").forEach(b => b.classList.remove("is-on"));
  btn.classList.add("is-on");
}

document.addEventListener("click", async e => {
  const sb = e.target.closest(".segbtn");
  if(sb){
    const g = sb.closest(".seg[data-group]");
    if(!g) return;
    const key = g.dataset.group, val = sb.dataset.value;
    if(!key || !val) return;
    ST[key] = val;
    setActive(g, sb);
    refreshUI();
    if(["topic","packSize","contentMode"].includes(key)){
      applyTopicTexts(true);
    }
    scheduleSync();
    return;
  }

  const sc = e.target.closest(".style-card");
  if(sc){
    document.querySelectorAll(".style-card").forEach(c => c.classList.remove("is-on"));
    sc.classList.add("is-on");
    ST.style = sc.dataset.style;
    scheduleSync();
    return;
  }

  if(e.target.closest("#btnGen")){
    syncPrompt();
    return;
  }

  if(e.target.closest("#btnReset")){
    syncPrompt();
    return;
  }

  if(e.target.closest("#btnCopy")){
    const txt = $("#outAll")?.value || "";
    if(!txt) return;
    try{ await navigator.clipboard.writeText(txt); }
    catch{ $("#outAll")?.select(); document.execCommand("copy"); }
    const bc = $("#btnCopy"), old = bc.textContent;
    bc.textContent = "✓ 已複製！";
    setTimeout(() => bc.textContent = old, 1500);
  }
});

// 監聽所有輸入欄位變動 → 即時同步
document.addEventListener("input", e => {
  const id = e.target.id;
  if(["roleName","customRole","textList","customTopicName"].includes(id)){
    scheduleSync();
  }
});



/* ══════════════════════════════════════════
   GLOBAL TOOLTIP（fixed 定位，不受 col overflow 截切）
══════════════════════════════════════════ */
function initTooltip(){
  const tip = document.getElementById("tooltip-global");
  if(!tip) return;

  document.querySelectorAll(".info-icon[data-tip]").forEach(el => {
    el.addEventListener("mouseenter", ev => {
      const text = el.dataset.tip || "";
      tip.textContent = text;
      tip.style.display = "block";
      positionTip(ev);
    });
    el.addEventListener("mousemove", positionTip);
    el.addEventListener("mouseleave", () => {
      tip.style.display = "none";
    });
  });

  function positionTip(ev){
    const pad = 10;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ev.clientX + 14;
    let y = ev.clientY + 14;
    // 防止超出右邊
    if(x + tw > window.innerWidth - pad) x = ev.clientX - tw - 10;
    // 防止超出下方
    if(y + th > window.innerHeight - pad) y = ev.clientY - th - 10;
    tip.style.left = x + "px";
    tip.style.top  = y + "px";
  }
}

/* ══════════════════════════════════════════
   GEMINI 前置步驟
══════════════════════════════════════════ */
function initGeminiStep(){
  // 複製特徵提取 Prompt
  const btnCopyExtract = $("#btnCopyExtract");
  if(btnCopyExtract){
    btnCopyExtract.addEventListener("click", async () => {
      const txt = $("#extractPrompt")?.value || "";
      try{ await navigator.clipboard.writeText(txt); }
      catch{ $("#extractPrompt")?.select(); document.execCommand("copy"); }
      const old = btnCopyExtract.textContent;
      btnCopyExtract.textContent = "✓ 已複製！";
      setTimeout(() => btnCopyExtract.textContent = old, 1500);
    });
  }

  // 套用 Gemini 描述到角色來源
  const btnApply = $("#btnApplyGemini");
  if(btnApply){
    btnApply.addEventListener("click", () => {
      const desc = ($("#geminiResult")?.value || "").trim();
      if(!desc){ alert("請先貼入 Gemini 回覆的角色描述"); return; }
      // 切換到「文字描述角色」
      const roleGroup = document.querySelector(".seg[data-group=\"roleSource\"]");
      if(roleGroup){
        const customBtn = roleGroup.querySelector("[data-value=\"custom_role\"]");
        if(customBtn){ ST.roleSource = "custom_role"; setActive(roleGroup, customBtn); }
      }
      // 填入描述
      const customRoleTA = $("#customRole");
      if(customRoleTA) customRoleTA.value = desc;
      refreshUI();
      scheduleSync();
      // 收合 Gemini 區塊
      const step = $("#geminiStep"); if(step) step.open = false;
      // 提示
      const old = btnApply.textContent;
      btnApply.textContent = "✓ 已套用！";
      setTimeout(() => btnApply.textContent = old, 1500);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  refreshUI();
  applyTopicTexts(true);
  syncPrompt();
  initGeminiStep();
  initTooltip();
});
