export const STAGE_L2 = {
  width: 412,
  height: 732,
  gridLeft: 30,
  gridTop: 196,
  cellWidth: 22,
  lineHeight: 84,        // 当前行行距（沿用第一关「当前行撑开」手感）
  lineHeightTight: 50,   // 非当前行行距
  zoneGap: 40,
  actorSize: 22,
  speed: 6,
  wrapDuration: 0.2,
  jumpHeight: 70,
  jumpCrossDuration: 0.58,
  jumpArc: 100,
  bulletTimeScale: 0.16,   // 关键字「子弹时间」减速（沿用第一关举头/低头手感）
  smashDuration: 0.42,
  melonFallDuration: 0.34,
  watermelonDwell: 1000,
  pierceDistance: 96,
  pierceDuration: 1.1,
};

const makeRow = (row, text, indent, zone) => {
  const chars = [...text];
  return {
    row,
    text,
    chars,
    indent,
    zone,
    minCol: indent,
    maxCol: indent + chars.length - 1,
  };
};

// 折线形排布（PRD §7.4，构图按需调整）：天空 indent 0（贴左）/ 沙地 indent 8（贴右）/ 行动 indent 0（贴左、天空正下方）。
// gridLeft 30 是第二关自己的左原点（不再沿用第一关居中用的 74）；天空/沙地左右页边距对称 ≈30px。
// 沙地贴右后「圆月」(row1,col7-8) 的跳跃落点（沙地行首 row2,col8）仍落在圆月正下方，主轴向下。
// 区内左对齐、当前行撑开换行；区间只靠 跳跃@圆月 / 西瓜停留@碧绿的西瓜 / 刺去@刺去 三种特殊动作跨越。
export const LEVEL_TWO = {
  title: "故乡",
  author: "鲁迅",
  lines: [
    makeRow(0, "深蓝的天空中",            0, "sky"),
    makeRow(1, "挂着一轮金黄的圆月",      0, "sky"),
    makeRow(2, "下面是海边的沙地",        8, "sand"),
    makeRow(3, "都种着一望无际的",        8, "sand"),
    makeRow(4, "碧绿的西瓜",              8, "sand"),
    makeRow(5, "其间有一个十一二岁的少年", 0, "action"),
    makeRow(6, "手捏一柄钢叉",            0, "action"),
    makeRow(7, "向一匹猹尽力的刺去",      0, "action"),
  ],
  zones: {
    sky:    { rows: [0, 1] },
    sand:   { rows: [2, 3, 4] },
    action: { rows: [5, 6, 7] },
  },
  // cols 为绝对列（indent + 行内序号）。沙地区 indent 8，故沙地行的触发列整体 +8。
  triggers: {
    deepBlue:   { row: 0, cols: [0, 1] },              // 深蓝 · 染色（天空 indent 0）
    moon:       { row: 1, cols: [7, 8] },              // 圆月 · 月亮缝合（天空 indent 0）
    seaSide:    { row: 2, cols: [11, 12] },            // 海边 · 目标预告（沙地 indent 8）
    vast:       { row: 3, cols: [11, 12, 13, 14] },    // 一望无际 · 加速候选（沙地 indent 8）
    watermelon: { row: 4, cols: [11, 12] },            // 西瓜 · 停留撞落（沙地 indent 8）
    boy:        { row: 5, cols: [0, 1] },              // 检查点 · 行动区行首安全落点（行动 indent 0）
    spear:      { row: 6, cols: [4, 5] },              // 钢叉 · 蓄势（行动 indent 0）
    pierce:     { row: 7, cols: [7, 8] },              // 刺去 · 越界推动（行动 indent 0）
  },
  // 三处跨区落点（控制权递减：主动跳 → 被撞下 → 被卷走）。落点统一在下一区行首，主轴向下。
  crossings: {
    jump:       { row: 1, cols: [7, 8], to: { row: 2, col: 10 } },  // 天空 → 沙地（向前落入沙地纵深，避免垂直跳）
    watermelon: { row: 4, cols: [11, 12], to: { row: 5, col: 0 } }, // 沙地 → 行动（撞向行动区行首检查点）
  },
  inkSea: {
    rows: 2,
    cols: 5,
    cellWidth: 22,
    rowHeight: 46,
    left: 300,
    top: 590,
  },
  moonSeam: {
    handoffLeft: 308,
    handoffTop: 108,
    sutureLift: -10,
    sutureScale: 1.14,
  },
  hints: {
    intro: "按住左右两侧，继续往前走",
    discovery: "留意脚下，有些字也许会回应你",
    moonSuture: "这一轮，刚才撞下来过",
    moonJump: "月亮落低了，再抬头看看？",
    seaSide: "海，在字句之外等着。",
    watermelon: "在西瓜上停一停……",
    pierce: "向前——",
    landed: "一直游下去。",
  },
};

export const STATES_L2 = Object.freeze({
  INTRO: "L2_INTRO",
  PLAYING: "L2_PLAYING",
  WRAPPING: "L2_WRAPPING",
  JUMPING: "L2_JUMPING",
  CROSSING: "L2_CROSSING",
  PIERCE: "L2_PIERCE",
  LANDED_SEA: "L2_LANDED_SEA",
});

// 当前行（activeRow）行距撑开（lineHeight），其余行收紧（lineHeightTight），区间加 zoneGap。
// 与第一关 visualRowTop 同一套手感：撑开的留白落在当前行「上方」，给跳跃让出空间。
export function rowTopOf(row, activeRow = row) {
  let y = STAGE_L2.gridTop;
  const lines = LEVEL_TWO.lines;
  for (let r = 1; r <= row; r += 1) {
    y += r === activeRow ? STAGE_L2.lineHeight : STAGE_L2.lineHeightTight;
    if (lines[r].zone !== lines[r - 1].zone) y += STAGE_L2.zoneGap;
  }
  return y;
}

export function getLine(row) {
  return LEVEL_TWO.lines[row];
}

export function zoneRowsOf(zone) {
  return LEVEL_TWO.zones[zone].rows;
}

// 同一空间区内的相邻行（区内自动卷轴换行）；跨区返回 null，由特殊动作处理。
export function getWrapTarget(row, direction) {
  const rows = zoneRowsOf(getLine(row).zone);
  const idx = rows.indexOf(row);
  const nextIdx = idx + (direction > 0 ? 1 : -1);
  if (nextIdx < 0 || nextIdx >= rows.length) return null;
  return rows[nextIdx];
}
