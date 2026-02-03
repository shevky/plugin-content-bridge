export async function fetchJson(url, options = {}, log, timeoutMs) {
  if (log && typeof log.debug === "function") {
    log.debug(`[Content Bridge] Fetching ${options.method ?? "GET"} ${url}`);
  }

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
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
  if (!response.ok) {
    throw new Error(`Content Bridge: API request failed (${response.status})`);
  }
  return response.json();
}
