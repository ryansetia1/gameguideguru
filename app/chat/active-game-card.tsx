import type { RefObject } from "react";
import type { User } from "@supabase/supabase-js";
import { BundleIndexPanel } from "../bundle-index-panel";
import { GuideLinkField, type GuideBundleMeta } from "../guide-link-field";
import { HltbRow } from "../hltb-row";
import {
  IconAlert,
  IconArrowUpRight,
  IconChevronDown,
  IconDotsVertical,
  IconIncognito,
  IconPlus,
  IconRefresh,
  IconX,
} from "../icons";
import { gameCardGuideRow } from "@/lib/guide-card-ui.js";
import { guideUrlDedupeKey } from "@/lib/guide-urls.js";
import { steamAppIdFromCoverUrl } from "@/lib/steam.js";
import { CoverThumb, displayPlatform } from "./cover-thumb";
import { GuideStatusChip } from "./guide-status-chip";
import { SpoilerToggle } from "./spoiler-toggle";

type GuideIndexState = Record<
  string,
  "unknown" | "checking" | "indexed" | "failed" | "unavailable" | "pending"
>;

export type ActiveGameCardProps = {
  topRef: RefObject<HTMLElement | null>;
  coverEnabled: boolean;
  cover: string;
  game: string;
  platform: string;
  releaseYear: string;
  activeChatId: string | null;
  temporary: boolean;
  loading: boolean;
  menuOpenId: string | null;
  preferredUrls: string[];
  guideBundleMeta: Record<string, GuideBundleMeta>;
  bundleIndexStatus: Record<
    string,
    { pages: { slug: string; title: string; url: string; chunks: number }[] }
  >;
  bundlePanelLoad: Record<string, { meta: boolean; status: boolean }>;
  guideIndexState: GuideIndexState;
  showQuickAdd: boolean;
  guidePending: boolean;
  retryingBundleUrl: string | null;
  refreshingBundleUrl: string | null;
  isReindexingAll: boolean;
  gameSpoilerMajor: boolean;
  user: User | null;
  onToggleTemporary: () => void;
  onToggleRowMenu: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onEditGame: () => void;
  onDeleteActiveChat: () => void;
  onSetShowQuickAdd: (value: boolean) => void;
  onPreferredUrlsChange: (urls: string[]) => void;
  onBundleMetaChange: (meta: Record<string, GuideBundleMeta>) => void;
  onGuideCheckChange: (checking: boolean) => void;
  onGuidePendingChange: (pending: boolean) => void;
  onRequestConfirm: (opts: {
    message: string;
    confirmLabel?: string;
    danger?: boolean;
  }) => Promise<boolean>;
  onSaveGameMeta: () => void;
  onRetryBundleIngest: (url: string) => void;
  onSkipBundlePage: (url: string, slug: string) => void;
  onUnskipBundlePage: (url: string, slug: string) => void;
  onSkipAllMissingBundlePages: (url: string, slugs: string[]) => void;
  onRefreshBundleDiscovery: (url: string) => void;
  onReindexAllPending: () => void;
  onGameSpoilerChange: (value: boolean) => void;
};

