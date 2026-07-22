import type { RefObject } from "react";
import {
  IconArrowUpRight,
  IconChevronLeft,
  IconChevronRight,
  IconDiamond,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconX,
} from "../icons";
import { AnswerBody } from "./answer-body";
import type { Message } from "./types";
import { WRITING_ANSWER_PLACEHOLDER, messageShowsVariantNav } from "@/lib/chat-messages.js";
import { KIND_LABELS, type Highlight } from "@/lib/highlights.js";
import {
  answerModeInfo,
  groupHighlightsByKind,
  isUploadOnlySources,
  pipelineSourceLabel,
  sourceHostname,
  uploadedSourceGuideLabel,
} from "@/lib/chat-message-ui.js";
import { isUploadedGuideUrl } from "@/lib/guide-urls.js";

/** Stop nudging for a guide after this many answers; re-nudge naturally in a new game. */
const NUDGE_MAX_ANSWERS = 10;

export type MessageListProps = {
  messages: Message[];
  loading: boolean;
  error: string;
  retryAction: (() => void) | null;
  editingIndex: number | null;
  spoilerMajor: boolean;
  generationStatus: string | null;
  indexingGuideCount: number;
  indexingIsBundlePages: boolean;
  bundlePageTotal: number;
  preferredUrlCount: number;
  lastUserIndex: number;
  lastGuideIndex: number;
  lastUserRef: RefObject<HTMLDivElement | null>;
  lastGuideRef: RefObject<HTMLElement | null>;
  feedRef: RefObject<HTMLDivElement | null>;
  editSlotRef: (el: HTMLDivElement | null) => void;
  onStartEdit: (index: number) => void;
  onRetry: (index: number) => void;
  onNavigateVariant: (msgIndex: number, variantIndex: number) => void;
  onOpenLightbox: (images: string[], index: number) => void;
  onAddGuide?: () => void;
  guideUpsellDismissed?: boolean;
  onDismissGuideUpsell?: () => void;
};

