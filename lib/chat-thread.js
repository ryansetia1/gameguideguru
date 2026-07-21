import { coerceMessages } from "./chat-messages.js";

/**
 * @param {Record<string, unknown>} row
 */
export function responseRowToVariant(row) {
  const sources = Array.isArray(row.sources) ? row.sources : undefined;
  const highlights = Array.isArray(row.highlights) ? row.highlights : undefined;
  const spoilers = Array.isArray(row.spoilers) ? row.spoilers : undefined;
  const pipelineType =
    typeof row.pipeline_type === "string" ? row.pipeline_type : undefined;
  return {
    content: String(row.content),
    ...(sources ? { sources } : {}),
    ...(highlights?.length ? { highlights } : {}),
    ...(spoilers?.length ? { spoilers } : {}),
    ...(pipelineType ? { pipelineType } : {}),
  };
}

/**
 * Rebuild the UI message array from normalized turn/response rows.
 *
 * @param {Array<Record<string, unknown>>} turns
 * @param {Array<Record<string, unknown>>} responses
 * @param {Array<Record<string, unknown>>} states
 * @returns {Array<Record<string, unknown>>}
 */
export function buildMessagesFromNormalized(turns, responses, states) {
  if (!Array.isArray(turns) || !turns.length) return [];

  const sortedTurns = [...turns].sort(
    (a, b) => Number(a.turn_index) - Number(b.turn_index),
  );
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const responsesByTurn = new Map();
  for (const row of responses || []) {
    const turnId = String(row.turn_id);
    const list = responsesByTurn.get(turnId) || [];
    list.push(row);
    responsesByTurn.set(turnId, list);
  }
  /** @type {Map<string, number>} */
  const stateByTurn = new Map();
  for (const row of states || []) {
    if (typeof row.active_variant_index === "number") {
      stateByTurn.set(String(row.turn_id), row.active_variant_index);
    }
  }

  const messages = [];
  for (const turn of sortedTurns) {
    const turnId = String(turn.id);
    const userImages = Array.isArray(turn.user_images)
      ? turn.user_images.filter((url) => typeof url === "string")
      : [];
    messages.push({
      role: "user",
      content: String(turn.user_content),
      ...(userImages.length ? { images: userImages } : {}),
    });

    const turnResponses = (responsesByTurn.get(turnId) || []).sort(
      (a, b) => Number(a.variant_index) - Number(b.variant_index),
    );
    if (!turnResponses.length) continue;

    const variants = turnResponses.map(responseRowToVariant);
    const activeRaw = stateByTurn.get(turnId);
    const activeIdx =
      typeof activeRaw === "number" &&
      activeRaw >= 0 &&
      activeRaw < variants.length
        ? activeRaw
        : variants.length - 1;
    const active = variants[activeIdx];
    messages.push({
      role: "assistant",
      content: active.content,
      ...(active.sources ? { sources: active.sources } : {}),
      ...(active.highlights?.length ? { highlights: active.highlights } : {}),
      ...(active.spoilers?.length ? { spoilers: active.spoilers } : {}),
      ...(active.pipelineType ? { pipelineType: active.pipelineType } : {}),
      ...(variants.length > 1 ? { variants, activeVariantIndex: activeIdx } : {}),
    });
  }

  return coerceMessages(messages);
}

/**
 * @param {Array<Record<string, unknown>>} messages
 */
export function lastUserTurnIndex(messages) {
  const userCount = messages.filter((message) => message.role === "user").length;
  return userCount > 0 ? userCount - 1 : -1;
}

/**
 * Derive turn + variant indices after mergeAssistantIntoMessages.
 *
 * @param {Array<Record<string, unknown>>} messages
 */
export function derivePersistContext(messages) {
  const turnIndex = lastUserTurnIndex(messages);
  if (turnIndex < 0) return null;

  const userMessages = messages.filter((message) => message.role === "user");
  const userMsg = userMessages[turnIndex];
  if (!userMsg || typeof userMsg.content !== "string") return null;

  const lastAssistant = messages.at(-1);
  if (!lastAssistant || lastAssistant.role !== "assistant") return null;

  let variantIndex = 0;
  if (Array.isArray(lastAssistant.variants) && lastAssistant.variants.length) {
    variantIndex =
      typeof lastAssistant.activeVariantIndex === "number"
        ? lastAssistant.activeVariantIndex
        : lastAssistant.variants.length - 1;
  }

  return { turnIndex, userMsg, variantIndex };
}
