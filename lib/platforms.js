/**
 * @typedef {{ group: string, items: string[] }} PlatformGroup
 */

/** @type {PlatformGroup[]} */
export const PLATFORMS = [
  {
    group: "Nintendo",
    items: [
      "NES",
      "SNES",
      "Nintendo 64",
      "GameCube",
      "Wii",
      "Wii U",
      "Nintendo Switch",
      "Nintendo Switch 2",
      "Game Boy",
      "Game Boy Color",
      "Game Boy Advance",
      "Nintendo DS",
      "Nintendo 3DS",
    ],
  },
  {
    group: "PlayStation",
    items: [
      "PlayStation (PS1)",
      "PlayStation 2",
      "PlayStation 3",
      "PlayStation 4",
      "PlayStation 5",
      "PSP",
      "PS Vita",
    ],
  },
  {
    group: "Xbox",
    items: ["Xbox", "Xbox 360", "Xbox One", "Xbox Series X|S"],
  },
  {
    group: "Sega",
    items: ["Sega Genesis / Mega Drive", "Sega Saturn", "Dreamcast"],
  },
  {
    group: "Other",
    items: ["PC", "Mobile (iOS/Android)", "Arcade"],
  },
];

// Acronyms and common shorthands players actually type. Keys are exact platform
// names; matching is done against these plus the name itself.
/** @type {Record<string, string[]>} */
const ALIASES = {
  NES: ["famicom"],
  SNES: ["super nintendo", "super famicom", "sfc"],
  "Nintendo 64": ["n64"],
  GameCube: ["gcn", "ngc", "gc"],
  "Wii U": ["wiiu"],
  "Nintendo Switch": ["switch", "nsw"],
  "Nintendo Switch 2": ["switch 2", "switch2"],
  "Game Boy": ["gb", "gameboy"],
  "Game Boy Color": ["gbc"],
  "Game Boy Advance": ["gba"],
  "Nintendo DS": ["nds", "ds"],
  "Nintendo 3DS": ["3ds", "n3ds"],
  "PlayStation (PS1)": ["ps1", "psx", "psone", "playstation 1"],
  "PlayStation 2": ["ps2"],
  "PlayStation 3": ["ps3"],
  "PlayStation 4": ["ps4"],
  "PlayStation 5": ["ps5"],
  PSP: ["playstation portable"],
  "PS Vita": ["vita", "psvita"],
  Xbox: ["original xbox", "og xbox"],
  "Xbox 360": ["x360", "360"],
  "Xbox One": ["xone", "xb1", "xbox1"],
  "Xbox Series X|S": ["xsx", "xss", "series x", "series s", "xbox series"],
  "Sega Genesis / Mega Drive": ["genesis", "mega drive", "megadrive", "md", "smd"],
  "Sega Saturn": ["saturn"],
  Dreamcast: ["dc"],
  PC: ["windows", "steam"],
  "Mobile (iOS/Android)": ["mobile", "ios", "android", "iphone", "ipad"],
  Arcade: ["mame"],
};

/** @param {string} value */
function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Precompute normalized haystacks (name + aliases) per platform once.
/** @type {Map<string, string[]>} */
const HAYSTACKS = new Map();
for (const section of PLATFORMS) {
  for (const item of section.items) {
    HAYSTACKS.set(item, [item, ...(ALIASES[item] || [])].map(normalize));
  }
}

/**
 * Filter the grouped platform list by a fuzzy, acronym-aware query. An empty
 * query returns every group. Matching is normalized-substring (case- and
 * punctuation-insensitive) against each platform's name and its aliases, so
 * "n64", "nds", "psx", "ps1", "ps2" all resolve to the right console.
 *
 * @param {string} query
 * @returns {PlatformGroup[]}
 */
export function matchPlatforms(query) {
  const needle = normalize(query || "");
  if (!needle) return PLATFORMS;
  return PLATFORMS.map((section) => ({
    group: section.group,
    items: section.items.filter((item) =>
      (HAYSTACKS.get(item) || []).some((part) => part.includes(needle)),
    ),
  })).filter((section) => section.items.length > 0);
}
