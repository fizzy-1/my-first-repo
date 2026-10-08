import { Fragment } from "react";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlights case-insensitive occurrences of any term in `text`. Matches are
 * wrapped in <mark> elements built by React, so the text is never parsed as HTML.
 */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const usable = [...new Set(terms.filter((t) => t.length > 0))].sort((a, b) => b.length - a.length);
  if (usable.length === 0) return text;
  // A capturing group makes split() keep the matches at odd indexes.
  const parts = text.split(new RegExp(`(${usable.map(escapeRegExp).join("|")})`, "gi"));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-[3px] bg-gold-soft font-semibold text-gold-foreground">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
