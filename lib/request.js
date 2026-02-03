export function buildRequest({
  url,
  method,
  headers,
  body,
  pageParam,
  sizeParam,
  pageIndex,
  pageSize,
  cursorParam,
  nextCursor,
  log,
}) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const baseHeaders = { ...(headers ?? {}) };

  if (normalizedMethod === "GET") {
    const queryUrl = new URL(url);
    if (pageParam && Number.isFinite(pageIndex)) {
      queryUrl.searchParams.set(pageParam, String(pageIndex));
    }
    if (sizeParam && Number.isFinite(pageSize)) {
      queryUrl.searchParams.set(sizeParam, String(pageSize));
    }
    if (cursorParam && nextCursor != null) {
      queryUrl.searchParams.set(cursorParam, String(nextCursor));
    }
    return {
      url: queryUrl.toString(),
      options: {
        method: normalizedMethod,
        headers: baseHeaders,
      },
    };
  }

  let payload = body;
  if (payload && typeof payload === "object" && !(payload instanceof String)) {
    payload = { ...payload };
    if (pageParam && Number.isFinite(pageIndex)) {
      payload[pageParam] = pageIndex;
    }
    if (sizeParam && Number.isFinite(pageSize)) {
      payload[sizeParam] = pageSize;
    }
    if (cursorParam && nextCursor != null) {
      payload[cursorParam] = nextCursor;
    }
  } else if ((pageParam || sizeParam || cursorParam) && log) {
    log.warn(
      "[Content Bridge] Pagination params could not be added to string body.",
    );
  }

  let finalBody = payload;
  if (payload && typeof payload === "object" && !(payload instanceof String)) {
    finalBody = JSON.stringify(payload);
    if (!baseHeaders["content-type"] && !baseHeaders["Content-Type"]) {
      baseHeaders["Content-Type"] = "application/json";
    }
  }

  return {
    url,
    options: {
      method: normalizedMethod,
      headers: baseHeaders,
      body: finalBody,
    },
  };
}
