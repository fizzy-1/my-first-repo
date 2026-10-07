/**
 * URL-driven list state (search, filters, sorting, pagination). Tables keep
 * their state in the query string so views are shareable and all filtering
 * happens server-side in SQL.
 */
export type SearchParams = Record<string, string | string[] | undefined>;

export interface ListParams<S extends string = string> {
  q: string;
  page: number;
  pageSize: number;
  sort: S;
  dir: "asc" | "desc";
  skip: number;
  filter: (name: string) => string | undefined;
}

export function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined || v === "" ? undefined : v;
}

export function parseListParams<S extends string>(
  sp: SearchParams,
  options: { sortable: readonly S[]; defaultSort: S; defaultDir?: "asc" | "desc"; pageSize?: number },
): ListParams<S> {
  const pageSize = options.pageSize ?? 20;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(first(sp.page) ?? "1", 10) || 1));
  const sortParam = first(sp.sort);
  const sort = sortParam && (options.sortable as readonly string[]).includes(sortParam) ? (sortParam as S) : options.defaultSort;
  const dirParam = first(sp.dir);
  const dir = dirParam === "asc" || dirParam === "desc" ? dirParam : (options.defaultDir ?? "desc");
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  return {
    q,
    page,
    pageSize,
    sort,
    dir,
    skip: (page - 1) * pageSize,
    filter: (name) => first(sp[name])?.slice(0, 64),
  };
}

/** Returns `value` if it is one of `allowed`, else undefined (for enum filters). */
export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[] | Record<string, unknown>): T | undefined {
  if (!value) return undefined;
  const list = Array.isArray(allowed) ? allowed : Object.keys(allowed);
  return list.includes(value) ? (value as T) : undefined;
}

export function buildHref(pathname: string, sp: SearchParams, overrides: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const v = first(value);
    if (v !== undefined) params.set(key, v);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  params.delete("new");
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
