export async function fetchJson(url, options = {}, log, timeoutMs) {
  if (log && typeof log.debug === "function") {
    log.debug(`[Content Bridge] Fetching ${options.method ?? "GET"} ${url}`);
  }

  const startedAt = Date.now();
  const controller =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? new AbortController()
      : null;
  const timer =
    controller && Number.isFinite(timeoutMs)
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: controller ? controller.signal : options.signal,
    });
  } catch (error) {
    if (log && typeof log.debug === "function") {
      const elapsedMs = Date.now() - startedAt;
      log.debug(
        `[Content Bridge] Fetch failed after ${elapsedMs}ms (${options.method ?? "GET"} ${url})`,
      );
    }
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  if (log && typeof log.debug === "function") {
    log.debug(
      `[Content Bridge] Fetch completed in ${elapsedMs}ms with status ${response.status} (${options.method ?? "GET"} ${url})`,
    );
  }

  if (!response.ok) {
    const error = new Error(
      `Content Bridge: API request failed (${response.status})`,
    );
    error.name = "ContentBridgeHttpError";
    error.status = response.status;
    error.statusText = response.statusText;
    error.url = url;
    throw error;
  }
  return response.json();
}
