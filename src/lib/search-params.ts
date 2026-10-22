/** Props shape for App Router pages that read the query string (Next 15+ passes it as a Promise). */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export interface PageWithSearchParams {
  searchParams: Promise<SearchParamsRecord>;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
