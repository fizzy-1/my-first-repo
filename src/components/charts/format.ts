import { formatNumber, formatPercent, formatZAR } from "@/lib/format";

/** Serializable value formats (functions cannot cross the server → client boundary). */
export type ValueFormat = "zar" | "number" | "percent" | "hours";

export function formatValue(value: number | null | undefined, format: ValueFormat, compact = false): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "zar":
      return formatZAR(value, { compact });
    case "percent":
      return formatPercent(value);
    case "hours":
      return `${formatNumber(value, { decimals: value % 1 === 0 ? 0 : 1 })}h`;
    default:
      return formatNumber(value, { compact });
  }
}
