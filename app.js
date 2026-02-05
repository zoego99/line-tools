/* ================================
   LINE 貼圖 Prompt 生成器｜Page1 app.js（更新：尺寸改為「建議」＋提示 Gemini 可能忽略）
   ✅ 支援：3×3 / 5×5
   ✅ 主角+文字：3×3→8則 + Tab無字｜5×5→24則 + Tab無字
   ✅ 主角（無文字）：硬性禁止任何文字（Prompt + Negative 都加強）
   ✅ 尺寸不再「硬性要求」，改為「建議」＋「Gemini 可能忽略」＋「Page2 會自動校正」
================================ */

const $ = (q) => document.querySelector(q);

// ===== 兩種規格 =====
const PACKS = {
  "3x3": { key: "3x3", rows: 3, cols: 3, count: 9,  w: 1536, h: 1536, cellW: 512, cellH: 512, textCount: 8  },
  "5x5": { key: "5x5", rows: 5, cols: 5, count: 25, w: 2560, h: 2560, cellW: 512, cellH: 512, textCount: 24 },
};

// ===== 主題預設文字（至少 24 則）=====
const TOPIC_TEXTS = {
  daily: [
    "收到","OK","謝謝","辛苦了","稍等一下","晚點回","沒問題","了解",
    "好喔","我先忙","等等我","抱歉","已處理","可以","不行","再說",
    "哈哈","哭哭","傻眼","加油","收到了解","交給我","我知道了","確認"
  ],
  greeting: [
    "早安","午安","晚安","嗨","在嗎","忙嗎","辛苦了","我來了",
    "下班啦","週末愉快","保重","晚點聊","先這樣","掰掰","改天約","請多指教",
    "哈囉","有空嗎","早～","晚安安","你好","久等了","抱抱","加油呀"
  ],
  festival: [
    "新年快樂","恭喜發財","紅包拿來","平安喜樂","心想事成","春節快樂","走春中","開工大吉",
    "元宵快樂","清明安康","端午安康","粽子吃起來","好運連連","福氣滿滿","財運旺旺","闔家平安",
    "旅途平安","團圓時光","吉祥如意","萬事順心","中秋快樂","月圓人團圓","聖誕快樂","新年新氣象"
  ],
};

// ===== 主角模式（無文字）主題情境指引 =====
const ROLE_ONLY_TOPIC_GUIDE = {
  daily: `主題：日常用語（無文字）
情境方向：用「動作/表情/手勢/道具」表達常見訊息情境，例如：收到點頭、比OK、道歉鞠躬、加油握拳、思考抓頭、忙碌敲鍵盤、打電話、看手機回訊息、伸懶腰、喝咖啡、趕路小跑步、放空無語、開心比讚、疲憊攤倒等。`,
  greeting: `主題：打招呼（無文字）
情境方向：用「打招呼/互動」動作表達，例如：揮手、招手、鞠躬、比心、抱抱姿勢、微笑點頭、眨眼、敬禮、打氣手勢、擊掌、揮手道別、伸手邀請、雙手合十致意等。`,
  festival: `主題：年節（這半年常見年節）（無文字）
情境方向：用節慶元素與動作營造氛圍，但「畫面中禁止出現任何文字」：
可用元素/道具：燈籠、紅包、元寶、鞭炮、春節裝飾、年糕/湯圓、節慶小帽、煙火、小福袋、剪紙風裝飾（純圖形不含字）。
可用動作：拜年手勢、開心跳躍、雙手捧紅包、提燈籠、放煙火姿勢、團圓吃湯圓、招財手勢等。`,
};

// ===== 畫風 =====
const STYLE_MAP = {
  cute_q:    { label: "可愛Q版",   prompt: "Q版可愛貼圖風格，頭大身小，線條清楚，色彩簡單，表情誇張可愛" },
  photo_real:{ label: "照片寫實", prompt: "照片寫實風格，自然光，清晰細節，真實質感，乾淨白底" },
  toy_3d:    { label: "3D公仔",   prompt: "3D 公仔玩具質感，圓潤材質，柔和光，乾淨白底" },
  kids_book: { label: "童畫繪本", prompt: "繪本筆觸，溫暖色調，柔和療癒，乾淨白底" },
  fun_draw:  { label: "童趣手繪", prompt: "童趣手繪塗鴉風，線條隨性但一致，可愛感，乾淨白底" },
  ink_style: { label: "古風水墨", prompt: "古風水墨風，水墨筆觸，留白，淡彩，宣紙感（仍維持白底#ffffff乾淨）" },
  ghibli:    { label: "吉卜力風", prompt: "日系溫暖動畫氛圍，治癒感，柔和光影，乾淨背景#ffffff（不使用任何商標或既有角色）" },
};