export function ActiveGameCard({
  topRef,
  coverEnabled,
  cover,
  game,
  platform,
  releaseYear,
  activeChatId,
  temporary,
  loading,
  menuOpenId,
  preferredUrls,
  guideBundleMeta,
  bundleIndexStatus,
  bundlePanelLoad,
  guideIndexState,
  showQuickAdd,
  guidePending,
  retryingBundleUrl,
  refreshingBundleUrl,
  isReindexingAll,
  gameSpoilerMajor,
  user,
  onToggleTemporary,
  onToggleRowMenu,
  onEditGame,
  onDeleteActiveChat,
  onSetShowQuickAdd,
  onPreferredUrlsChange,
  onBundleMetaChange,
  onGuideCheckChange,
  onGuidePendingChange,
  onRequestConfirm,
  onSaveGameMeta,
  onRetryBundleIngest,
  onSkipBundlePage,
  onUnskipBundlePage,
  onSkipAllMissingBundlePages,
  onRefreshBundleDiscovery,
  onReindexAllPending,
  onGameSpoilerChange,
}: ActiveGameCardProps) {
  const renderQuickAdd = () => (
    <div style={{ marginTop: "12px", flex: "0 0 100%", width: "100%", minWidth: 0 }}>
      {!showQuickAdd ? (
        <button
          type="button"
          className="nav-button"
          onClick={() => onSetShowQuickAdd(true)}
          style={{ width: "100%", justifyContent: "center", opacity: 0.8 }}
        >
          <IconPlus size={14} style={{ marginRight: "6px" }} /> Quick Add Guide
        </button>
      ) : (
        <div
          className="opt-panel"
          style={{
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: "6px",
            padding: "12px",
            minWidth: 0,
          }}
        >
          <GuideLinkField
            value={preferredUrls}
            onChange={onPreferredUrlsChange}
            bundleMeta={guideBundleMeta}
            onBundleMetaChange={onBundleMetaChange}
            onGuideCheckChange={onGuideCheckChange}
            onPendingChange={onGuidePendingChange}
            guideIndexState={guideIndexState}
            game={game}
            platform={platform}
            disabled={loading}
            userId={user?.id}
          />
          <div style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              className="nav-button"
              onClick={async () => {
                if (guidePending) {
                  const ok = await onRequestConfirm({
                    message: "You have a guide selected but haven't added it. Close anyway?",
                    confirmLabel: "Close without adding",
                    danger: true,
                  });
                  if (!ok) return;
                }
                onSetShowQuickAdd(false);
                onSaveGameMeta();
              }}
              style={{
                background: preferredUrls.length > 0 ? "var(--signal)" : "var(--action)",
                color: preferredUrls.length > 0 ? "var(--on-signal)" : "white",
                borderColor: preferredUrls.length > 0 ? "var(--signal)" : "var(--action)",
                width: "100%",
                justifyContent: "center",
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderGuideStack = (url: string) => {
    const row = gameCardGuideRow(
      url,
      guideBundleMeta[url],
      bundleIndexStatus[url],
      bundlePanelLoad[url],
      guideIndexState[url],
    );
    return (
      <div key={guideUrlDedupeKey(url)} className="game-card-guide-stack">
        {row.uploaded ? (
          <div className={`game-card-link is-${row.state}`}>
            <span
              className="icon-inline"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "nowrap",
                overflow: "hidden",
                width: "100%",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {row.label}
              </span>
              {row.state && row.state !== "unknown" && (
                <span style={{ flexShrink: 0 }}>
                  <GuideStatusChip state={row.state} />
                </span>
              )}
              {(!row.state || row.state === "pending" || row.state === "failed" || row.state === "unknown") && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRetryBundleIngest(url);
                  }}
                  disabled={retryingBundleUrl === url || isReindexingAll}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted)",
                    display: "flex",
                    padding: "2px",
                    flexShrink: 0,
                    opacity: retryingBundleUrl === url || isReindexingAll ? 0.5 : 1,
                  }}
                  title="Reindex this guide"
                  aria-label="Reindex this guide"
                >
                  <IconRefresh size={14} className={retryingBundleUrl === url ? "spin" : ""} />
                </button>
              )}
              {row.isBlocked && (
                <span
                  className="guide-status-chip"
                  style={{ color: "var(--danger)", borderColor: "var(--danger)", flexShrink: 0 }}
                >
                  <IconAlert size={12} /> Blocked
                </span>
              )}
              <span style={{ flexShrink: 0, width: "20px", display: "flex" }} />
            </span>
          </div>
        ) : (
          <a
            className={`game-card-link is-${row.state}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-busy={row.bundle && row.panelLoading ? true : undefined}
          >
            <span
              className="icon-inline"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "nowrap",
                overflow: "hidden",
                width: "100%",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {row.label}
              </span>
              {row.state && row.state !== "unknown" && (
                <span style={{ flexShrink: 0 }}>
                  <GuideStatusChip state={row.state} />
                </span>
              )}
              {(!row.state || row.state === "pending" || row.state === "failed" || row.state === "unknown") && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRetryBundleIngest(url);
                  }}
                  disabled={retryingBundleUrl === url || isReindexingAll}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted)",
                    display: "flex",
                    padding: "2px",
                    flexShrink: 0,
                    opacity: retryingBundleUrl === url || isReindexingAll ? 0.5 : 1,
                  }}
                  title="Reindex this guide"
                  aria-label="Reindex this guide"
                >
                  <IconRefresh size={14} className={retryingBundleUrl === url ? "spin" : ""} />
                </button>
              )}
              {row.isBlocked && (
                <span
                  className="guide-status-chip"
                  style={{ color: "var(--danger)", borderColor: "var(--danger)", flexShrink: 0 }}
                >
                  <IconAlert size={12} /> Blocked
                </span>
              )}
              {row.bundle && row.panelLoading ? (
                <span
                  className="game-card-bundle-spinner loader"
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                />
              ) : null}
              <span style={{ flexShrink: 0, display: "flex" }}>
                <IconArrowUpRight />
              </span>
            </span>
          </a>
        )}
        {row.bundle && !row.panelLoading && row.showPanel ? (
          <BundleIndexPanel
            discoveredPages={row.discoveredPages}
            indexedPages={row.indexedPages}
            missingPages={row.missingPages}
            skippedSlugs={row.skippedSlugs}
            selectionLocked={row.selectionLocked}
            onSkipPage={(slug) => onSkipBundlePage(url, slug)}
            onUnskipPage={(slug) => onUnskipBundlePage(url, slug)}
            onSkipAllMissing={
              row.missingPages.length
                ? () => onSkipAllMissingBundlePages(url, row.missingPages.map((page) => page.slug))
                : undefined
            }
            onRetryMissing={row.missingPages.length ? () => onRetryBundleIngest(url) : undefined}
            onRefreshList={() => onRefreshBundleDiscovery(url)}
            retrying={retryingBundleUrl === url}
            refreshingList={refreshingBundleUrl === url}
          />
        ) : null}
      </div>
    );
  };

  const hasBlocked = preferredUrls.some((url) => guideBundleMeta[url]?.isBlocked);
  const hasFailed = preferredUrls.some((url) => guideIndexState[url] === "failed");
  const isCollapsible = preferredUrls.length > 2;

  return (
    <section className="game-card" aria-label="Game" ref={topRef}>
      {activeChatId && !temporary && (
        <button
          type="button"
          className="game-card-incognito"
          title="Start a temporary chat"
          aria-label="Start a temporary chat"
          disabled={loading}
          onClick={onToggleTemporary}
        >
          <IconIncognito size={18} />
        </button>
      )}
      <div className="row-menu game-card-menu">
        <button
          type="button"
          className="kebab"
          aria-label="Game options"
          aria-expanded={menuOpenId === "game-card"}
          onClick={(event) => onToggleRowMenu("game-card", event)}
          disabled={loading}
        >
          <IconDotsVertical />
        </button>
        {menuOpenId === "game-card" && (
          <div className="row-menu-pop" role="menu">
            <button type="button" className="row-menu-item" onClick={onEditGame}>
              Edit
            </button>
            <button
              type="button"
              className="row-menu-item row-menu-delete"
              onClick={() => void onDeleteActiveChat()}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {coverEnabled && <CoverThumb cover={cover} name={game} className="cover-lg" />}
      <div className={`game-card-meta${activeChatId && !temporary ? " has-quick" : ""}`}>
        <h2>{game || "Untitled game"}</h2>
        {(platform || releaseYear) && (
          <p>{[displayPlatform(platform, cover), releaseYear].filter(Boolean).join(" · ")}</p>
        )}
        <HltbRow title={game} appId={steamAppIdFromCoverUrl(cover)?.toString()} />
      </div>
      <div className="game-card-guides">
        <details
          className={isCollapsible ? "sources game-card-guides-hidden" : ""}
          open={isCollapsible ? showQuickAdd || undefined : true}
          style={!isCollapsible ? { display: "contents" } : undefined}
        >
          <summary
            style={{
              display: isCollapsible ? "flex" : "none",
              alignItems: "center",
              gap: "8px",
              fontWeight: 600,
            }}
          >
            <span style={{ flex: 1 }}>Guides ({preferredUrls.length})</span>
            {preferredUrls.some((url) => {
              const st = guideIndexState[url];
              return !st || st === "pending" || st === "failed" || st === "unknown";
            }) && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onReindexAllPending();
                }}
                disabled={isReindexingAll}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted)",
                  display: "flex",
                  padding: "4px",
                  flexShrink: 0,
                  opacity: isReindexingAll ? 0.5 : 1,
                }}
                title="Reindex all pending guides"
                aria-label="Reindex all pending guides"
              >
                <IconRefresh size={14} className={isReindexingAll ? "spin" : ""} />
              </button>
            )}
            {hasBlocked && (
              <span
                className="guide-status-chip"
                style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
              >
                <IconAlert size={12} /> Blocked
              </span>
            )}
            {hasFailed && (
              <span className="guide-status-chip is-failed">
                <IconX size={10} /> Failed
              </span>
            )}
            {isCollapsible ? (
              <span className="chevron-toggle" aria-hidden>
                <IconChevronDown size={14} />
              </span>
            ) : null}
          </summary>

          <div
            className={isCollapsible ? "game-card-guides" : ""}
            style={isCollapsible ? { marginTop: "8px" } : undefined}
          >
            {preferredUrls.map(renderGuideStack)}
            {renderQuickAdd()}
          </div>
        </details>
      </div>
      <div className="game-card-spoiler spoiler-panel">
        <SpoilerToggle prefs={{ major: gameSpoilerMajor }} onChange={onGameSpoilerChange} compact />
      </div>
    </section>
  );
}
