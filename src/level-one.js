export const STAGE = {
  width: 412,
  height: 732,
  gridLeft: 74,
  gridTop: 238,
  cellWidth: 22,
  lineHeight: 46,
  actorSize: 15,
  speed: 6,
};

export const LEVEL_ONE = {
  title: "静夜思",
  author: "李白",
  lines: ["床前明月光，疑是地上霜。", "举头望明月，低头思故乡。"],
  triggers: {
    light: { row: 0, col: 4, cooldown: 800 },
    frost: { row: 0, col: 10, cooldown: 800 },
    bulletTime: { row: 1, col: 0, cooldown: 800 },
    sink: { row: 1, col: 6, cooldown: 800 },
  },
  softWall: { row: 1, col: 5 },
  moonChars: [
    { row: 0, col: 2 },
    { row: 0, col: 3 },
  ],
};

export const STATES = Object.freeze({
  INTRO: "INTRO",
  IDLE: "IDLE",
  PLAYING: "PLAYING",
  FROZEN: "FROZEN",
  WRAPPING: "WRAPPING",
  BULLET_TIME: "BULLET_TIME",
  MOON_BREAK: "MOON_BREAK",
  PLAYING_POST_MOON: "PLAYING_POST_MOON",
  TRANSITION_TO_LEVEL_2: "TRANSITION_TO_LEVEL_2",
  HANDOFF: "HANDOFF",
});