// ===== 狀態 =====
const STATE = {
  contentMode: "role_text",  // role_text | role_only
  packSize: "5x5",           // 3x3 | 5x5
  roleSource: "ref_image",   // ref_image | custom_role
  topic: "daily",            // daily | greeting | festival
  style: "cute_q",
};

function spec() { return PACKS[STATE.packSize] || PACKS["5x5"]; }

function topicName() {
  if (STATE.topic === "daily") return "日常用語";
  if (STATE.topic === "greeting") return "打招呼";
  return "年節（這半年常見年節）";
}

function modeHintText() {
  const s = spec();
  if (STATE.contentMode === "role_only") return "主角模式（無文字）：只要圖，不要任何文字；用表情/姿勢/道具表達情境。";
  return `主角+文字：前 ${s.textCount} 張有文字 + 第 ${s.count} 張 Tab 無字（正面可愛表情）。`;
}

function parseTextLinesN(n) {
  const el = $("#textList");
  const raw = (el?.value || "").trim();
  if (!raw) return [];
  return raw.split("\n").map(s => s.trim()).filter(Boolean).slice(0, n);
}

// ✅ 主角+文字：依主題/規格強制覆蓋文字框
function applyTopicTexts(force = true) {
  const s = spec();
  const el = $("#textList");
  if (!el) return;
  if (STATE.contentMode !== "role_text") return;

  if (!force && el.value.trim()) return;

  const arr = (TOPIC_TEXTS?.[STATE.topic] || []).slice(0, s.textCount);
  el.value = arr.join("\n");
}

function refreshUI() {
  const s = spec();

  // 尺寸提示（改為「建議」＋ 提醒 Gemini 可能不照做）
  const hint = $("#sizeHint");
  if (hint) {
    hint.textContent =
      `建議工作尺寸：${s.w}×${s.h}（每格 ${s.cellW}×${s.cellH}）｜排列：${s.rows}×${s.cols} 共 ${s.count} 張。` +
    `（提醒：Gemini 可能輸出 1024×1024 等標準尺寸，沒關係，【LINE 貼圖上架整理】頁面， 會自動裁正方形並校正尺寸後再切割）`;
  }

  // 模式提示
  const modeHint = $("#modeHint");
  if (modeHint) modeHint.textContent = modeHintText();

  // 文字提示
  const textHint = $("#textHint");
  if (textHint) {
    if (STATE.contentMode === "role_text") {
      textHint.textContent = `請輸入 ${s.textCount} 則文字（一行一則）。第 ${s.count} 張 Tab：無文字、角色正面可愛表情。`;
    } else {
      textHint.textContent = `主角模式（無文字）：不輸出文字清單；嚴格禁止畫面出現任何字。`;
    }
  }

  // 文字區塊顯示/隱藏
  const textBlock = $("#textBlock");
  if (textBlock) textBlock.hidden = (STATE.contentMode !== "role_text");

  // 角色來源顯示
  const refHint = $("#refHintWrap");
  const customRoleWrap = $("#customRoleWrap");
  if (STATE.roleSource === "ref_image") {
    if (refHint) refHint.hidden = false;
    if (customRoleWrap) customRoleWrap.hidden = true;
  } else {
    if (refHint) refHint.hidden = true;
    if (customRoleWrap) customRoleWrap.hidden = false;
  }
}