export function MessageList({
  messages,
  loading,
  error,
  retryAction,
  editingIndex,
  spoilerMajor,
  generationStatus,
  indexingGuideCount,
  indexingIsBundlePages,
  bundlePageTotal,
  preferredUrlCount,
  lastUserIndex,
  lastGuideIndex,
  lastUserRef,
  lastGuideRef,
  feedRef,
  editSlotRef,
  onStartEdit,
  onRetry,
  onNavigateVariant,
  onOpenLightbox,
  onAddGuide,
  guideUpsellDismissed,
  onDismissGuideUpsell,
}: MessageListProps) {
  const answerCount = messages.reduce(
    (count, message) => (message.role === "assistant" ? count + 1 : count),
    0,
  );
  return (
    <section className="feed" aria-live="polite">
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div
            className={`turn user${editingIndex === index ? " editing" : ""}`}
            key={index}
            id={`msg-${index}`}
            ref={index === lastUserIndex ? lastUserRef : undefined}
          >
            {editingIndex === index ? (
              // The composer is portaled into this slot (see page.tsx) so editing
              // happens right where the message sits, replacing the green bubble.
              <div className="composer-edit-slot" ref={editSlotRef} />
            ) : (
              <>
                {message.images && message.images.length > 0 && (
                  <div className="msg-images">
                    {message.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img
                          className="msg-image"
                          src={url}
                          alt="Attached"
                          loading="lazy"
                          onClick={(event) => {
                            event.preventDefault();
                            onOpenLightbox(message.images!, i);
                          }}
                          style={{ cursor: "zoom-in" }}
                        />
                      </a>
                    ))}
                  </div>
                )}
                <div className="user-bubble">
                  <p>{message.content}</p>
                  <button
                    type="button"
                    className="turn-action turn-action-icon"
                    aria-label="Edit message"
                    onClick={() => onStartEdit(index)}
                    disabled={loading}
                  >
                    <IconPencil />
                  </button>
                </div>
              </>
            )}
          </div>
        ) : loading && message.content === WRITING_ANSWER_PLACEHOLDER ? (
          // Regen: this bubble is just the placeholder while the loading card
          // below shows progress — hide it so "Writing answer..." isn't doubled.
          // The real answer replaces the placeholder and the bubble returns.
          null
        ) : (
          <article
            className="turn guide"
            key={index}
            ref={index === lastGuideIndex ? lastGuideRef : undefined}
          >
            <div className="guide-head">
              <div className="guide-tag icon-inline">
                <IconDiamond /> ANSWER

                {messageShowsVariantNav(message) && message.variants && (
                  <div
                    className="variant-nav"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      marginLeft: "1rem",
                      color: "var(--text-muted)",
                      fontSize: "0.85em",
                    }}
                  >
                    <button
                      type="button"
                      className="turn-action-icon"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: "0.15rem",
                        color:
                          message.activeVariantIndex === 0
                            ? "var(--text-muted-heavy)"
                            : "var(--text-muted)",
                        cursor: message.activeVariantIndex === 0 ? "default" : "pointer",
                      }}
                      disabled={message.activeVariantIndex === 0}
                      onClick={() =>
                        onNavigateVariant(index, (message.activeVariantIndex ?? 0) - 1)
                      }
                    >
                      <IconChevronLeft size={14} />
                    </button>
                    <span>
                      {(message.activeVariantIndex ?? 0) + 1} / {message.variants.length}
                    </span>
                    <button
                      type="button"
                      className="turn-action-icon"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: "0.15rem",
                        color:
                          message.activeVariantIndex === message.variants.length - 1
                            ? "var(--text-muted-heavy)"
                            : "var(--text-muted)",
                        cursor:
                          message.activeVariantIndex === message.variants.length - 1
                            ? "default"
                            : "pointer",
                      }}
                      disabled={message.activeVariantIndex === message.variants.length - 1}
                      onClick={() =>
                        onNavigateVariant(index, (message.activeVariantIndex ?? 0) + 1)
                      }
                    >
                      <IconChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
              {message.content !== WRITING_ANSWER_PLACEHOLDER &&
                (() => {
                  const mode = answerModeInfo(message.pipelineType, message.sources);
                  return (
                    <span
                      className={`answer-mode-chip${mode.guideBacked ? " is-guide" : ""}`}
                      title={
                        mode.guideBacked
                          ? "Grounded in your guide"
                          : "Answered from the model's general knowledge"
                      }
                    >
                      <span className="answer-mode-dot" aria-hidden="true" />
                      {mode.label}
                    </span>
                  );
                })()}
              <button
                type="button"
                className="turn-action turn-action-icon"
                aria-label="Regenerate answer"
                onClick={() => void onRetry(index)}
                disabled={loading}
              >
                <IconRefresh />
              </button>
            </div>
            <AnswerBody text={message.content} />
            {message.spoilers && spoilerMajor && message.spoilers.length > 0 && (
              <div className="spoiler-reveals">
                {message.spoilers.map((item, i) => (
                  <details key={`spoiler-${i}`} className="spoiler-reveal">
                    <summary>
                      <span className="spoiler-reveal-tag">Major spoiler</span>
                      {item.title || "Tap to reveal"}
                    </summary>
                    <AnswerBody text={item.detail} />
                  </details>
                ))}
              </div>
            )}
            {message.highlights && message.highlights.length > 0 && (
              <div className="highlights">
                {groupHighlightsByKind(message.highlights).map(({ kind, items }) => (
                  <section key={kind} className="highlight-group">
                    <h3 className="highlight-label">{KIND_LABELS[kind]}</h3>
                    <ul className="highlight-list">
                      {(items as Highlight[]).map((item, i) =>
                        item.detail ? (
                          <li key={`${kind}-${i}`}>
                            <details className={`highlight highlight-${kind}`}>
                              <summary>{item.title}</summary>
                              <p>{item.detail}</p>
                            </details>
                          </li>
                        ) : (
                          <li key={`${kind}-${i}`}>
                            <div className={`highlight highlight-${kind} highlight-note`}>
                              {item.title}
                            </div>
                          </li>
                        ),
                      )}
                    </ul>
                  </section>
                ))}
              </div>
            )}
            {onAddGuide &&
              index === lastGuideIndex &&
              preferredUrlCount === 0 &&
              !guideUpsellDismissed &&
              answerCount <= NUDGE_MAX_ANSWERS &&
              message.content !== WRITING_ANSWER_PLACEHOLDER &&
              !answerModeInfo(message.pipelineType, message.sources).guideBacked && (
                <div className="answer-upsell">
                  <p className="answer-upsell-copy">
                    Have a walkthrough? Get answers straight from the source.
                  </p>
                  <button
                    type="button"
                    className="answer-upsell-cta icon-inline"
                    onClick={onAddGuide}
                  >
                    <IconPlus size={14} /> Guide
                  </button>
                  {onDismissGuideUpsell && (
                    <button
                      type="button"
                      className="answer-upsell-dismiss"
                      onClick={onDismissGuideUpsell}
                      aria-label="Don't show this for this game"
                      title="Don't show this for this game"
                    >
                      <IconX size={14} />
                    </button>
                  )}
                </div>
              )}
            {isUploadOnlySources(message.sources) && (
              <div className="sources sources-static" aria-label="Sources">
                <p className="sources-static-label">
                  Sources
                  {(() => {
                    const uploadLabel = uploadedSourceGuideLabel(message.sources);
                    return uploadLabel ? <span> · {uploadLabel}</span> : null;
                  })()}
                </p>
              </div>
            )}
            {message.sources &&
              message.sources.length > 0 &&
              !isUploadOnlySources(message.sources) && (
                <details className="sources">
                  <summary>
                    Sources ({message.sources.length})
                    {message.pipelineType && (
                      <span style={{ fontWeight: "normal", color: "var(--text-muted)" }}>
                        {" · "}
                        {pipelineSourceLabel(message.pipelineType, message.sources)}
                      </span>
                    )}
                  </summary>
                  <ol>
                    {message.sources.map((source, i) => {
                      const number = (
                        <span className="source-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      );
                      // Uploaded files have no real URL to open (upload://…), so
                      // render them as plain text, not a broken link.
                      if (isUploadedGuideUrl(source.url)) {
                        return (
                          <li key={`${source.url}-${i}`}>
                            <div className="source-static-row">
                              {number}
                              <span>
                                <strong>{source.title}</strong>
                                <small>{uploadedSourceGuideLabel([source])}</small>
                              </span>
                            </div>
                          </li>
                        );
                      }
                      return (
                        <li key={`${source.url}-${i}`}>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {number}
                            <span>
                              <strong>{source.title}</strong>
                              <small>{sourceHostname(source.url)}</small>
                            </span>
                            <span className="source-arrow" aria-hidden="true">
                              <IconArrowUpRight />
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ol>
                </details>
              )}
          </article>
        ),
      )}

      {loading && (
        <div className="turn guide loading-card">
          <span className="scan-line" aria-hidden="true" />
          <p>
            {indexingGuideCount
              ? indexingIsBundlePages || bundlePageTotal > 1
                ? indexingGuideCount > 0
                  ? `Memorizing ${indexingGuideCount} pages for the first time. This might take a minute...`
                  : "Wrapping up memorizing..."
                : indexingGuideCount > 1
                  ? `Memorizing ${indexingGuideCount} guides for the first time...`
                  : "Memorizing your guide for the first time..."
              : generationStatus ||
                (preferredUrlCount
                  ? WRITING_ANSWER_PLACEHOLDER
                  : "Looking for answers online...")}
          </p>
        </div>
      )}

      {error && (
        <div
          className="error-card"
          role="alert"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span aria-hidden="true">!</span>
            <p>{error}</p>
          </div>
          {retryAction && (
            <button
              type="button"
              className="btn-icon"
              style={{ color: "var(--text-muted)" }}
              onClick={() => retryAction()}
              aria-label="Retry"
            >
              <IconRefresh />
            </button>
          )}
        </div>
      )}
      <div ref={feedRef} />
    </section>
  );
}
