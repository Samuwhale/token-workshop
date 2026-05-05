export interface PaginationQuery {
  limit?: string;
  offset?: string;
}

export interface PaginationOptions {
  defaultLimit: number;
  maxLimit: number;
}

export interface Pagination {
  limit: number;
  offset: number;
}

function readInteger(value: string | undefined): number | null {
  if (value == null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function readPagination(
  query: PaginationQuery,
  options: PaginationOptions,
): Pagination {
  const limit = readInteger(query.limit) ?? options.defaultLimit;

  const offset = readInteger(query.offset) ?? 0;

  return {
    limit: Math.min(Math.max(1, limit), options.maxLimit),
    offset: Math.max(0, offset),
  };
}

export function hasNextPage(
  offset: number,
  returnedCount: number,
  total: number,
): boolean {
  return offset + returnedCount < total;
}
