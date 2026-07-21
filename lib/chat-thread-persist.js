import { coerceMessages } from "./chat-messages.js";
import {
  buildMessagesFromNormalized,
  derivePersistContext,
  lastUserTurnIndex,
  pairMessagesIntoTurns,
  pickRicherThread,
  variantRowsFromPersistedAssistant,
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
 * Prefer the richer of normalized rows vs legacy chats.messages jsonb.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ id: string; messages?: unknown }} chat
 */
export async function resolveThreadMessages(supabase, chat) {
  const normalized = await fetchNormalizedThread(supabase, chat.id);
  const legacy = coerceMessages(chat.messages);
  return pickRicherThread(normalized, legacy);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} chatId
 * @param {Array<Record<string, unknown>>} messages
 * @param {string | undefined} traceId
 */
async function syncAllTurnsFromMessages(supabase, chatId, messages, traceId) {
  const turns = pairMessagesIntoTurns(messages);
  const lastTurnIndex = turns.length - 1;

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex++) {
    const { user, assistant } = turns[turnIndex];
    if (!assistant) continue;

    const userImages = Array.isArray(user.images)
      ? user.images.filter((url) => typeof url === "string")
      : [];

    const { data: turn, error: turnError } = await supabase
      .from("chat_turns")
      .upsert(
        {
          chat_id: chatId,
          turn_index: turnIndex,
          user_content: String(user.content),
          user_images: userImages,
        },
        { onConflict: "chat_id,turn_index" },
      )
      .select("id")
      .single();

    if (turnError || !turn) {
      return { ok: false, reason: "turn_upsert", error: turnError };
    }

    const isLastTurn = turnIndex === lastTurnIndex;
    const variantRows = variantRowsFromPersistedAssistant(
      assistant,
      isLastTurn ? traceId : undefined,
    );
    if (!variantRows.length) continue;

    const { error: responseError } = await supabase.from("chat_responses").upsert(
      variantRows.map((row) => ({
        turn_id: turn.id,
        variant_index: row.variant_index,
        content: String(row.body.content),
        sources: row.body.sources ?? null,
        highlights: row.body.highlights ?? null,
        spoilers: row.body.spoilers ?? null,
        pipeline_type:
          typeof row.body.pipelineType === "string" ? row.body.pipelineType : null,
        trace_id: row.trace_id,
      })),
      { onConflict: "turn_id,variant_index" },
    );

    if (responseError) {
      return { ok: false, reason: "response_upsert", error: responseError };
    }

    const activeIdx =
      typeof assistant.activeVariantIndex === "number"
        ? assistant.activeVariantIndex
        : variantRows.length - 1;

    await supabase.from("chat_turn_state").upsert(
      {
        turn_id: turn.id,
        active_variant_index: activeIdx,
      },
      { onConflict: "turn_id" },
    );
  }

  await supabase
    .from("chat_turns")
    .delete()
    .eq("chat_id", chatId)
    .gte("turn_index", turns.length);

  return { ok: true };
}

/**
 * Persist assistant variants to normalized tables; keep the full merged thread as cache.
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
  const { chatId, messages, traceId } = input;
  const context = derivePersistContext(messages);
  if (!context) return { ok: false, reason: "no_context" };

  const synced = await syncAllTurnsFromMessages(supabase, chatId, messages, traceId);
  if (!synced.ok) return synced;

  const cache = coerceMessages(messages);
  if (!cache.length) {
    return { ok: false, reason: "cache_empty" };
  }

  const { error: cacheError } = await supabase
    .from("chats")
    .update({ messages: cache, updated_at: new Date().toISOString() })
    .eq("id", chatId);

  if (cacheError) {
    return { ok: false, reason: "cache_update", error: cacheError };
  }

  return { ok: true, messages: cache };
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
