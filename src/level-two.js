export const STAGE_L2 = {
  width: 412,
  height: 732,
  gridLeft: 74,
  gridTop: 84,
  cellWidth: 22,
  lineHeight: 48,
  zoneGap: 40,
  actorSize: 22,
  speed: 6,
  fallDuration: 0.42,
  pierceDistance: 96,
  pierceDuration: 1.15,
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

export const LEVEL_TWO = {
  title: "故乡",
  author: "鲁迅",
  lines: [
    makeRow(0, "深蓝的天空中",         0, "sky"),
    makeRow(1, "挂着一轮金黄的圆月",   4, "sky"),
    makeRow(2, "下面是海边的沙地",     0, "sand"),
    makeRow(3, "都种着一望无际的",     4, "sand"),
    makeRow(4, "碧绿的西瓜",           8, "sand"),
    makeRow(5, "其间有一个十一二岁的少年", 0, "sand"),
    makeRow(6, "项带银圈",             6, "action"),
    makeRow(7, "手捏一柄钢叉",         4, "action"),
    makeRow(8, "向一匹猹尽力的刺去",   0, "action"),
  ],
  zones: {
    sky:    { rows: [0, 1],       dim: 0.32, focus: 1.0 },
    sand:   { rows: [2, 3, 4, 5], dim: 0.32, focus: 1.0 },
    action: { rows: [6, 7, 8],    dim: 0.32, focus: 1.0 },
  },
  // 走出当前行的某一端即落到下一行 landCol
  fallMap: [
    { from: 0, edge: "right", to: 1, landCol: 4  },
    { from: 1, edge: "right", to: 2, landCol: 7  },
    { from: 2, edge: "left",  to: 3, landCol: 4  },
    { from: 3, edge: "right", to: 4, landCol: 8  },
    { from: 4, edge: "right", to: 5, landCol: 11 },
    { from: 5, edge: "left",  to: 6, landCol: 6  },
    { from: 6, edge: "right", to: 7, landCol: 9  },
    { from: 7, edge: "left",  to: 8, landCol: 0  },
  ],
  triggers: {
    deepBlue: { row: 0, cols: [0, 1] },
    sky:      { row: 0, cols: [4] },
    moon:     { row: 1, cols: [11, 12] },
    seaSide:  { row: 2, cols: [3, 4] },
    vast:     { row: 3, cols: [7, 8, 9, 10] },
    verdant:  { row: 4, cols: [8, 9] },
    boy:      { row: 5, cols: [10, 11] },
    necklace: { row: 6, cols: [6, 7] },
    spear:    { row: 7, cols: [8, 9] },
    pierce:   { row: 8, cols: [7, 8] },
  },
  inkSea: {
    rows: 2,
    cols: 6,
    cellWidth: 22,
    rowHeight: 46,
    left: 256,
    top: 624,
  },
  moonSeam: {
    handoffLeft: 308,
    handoffTop: 108,
    sutureLift: -10,
    sutureScale: 1.14,
  },
  hints: {
    intro: "走进字里行间。",
    moonSuture: "这一轮，刚才撞下来过",
    seaSide: "海，在那边。",
    pierce: "向前——",
    landed: "一直游下去。",
  },
};

export const STATES_L2 = Object.freeze({
  INTRO: "L2_INTRO",
  PLAYING: "L2_PLAYING",
  FALLING: "L2_FALLING",
  PIERCE: "L2_PIERCE",
  LANDED_SEA: "L2_LANDED_SEA",
});

export function rowTopOf(row) {
  let y = STAGE_L2.gridTop;
  const lines = LEVEL_TWO.lines;
  for (let r = 1; r <= row; r += 1) {
    y += STAGE_L2.lineHeight;
    if (lines[r].zone !== lines[r - 1].zone) y += STAGE_L2.zoneGap;
  }
  return y;
}

export function getLine(row) {
  return LEVEL_TWO.lines[row];
}

export function getFall(row, direction) {
  const edge = direction > 0 ? "right" : "left";
  return LEVEL_TWO.fallMap.find((f) => f.from === row && f.edge === edge);
}
