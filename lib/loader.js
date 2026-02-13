import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
  markdownOutput,
  projectRoot,
}) {
  const outputOptions = resolveMarkdownOutputOptions(markdownOutput, projectRoot);
  if (markdownOutput && !outputOptions) {
    ctx.log.warn(
      `[${pluginName}] Invalid output config. Markdown export disabled for this source.`,
    );
  }

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

      if (outputOptions) {
        await writeMarkdownOutput({
          outputOptions,
          source: post,
          frontMatter,
          content,
          pluginName,
        });
      }

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

function resolveMarkdownOutputOptions(output, projectRoot) {
  if (!output || output === false || typeof output !== "object") {
    return null;
  }

  const directory =
    typeof output.directory === "string" ? output.directory.trim() : "";
  if (!directory) {
    return null;
  }

  const fileNameFormat =
    typeof output.fileNameFormat === "string" && output.fileNameFormat.trim()
      ? output.fileNameFormat.trim()
      : "{slug}.md";

  const root = typeof projectRoot === "string" && projectRoot.trim()
    ? projectRoot
    : process.cwd();
  const absoluteDirectory = path.isAbsolute(directory)
    ? path.resolve(directory)
    : path.resolve(root, directory);

  return { absoluteDirectory, fileNameFormat };
}

async function writeMarkdownOutput({
  outputOptions,
  source,
  frontMatter,
  content,
  pluginName,
}) {
  const rawFileName = buildOutputFileName(
    outputOptions.fileNameFormat,
    source,
    frontMatter,
  );
  if (!rawFileName) {
    throw new Error(
      `[${pluginName}] output.fileNameFormat produced an empty filename.`,
    );
  }

  const normalized = rawFileName.replaceAll("\\", "/").replace(/^\/+/, "");
  const fileName = path.extname(normalized) ? normalized : `${normalized}.md`;
  const targetPath = path.resolve(outputOptions.absoluteDirectory, fileName);
  const relativePath = path.relative(outputOptions.absoluteDirectory, targetPath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    !relativePath
  ) {
    throw new Error(
      `[${pluginName}] output.fileNameFormat resolved outside output.directory.`,
    );
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, renderMarkdown(frontMatter, content), "utf8");
}

function buildOutputFileName(fileNameFormat, source, frontMatter) {
  const templateData = buildTemplateData(source, frontMatter);
  const trimmedFormat = String(fileNameFormat ?? "").trim();

  if (isSingleMappingExpression(trimmedFormat)) {
    const mapped = resolveMappingValue(templateData, trimmedFormat);
    return mapped == null ? "" : String(mapped).trim();
  }

  const withPlaceholders = trimmedFormat
    .replace(/\{([^{}]+)\}/g, (_match, token) => {
      const expr = String(token ?? "").trim();
      if (!expr) {
        return "";
      }
      const mapped = resolveMappingValue(templateData, `$_${expr}`);
      return mapped == null ? "" : String(mapped);
    })
    .trim();

  return withPlaceholders
    .replace(/\$_[A-Za-z0-9_[\].]+/g, (fieldExpr) => {
      const mapped = resolveMappingValue(templateData, fieldExpr);
      return mapped == null ? "" : String(mapped);
    })
    .trim();
}

function isSingleMappingExpression(input) {
  if (!input) {
    return false;
  }

  if (/^\$_[A-Za-z0-9_[\].]+$/.test(input)) {
    return true;
  }

  return /^\$[A-Za-z_][A-Za-z0-9_]*\(.*\)$/.test(input);
}

function buildTemplateData(source, frontMatter) {
  const sourceSafe = source && typeof source === "object" ? source : {};
  const frontMatterSafe =
    frontMatter && typeof frontMatter === "object" ? frontMatter : {};

  return {
    ...sourceSafe,
    ...frontMatterSafe,
    source: sourceSafe,
    frontMatter: frontMatterSafe,
  };
}

function renderMarkdown(frontMatter, content) {
  const header = frontMatter && typeof frontMatter === "object" ? frontMatter : {};
  const frontMatterLines = Object.entries(header)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${toYamlScalar(value)}`);

  const body = typeof content === "string" ? content : String(content ?? "");
  if (!frontMatterLines.length) {
    return body;
  }

  return `---\n${frontMatterLines.join("\n")}\n---\n\n${body}`;
}

function toYamlScalar(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}