// ===== Prompt 組裝 =====
function buildPromptAll() {
  const s = spec();
  const style = STYLE_MAP[STATE.style] || STYLE_MAP.cute_q;
  const roleName = ($("#roleName")?.value || "").trim() || "（請填主角名稱）";

  // 角色來源
  let roleBlock = "";
  if (STATE.roleSource === "ref_image") {
    roleBlock = "角色來源：上傳的參考圖。";
  } else {
    const customRole = ($("#customRole")?.value || "").trim()
      || "（請描述角色，例如：7歲小女孩、短髮、戴眼鏡、背小書包）";
    roleBlock = `角色來源：自訂角色。角色描述：${customRole}`;
  }

  // ===== 共用：輸出規格（改為建議，不強制）=====
  const baseSpec = [
    "【輸出規格（建議值，不強制）】",
    "- 輸出為「單一大圖」",
    `- 建議尺寸：${s.w} × ${s.h} px（若工具不支援固定尺寸，改維持正方形 1:1 即可）`,
    `- 畫面平均分割為 ${s.rows} × ${s.cols}，共 ${s.count} 張（每格等分清楚）`,
    "- 絕對禁止格線、框線、分隔線",
    "- 每格四邊保留留白空間（裁切安全）",
    "- 背景顏色必須為純白色（#ffffff）",    
  ].join("\n");

  const qualityHint = [
    "【清晰度建議（提高品質）】",
    "- 乾淨線條、邊緣銳利、細節清楚",
    "- highly detailed, sharp edges, clean outlines, crisp details",
    "- 避免模糊、避免低解析、避免噪點",
  ].join("\n");

  // ===== 共用：畫風 =====
  const styleBlock = [
    "【畫風】",
    `畫風：${style.label}`,
    `風格描述：${style.prompt}`,
  ].join("\n");

  // ===== 共用：牙齒細節（白底去背安全） =====
  const teethBlock = [
    "【牙齒與臉部細節（去背安全重點）】",
    "- 牙齒不可為純白（避免與白底融合）",
    "- 牙齒使用暖象牙色或淺米白（warm ivory / light off-white）",
    "- 牙齒需有清楚的邊界線稿或柔和陰影，與背景明顯區分",
  ].join("\n");

  // ===== 主角模式（無文字）：禁字規則 =====
  const noTextRule = [
    "【禁字規則（非常重要，必須遵守）】",
    "- 全部貼圖禁止出現任何文字：包含中文字、英文字、數字、符號、對話框文字、路牌文字、衣服印字、背景字樣、Logo、水印、簽名、UI 字樣。",
    "- 請用表情、手勢、道具表達意思，不可用文字替代。",
  ].join("\n");

  const negativeRoleOnly = [
    "【Negative Prompt】",
    "text, caption, subtitle, word, letters, numbers, typography, speech bubble text,",
    "chinese characters, english letters, watermark, logo, signature, signboard text, printed text, ui text,",
    "grid lines, borders, frames,",
    "low resolution, blurry, noise, jpeg artifacts,",
    "background not white, off-white background, gray background, textured background,",
    "pure white teeth, teeth same color as background, overexposed teeth,",
    "teeth blending into background, missing teeth after cutout",
  ].join("\n");

  const negativeRoleText = [
    "【Negative Prompt】",
    "simplified chinese, zh-cn, chinese simplified characters,",
    "grid lines, borders, frames,",
    "low resolution, blurry, noise, jpeg artifacts,",
    "text too small, thin strokes, unreadable text,",
    "text modified, rewritten text, translated text,",
    "background not white, off-white background, gray background, textured background,",
    "pure white teeth, teeth same color as background, overexposed teeth,",
    "teeth blending into background, missing teeth after cutout",
  ].join("\n");

  // ===== 主角模式（無文字）=====
  if (STATE.contentMode === "role_only") {
    const roleOnlyGuide = ROLE_ONLY_TOPIC_GUIDE?.[STATE.topic] || ROLE_ONLY_TOPIC_GUIDE.daily;

    return [
      "【Prompt】",
      "請生成 LINE 貼圖用圖像。（語言可為台灣繁體中文，但「畫面中不得出現任何文字」）",
      "",
      baseSpec,
      qualityHint,
      "",
      "【主題（僅氛圍，不要文字）】",
      roleOnlyGuide,
      "",
      "【內容模式：主角貼圖（無文字版）】",
      "- 每格只呈現主角的動作 / 表情 / 情緒 / 手勢 / 情境道具，不要任何文字。",
      `- 第 ${s.count} 張可作為 Tab 候選：同樣無文字、主角正面可愛表情、構圖更置中更清楚。`,
      "",
      "【變化要求】",
      "- 每格主角姿勢/表情/情緒/道具必須不同，不可重複。",
      "- 主體置中、留白裁切友善、白底 #ffffff。",
      "",
      `主角名稱：${roleName}`,
      roleBlock,
      "",
      styleBlock,
      "",
      noTextRule,
      "",
      teethBlock,
      "",
      negativeRoleOnly,
    ].filter(Boolean).join("\n");
  }

  // ===== 主角+文字 =====
  const inputN = parseTextLinesN(s.textCount);
  const fallbackN = (TOPIC_TEXTS?.[STATE.topic] || []).slice(0, s.textCount);
  const textsN = inputN.length ? inputN : fallbackN;

  const textListBlock =
    `【文字清單（依序對應前 ${s.textCount} 張）】\n${textsN.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

  return [
    "【Prompt】",
    "請生成 LINE 貼圖用圖像（台灣繁體中文）。",
    "",
    baseSpec,
    qualityHint,
    "",
    "【主題】",
    `主題：${topicName()}`,
    "",
    "【內容模式】",
    `內容模式：主角 + 文字（前 ${s.textCount} 張有文字，第 ${s.count} 張 Tab 無文字正面表情）。`,
    "",
    `主角名稱：${roleName}`,
    roleBlock,
    "",
    styleBlock,
    "字型風格：可愛 Q 版 Pop Art 字型。",
    "",
    "【畫面要求】",
    "- 構圖簡單、輪廓清楚、線條不要太細、避免背景雜物",
    "- 主體置中、文字不要貼邊、對比足夠、手機一眼可讀",
    "",
    "【文字規則（非常重要）】",
    `- 前 ${s.textCount} 張貼圖需顯示文字；第 ${s.count} 張為 Tab：不顯示任何文字（僅角色正面可愛表情）`,
    "- 文字必須逐字原樣顯示：不可改寫、不可同義替換、不可翻譯、不可簡化",
    "- 必須使用台灣繁體中文（禁止簡體字）",
    "",
    textListBlock,
    "",
    teethBlock,
    "",
    negativeRoleText,
  ].filter(Boolean).join("\n");
}

// ===== 事件委派 =====
function setSegActive(groupEl, btnEl) {
  groupEl.querySelectorAll(".segbtn").forEach((b) => b.classList.remove("is-on"));
  btnEl.classList.add("is-on");
}

function setStyleActive(cardEl) {
  const grid = $("#styleGrid");
  if (!grid) return;
  grid.querySelectorAll(".style-card").forEach((c) => c.classList.remove("is-on"));
  cardEl.classList.add("is-on");
}

// 防呆：contentMode 若 data-value 寫錯，改用按鈕文字判斷
function normalizeContentMode(value, buttonText) {
  if (value === "role_text" || value === "role_only") return value;
  const t = (buttonText || "").trim();
  if (t === "主角" || t.includes("主角")) return "role_only";
  if (t.includes("文字")) return "role_text";
  return "role_text";
}

document.addEventListener("click", async (e) => {
  // seg buttons
  const segBtn = e.target.closest(".segbtn");
  if (segBtn) {
    const group = segBtn.closest(".seg[data-group]");
    if (!group) return;

    const key = group.dataset.group; // contentMode / packSize / roleSource / topic
    let value = segBtn.dataset.value;

    if (key === "contentMode") value = normalizeContentMode(value, segBtn.textContent);

    if (!key || !value) return;

    STATE[key] = value;
    setSegActive(group, segBtn);

    refreshUI();

    // 只有「主角+文字」才覆蓋文字清單（主角模式不動）
    if (STATE.contentMode === "role_text") {
      if (key === "topic" || key === "packSize" || key === "contentMode") {
        applyTopicTexts(true);
      }
    }

    return;
  }

  // style card
  const styleCard = e.target.closest(".style-card");
  if (styleCard) {
    const s = styleCard.dataset.style;
    if (s) STATE.style = s;
    setStyleActive(styleCard);
    refreshUI();
    return;
  }

  // generate
  if (e.target.closest("#btnGen")) {
    const outAll = $("#outAll");
    const btnCopy = $("#btnCopy");
    const p = buildPromptAll();
    if (outAll) outAll.value = p;
    if (btnCopy) btnCopy.disabled = !p;
    return;
  }

  // copy
  if (e.target.closest("#btnCopy")) {
    const outAll = $("#outAll");
    const text = outAll?.value || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      outAll?.select();
      document.execCommand("copy");
    }
    const btnCopy = $("#btnCopy");
    const old = btnCopy.textContent;
    btnCopy.textContent = "已複製！";
    setTimeout(() => (btnCopy.textContent = old), 1200);
    return;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  refreshUI();
  if (STATE.contentMode === "role_text") applyTopicTexts(true);
});
