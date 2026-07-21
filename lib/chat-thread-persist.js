import { coerceMessages } from "./chat-messages.js";
import {
  buildMessagesFromNormalized,
  derivePersistContext,
  lastUserTurnIndex,
} from "./chat-thread.js";

/**
 * Load messages from normalized tables. Returns null when no rows exist.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} chatId
 */
export async function fetchNormalizedThread(supabase, chatId) {
  const { data: turns, error: turnError } = await supabase
    .from("chat_turns")
    .select("id, turn_index, user_content, user_images")
    .eq("chat_id", chatId)
    .order("turn_index", { ascending: true });

  if (turnError || !turns?.length) return null;

  const turnIds = turns.map((turn) => turn.id);
  const [{ data: responses }, { data: states }] = await Promise.all([
    supabase
      .from("chat_responses")
      .select(
        "turn_id, variant_index, content, sources, highlights, spoilers, pipeline_type",
      )
      .in("turn_id", turnIds),
    supabase
      .from("chat_turn_state")
      .select("turn_id, active_variant_index")
      .in("turn_id", turnIds),
  ]);

  return buildMessagesFromNormalized(turns, responses || [], states || []);
}

/**
 * Prefer normalized rows; fall back to legacy chats.messages jsonb.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id: string; messages?: unknown }} chat
 */
export async function resolveThreadMessages(supabase, chat) {
  const normalized = await fetchNormalizedThread(supabase, chat.id);
  if (normalized?.length) return normalized;
  return coerceMessages(chat.messages);
}

/**
 * Persist one assistant variant to normalized tables and rebuild messages cache.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{
 *   chatId: string;
 *   messages: Array<Record<string, unknown>>;
 *   variantBody: Record<string, unknown>;
 *   traceId?: string;
 * }} input
 */
export async function persistAssistantResponse(supabase, input) {
  const { chatId, messages, variantBody, traceId } = input;
  const context = derivePersistContext(messages);
  if (!context) return { ok: false, reason: "no_context" };

  const userImages = Array.isArray(context.userMsg.images)
    ? context.userMsg.images.filter((url) => typeof url === "string")
    : [];

  const { data: turn, error: turnError } = await supabase
    .from("chat_turns")
    .upsert(
      {
        chat_id: chatId,
        turn_index: context.turnIndex,
        user_content: context.userMsg.content,
        user_images: userImages,
      },
      { onConflict: "chat_id,turn_index" },
    )
    .select("id")
    .single();

  if (turnError || !turn) {
    return { ok: false, reason: "turn_upsert", error: turnError };
  }

  const { error: responseError } = await supabase.from("chat_responses").upsert(
    {
      turn_id: turn.id,
      variant_index: context.variantIndex,
      content: String(variantBody.content),
      sources: variantBody.sources ?? null,
      highlights: variantBody.highlights ?? null,
      spoilers: variantBody.spoilers ?? null,
      pipeline_type:
        typeof variantBody.pipelineType === "string" ? variantBody.pipelineType : null,
      trace_id: traceId ?? null,
    },
    { onConflict: "turn_id,variant_index" },
  );

  if (responseError) {
    return { ok: false, reason: "response_upsert", error: responseError };
  }

  await supabase.from("chat_turn_state").upsert(
    {
      turn_id: turn.id,
      active_variant_index: context.variantIndex,
    },
    { onConflict: "turn_id" },
  );

  const rebuilt = await fetchNormalizedThread(supabase, chatId);
  if (!rebuilt?.length) {
    return { ok: false, reason: "rebuild_empty" };
  }

  const { error: cacheError } = await supabase
    .from("chats")
    .update({ messages: rebuilt, updated_at: new Date().toISOString() })
    .eq("id", chatId);

  if (cacheError) {
    return { ok: false, reason: "cache_update", error: cacheError };
  }

  return { ok: true, messages: rebuilt };
}

/**
 * Sync active variant index when the user navigates variant nav.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} chatId
 * @param {Array<Record<string, unknown>>} messages
 */
export async function syncVariantStateFromMessages(supabase, chatId, messages) {
  const turnIndex = lastUserTurnIndex(messages);
  if (turnIndex < 0) return;

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!lastAssistant) return;
  const variants = lastAssistant.variants;
  if (!Array.isArray(variants) || !variants.length) return;

  const activeIdx =
    typeof lastAssistant.activeVariantIndex === "number"
      ? lastAssistant.activeVariantIndex
      : 0;

  const { data: turn } = await supabase
    .from("chat_turns")
    .select("id")
    .eq("chat_id", chatId)
    .eq("turn_index", turnIndex)
    .maybeSingle();

  if (!turn) return;

  await supabase.from("chat_turn_state").upsert(
    {
      turn_id: turn.id,
      active_variant_index: activeIdx,
    },
    { onConflict: "turn_id" },
  );
}
