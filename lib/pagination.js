import { toBoolean, toNumberOrUndefined } from "./utils.js";

export function normalizePagination(pagination) {
  const paging = pagination ?? {};
  const pageParam = paging.pageParam;
  const inferredMode =
    paging.mode ??
    (typeof pageParam === "string" &&
    ["skip", "offset"].includes(pageParam)
      ? "offset"
      : undefined);
  const pageSize = toNumberOrUndefined(paging.pageSize);
  const pageIndexStep = toNumberOrUndefined(paging.pageIndexStep);

  return {
    mode: inferredMode,
    pageParam,
    sizeParam: paging.sizeParam,
    pageSize,
    delayMs: toNumberOrUndefined(paging.delayMs) ?? 0,
    itemsPath: paging.itemsPath ?? "$_posts",
    totalPath: paging.totalPath,
    hasMorePath: paging.hasMorePath,
    nextPagePath: paging.nextPagePath,
    nextCursorPath: paging.nextCursorPath,
    cursorParam: paging.cursorParam,
    pageIndexStart: toNumberOrUndefined(paging.pageIndexStart) ?? 1,
    pageIndexStep:
      pageIndexStep ??
      (inferredMode === "offset" && Number.isFinite(pageSize)
        ? pageSize
        : 1),
    cursorStart: paging.cursorStart,
  };
}

export function getNextPaginationState({
  paging,
  data,
  itemsLength,
  pageIndex,
  nextCursor,
  resolve,
}) {
  if (itemsLength === 0) {
    return { hasMore: false, pageIndex, nextCursor };
  }

  const context = {
    paging,
    data,
    itemsLength,
    pageIndex,
    nextCursor,
    resolve,
  };

  for (const strategy of STRATEGIES) {
    const result = strategy(context);
    if (result) {
      return result;
    }
  }

  return { hasMore: true, pageIndex: pageIndex + 1, nextCursor };
}

const STRATEGIES = [
  function nextCursorStrategy({ paging, data, pageIndex, nextCursor, resolve }) {
    if (typeof paging.nextCursorPath !== "string") {
      return null;
    }
    const value = resolve(data, paging.nextCursorPath);
    if (value == null || value === "") {
      return { hasMore: false, pageIndex, nextCursor };
    }
    return { hasMore: true, pageIndex, nextCursor: String(value) };
  },
  function hasMoreStrategy({ paging, data, pageIndex, nextCursor, resolve }) {
    if (typeof paging.hasMorePath !== "string") {
      return null;
    }
    const value = resolve(data, paging.hasMorePath);
    const hasMore = toBoolean(value);
    return {
      hasMore,
      pageIndex: hasMore ? pageIndex + paging.pageIndexStep : pageIndex,
      nextCursor,
    };
  },
  function nextPageStrategy({ paging, data, pageIndex, nextCursor, resolve }) {
    if (typeof paging.nextPagePath !== "string") {
      return null;
    }
    const value = resolve(data, paging.nextPagePath);
    const next = toNumberOrUndefined(value);
    if (!Number.isFinite(next)) {
      return { hasMore: false, pageIndex, nextCursor };
    }
    return { hasMore: true, pageIndex: next, nextCursor };
  },
  function totalStrategy({ paging, data, pageIndex, nextCursor, resolve }) {
    if (typeof paging.totalPath !== "string" || !Number.isFinite(paging.pageSize)) {
      return null;
    }
    const totalValue = resolve(data, paging.totalPath);
    const total = toNumberOrUndefined(totalValue);
    if (!Number.isFinite(total)) {
      return { hasMore: false, pageIndex, nextCursor };
    }
    const hasMore =
      paging.mode === "offset"
        ? pageIndex + paging.pageSize < total
        : pageIndex * paging.pageSize < total;
    return { hasMore, pageIndex: pageIndex + paging.pageIndexStep, nextCursor };
  },
  function shortPageStrategy({ paging, itemsLength, pageIndex, nextCursor }) {
    if (!Number.isFinite(paging.pageSize)) {
      return null;
    }
    if (itemsLength < paging.pageSize) {
      return { hasMore: false, pageIndex, nextCursor };
    }
    return null;
  },
];
