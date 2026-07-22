import { KINDS } from "./highlights.js";
import { isUploadedGuideUrl, uploadedGuideFileTypeLabel } from "./guide-urls.js";

/**
 * @param {string} url
 */
export function sourceHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

/**
 * @param {Array<{ title: string; url: string }> | undefined} sources
 */
export function uploadedSourceGuideLabel(sources) {
  const uploadSrc = sources?.find((source) => isUploadedGuideUrl(source.url));
  if (!uploadSrc) return null;
  const fileType = uploadedGuideFileTypeLabel(uploadSrc.url);
  if (fileType === "PDF" || fileType === "TXT" || fileType === "MD") {
    return `${fileType} guide`;
  }
  return "Uploaded guide";
}

/**
 * @param {string | undefined} pipelineType
 * @param {Array<{ title: string; url: string }> | undefined} sources
 */
export function pipelineSourceLabel(pipelineType, sources) {
  const uploadLabel = uploadedSourceGuideLabel(sources);
  const hasWebSources = sources?.some((source) => !isUploadedGuideUrl(source.url));

  if (uploadLabel) {
    if (pipelineType === "fallback_web" || (hasWebSources && pipelineType !== "rag")) {
      return `${uploadLabel} + Web search`;
    }
    return uploadLabel;
  }

  if (pipelineType === "rag") return "Your guide";
  if (pipelineType === "fallback_web" || pipelineType === "web") return "Web search";
  return "AI knowledge";
}

/**
 * The answer's source mode for the top-of-card chip: `label` is the human
 * string (reuses pipelineSourceLabel), `guideBacked` drives the accent dot vs
 * the muted "from general knowledge" dot and gates the inline upsell.
 *
 * @param {string | undefined} pipelineType
 * @param {Array<{ title: string; url: string }> | undefined} sources
 */
export function answerModeInfo(pipelineType, sources) {
  const label = pipelineSourceLabel(pipelineType, sources);
  const guideBacked =
    pipelineType === "rag" || isUploadOnlySources(sources) || /guide/i.test(label);
  return { label, guideBacked };
}

/**
 * @param {Array<{ title: string; url: string }> | undefined} sources
 */
export function isUploadOnlySources(sources) {
  return Boolean(
    sources?.length && sources.every((source) => isUploadedGuideUrl(source.url)),
  );
}

/**
 * @param {Array<{ kind: string }>} highlights
 */
export function groupHighlightsByKind(highlights) {
  return KINDS.flatMap((kind) => {
    const items = highlights.filter((highlight) => highlight.kind === kind);
    return items.length ? [{ kind, items }] : [];
  });
}
