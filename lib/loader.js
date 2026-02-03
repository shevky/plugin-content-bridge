import { fetchJson } from "./fetch.js";
import {
  buildFrontMatter,
  resolveContent,
  resolveMappingValue,
} from "./mapping.js";
import { getMissingRequired } from "./validation.js";
import { buildRequest } from "./request.js";
import { getNextPaginationState, normalizePagination } from "./pagination.js";
import { sleep } from "./utils.js";

export async function loadContentFromApi({
  ctx,
  url,
  method,
  headers,
  body,
  pagination,
  timeoutMs,
  frontMatterMapping,
  contentMapping,
  sourcePathMapping,
  pluginName,
  maxItems,
}) {
  const paging = normalizePagination(pagination);
  const resolve = (data, expr) => resolveMappingValue(data, expr);
  let pageIndex = paging.pageIndexStart;
  let nextCursor = paging.cursorStart;
  let hasMore = true;
  let isFirst = true;
  let addedCount = 0;

  while (hasMore) {
    if (!isFirst && paging.delayMs > 0) {
      await sleep(paging.delayMs);
    }

    const request = buildRequest({
      url,
      method,
      headers,
      body,
      pageParam: paging.pageParam,
      sizeParam: paging.sizeParam,
      pageIndex,
      pageSize: paging.pageSize,
      cursorParam: paging.cursorParam,
      nextCursor,
      log: ctx.log,
    });

    const data = await fetchJson(
      request.url,
      request.options,
      ctx.log,
      timeoutMs,
    );
    const items = resolve(data, paging.itemsPath);
    const posts = Array.isArray(items) ? items : [];

    for (const post of posts) {
      if (Number.isFinite(maxItems) && maxItems > 0 && addedCount >= maxItems) {
        return addedCount;
      }

      const frontMatter = buildFrontMatter(frontMatterMapping, post);

      if (frontMatter.lang) {
        frontMatter.lang = String(frontMatter.lang);
      }

      const content = resolveContent(contentMapping, post);

      const missingRequired = getMissingRequired(frontMatter);
      if (missingRequired.length > 0) {
        ctx.log.warn(
          `[${pluginName}] Missing required frontMatter fields: ${missingRequired.join(", ")}`,
        );
        throw new Error(`[${pluginName}] Missing required frontMatter fields.`);
      }

      if (typeof sourcePathMapping !== "string") {
        throw new Error(`[${pluginName}] Missing mapping.sourcePath.`);
      }

      const mapped = resolve(post, sourcePathMapping);
      if (typeof mapped !== "string" || mapped.trim().length === 0) {
        throw new Error(
          `[${pluginName}] sourcePath mapping returned empty value.`,
        );
      }

      const sourcePath = mapped.trim();

      const contentFile = {
        header: frontMatter,
        body: { content },
        content,
        sourcePath,
        isValid: true,
      };

      ctx.addContent(contentFile);
      addedCount += 1;
    }

    if (Number.isFinite(maxItems) && maxItems > 0 && addedCount >= maxItems) {
      return addedCount;
    }

    const nextState = getNextPaginationState({
      paging,
      data,
      itemsLength: posts.length,
      pageIndex,
      nextCursor,
      resolve,
    });

    hasMore = nextState.hasMore;
    pageIndex = nextState.pageIndex;
    nextCursor = nextState.nextCursor;
    isFirst = false;
  }

  return addedCount;
}
