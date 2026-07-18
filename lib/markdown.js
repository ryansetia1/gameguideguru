/**
 * @typedef {{ text: string, bold: boolean, italic: boolean }} Segment
 * @typedef {{ type: "p", segments: Segment[] }} ParagraphBlock
 * @typedef {{ type: "h", segments: Segment[] }} HeadingBlock
 * @typedef {{ type: "ol", items: Segment[][] }} OrderedListBlock
 * @typedef {{ type: "ul", items: Segment[][] }} UnorderedListBlock
 * @typedef {ParagraphBlock | HeadingBlock | OrderedListBlock | UnorderedListBlock} Block
 */

/**
 * Split one line into bold/plain segments on **markers**. Unmatched markers are
 * left as literal text.
 *
 * @param {string} line
 * @returns {Segment[]}
 */
export function parseInline(line) {
  /** @type {Segment[]} */
  const segments = [];
  const re = /\*\*(.+?)\*\*|\*([^*]+?)\*/g;
  let last = 0;
  let match;
  while ((match = re.exec(line))) {
    if (match.index > last) {
      segments.push({ text: line.slice(last, match.index), bold: false, italic: false });
    }
    if (match[1] !== undefined) {
      segments.push({ text: match[1], bold: true, italic: false });
    } else {
      segments.push({ text: match[2], bold: false, italic: true });
    }
    last = match.index + match[0].length;
  }
  if (last < line.length) {
    segments.push({ text: line.slice(last), bold: false, italic: false });
  }
  return segments.length ? segments : [{ text: line, bold: false, italic: false }];
}

/**
 * Parse the small markdown subset the model emits — paragraphs, numbered/bulleted
 * lists, `# headings`, and **bold** — into renderable blocks. ponytail: not a full
 * CommonMark parser; upgrade path is a real markdown lib if the model outgrows it.
 *
 * @param {string} text
 * @returns {Block[]}
 */
export function parseBlocks(text) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  /** @type {Block[]} */
  const blocks = [];
  /** @type {OrderedListBlock | UnorderedListBlock | null} */
  let list = null;

  const flush = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    const ul = line.match(/^[-*]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);

    if (ol) {
      if (!list || list.type !== "ol") {
        flush();
        list = { type: "ol", items: [] };
      }
      list.items.push(parseInline(ol[1]));
    } else if (ul) {
      if (!list || list.type !== "ul") {
        flush();
        list = { type: "ul", items: [] };
      }
      list.items.push(parseInline(ul[1]));
    } else if (heading) {
      flush();
      blocks.push({ type: "h", segments: parseInline(heading[1]) });
    } else {
      flush();
      blocks.push({ type: "p", segments: parseInline(line) });
    }
  }
  flush();
  return blocks;
}
