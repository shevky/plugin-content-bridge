import { format } from "@shevky/base";
import crypto from "node:crypto";
import { nanoid as nanoidLib } from "nanoid";

export function buildFrontMatter(mapping, source) {
  return resolveObject(mapping ?? {}, source);
}

export function resolveContent(mapping, source) {
  if (typeof mapping !== "string") {
    return "";
  }
  return resolveMappingValue(source, mapping) ?? "";
}

export function resolveMappingValue(source, expr) {
  if (expr == null) {
    return undefined;
  }

  if (typeof expr !== "string") {
    return expr;
  }

  const trimmed = expr.trim();
  if (trimmed.startsWith("$_")) {
    return getValue(source, trimmed.slice(2));
  }

  if (trimmed.startsWith("$") && trimmed.includes("(") && trimmed.endsWith(")")) {
    const name = trimmed.slice(1, trimmed.indexOf("(")).trim();
    const inner = trimmed.slice(trimmed.indexOf("(") + 1, -1);
    return callFunction(name, splitArgs(inner).map((arg) => arg.trim()), source);
  }

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function getValue(source, path) {
  if (!path) {
    return undefined;
  }

  const parts = String(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  let current = source;
  for (const key of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

function splitArgs(input) {
  const args = [];
  let current = "";
  let quote = "";
  let depth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote) {
        quote = "";
      }
      current += char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    args.push(current.trim());
  }

  return args;
}

function callFunction(name, args, source) {
  const resolved = args.map((arg) => resolveMappingValue(source, arg));

  switch (name) {
    case "slugify":
      return format.slugify(String(resolved[0] ?? ""));
    case "concat":
      return resolved.map((val) => (val == null ? "" : String(val))).join("");
    case "today":
      return new Date().toISOString();
    case "now":
      return new Date().toISOString();
    case "lower":
      return String(resolved[0] ?? "").toLowerCase();
    case "upper":
      return String(resolved[0] ?? "").toUpperCase();
    case "trim":
      return String(resolved[0] ?? "").trim();
    case "join": {
      const list = Array.isArray(resolved[0]) ? resolved[0] : [];
      const separator = resolved[1] == null ? "," : String(resolved[1]);
      return list.map((item) => (item == null ? "" : String(item))).join(separator);
    }
    case "merge": {
      const arrays = resolved.filter((value) => Array.isArray(value));
      return arrays.flat();
    }
    case "unique": {
      const list = Array.isArray(resolved[0]) ? resolved[0] : [];
      const seen = new Set();
      const result = [];
      for (const item of list) {
        const key = item == null ? "" : String(item);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(item);
        }
      }
      return result;
    }
    case "date": {
      const value = resolved[0];
      const formatValue = resolved[1];
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) {
        return undefined;
      }
      if (!formatValue) {
        return date.toISOString();
      }
      return formatDate(date, String(formatValue));
    }
    case "number": {
      const num = Number(resolved[0]);
      return Number.isNaN(num) ? undefined : num;
    }
    case "boolean":
      return toBoolean(resolved[0]);
    case "default": {
      const value = resolved[0];
      if (value === null || value === undefined || value === "") {
        return resolved[1];
      }
      return value;
    }
    case "replace": {
      const value = String(resolved[0] ?? "");
      const from = String(resolved[1] ?? "");
      const to = String(resolved[2] ?? "");
      if (!from) {
        return value;
      }
      return value.split(from).join(to);
    }
    case "if":
      return toBoolean(resolved[0]) ? resolved[1] : resolved[2];
    case "eq":
      return valuesEqual(resolved[0], resolved[1]);
    case "neq":
      return !valuesEqual(resolved[0], resolved[1]);
    case "gt":
      return compareValues(resolved[0], resolved[1]) > 0;
    case "gte":
      return compareValues(resolved[0], resolved[1]) >= 0;
    case "lt":
      return compareValues(resolved[0], resolved[1]) < 0;
    case "lte":
      return compareValues(resolved[0], resolved[1]) <= 0;
    case "and":
      return resolved.every((value) => toBoolean(value));
    case "or":
      return resolved.some((value) => toBoolean(value));
    case "not":
      return !toBoolean(resolved[0]);
    case "coalesce": {
      for (const value of resolved) {
        if (!isNullishOrEmptyString(value)) {
          return value;
        }
      }
      return undefined;
    }
    case "htmlToMD":
      return htmlToMarkdown(resolved[0]);
    case "truncate": {
      const text = String(resolved[0] ?? "");
      const rawLength = Number(resolved[1]);
      if (!Number.isFinite(rawLength)) {
        return text;
      }
      const maxLength = Math.floor(rawLength);
      if (maxLength <= 0) {
        return "";
      }
      return text.length > maxLength ? text.slice(0, maxLength) : text;
    }
    case "contains":
      return containsValue(resolved[0], resolved[1]);
    case "compact":
      return compactArray(resolved[0]);
    case "nanoid": {
      const length = Number(resolved[0] ?? 21);
      const size = Number.isFinite(length) && length > 0 ? Math.floor(length) : 21;
      return nanoidLib(size);
    }
    case "uuid":
      return crypto.randomUUID();
    default:
      return undefined;
  }
}

function setValue(target, path, value) {
  if (!path || typeof path !== "string" || !path.includes(".")) {
    target[path] = value;
    return;
  }

  const parts = path.split(".").filter(Boolean);
  let current = target;
  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      current[key] = value;
      return;
    }
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
}

function resolveObject(input, source) {
  if (!input || typeof input !== "object") {
    return {};
  }

  const output = Array.isArray(input) ? [] : {};
  for (const [key, rawValue] of Object.entries(input)) {
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      output[key] = resolveObject(rawValue, source);
      continue;
    }

    const value = resolveMappingValue(source, rawValue);
    if (value !== undefined) {
      if (key.includes(".")) {
        setValue(output, key, value);
      } else {
        output[key] = value;
      }
    }
  }

  return output;
}

function formatDate(date, pattern) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return pattern
    .replace(/YYYY/g, year)
    .replace(/MM/g, month)
    .replace(/DD/g, day)
    .replace(/HH/g, hours)
    .replace(/mm/g, minutes)
    .replace(/ss/g, seconds);
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes", "y", "on"].includes(normalized);
  }
  return Boolean(value);
}

function isNullishOrEmptyString(value) {
  return value === null || value === undefined || value === "";
}

function isNumericLike(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "string") {
    return false;
  }
  if (value.trim().length === 0) {
    return false;
  }
  const num = Number(value);
  return Number.isFinite(num);
}

function valuesEqual(left, right) {
  if (isNumericLike(left) && isNumericLike(right)) {
    return Number(left) === Number(right);
  }
  return left === right;
}

function compareValues(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return Number.NaN;
  }
  if (isNumericLike(left) && isNumericLike(right)) {
    return Number(left) - Number(right);
  }

  const leftString = String(left);
  const rightString = String(right);
  if (leftString === rightString) {
    return 0;
  }
  return leftString > rightString ? 1 : -1;
}

function containsValue(valueOrArray, needle) {
  if (Array.isArray(valueOrArray)) {
    return valueOrArray.some((item) => valuesEqual(item, needle));
  }
  if (typeof valueOrArray === "string") {
    return valueOrArray.includes(String(needle ?? ""));
  }
  return false;
}

function isEmptyValue(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

function compactArray(value) {
  const list = Array.isArray(value) ? value : [];
  return list.filter((item) => !isEmptyValue(item));
}

function stripHtmlTags(value) {
  return String(value ?? "").replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(value) {
  const input = String(value ?? "");
  const namedEntityMap = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };

  return input
    .replace(/&#(\d+);/g, (match, code) => decodeCodePoint(code, 10, match))
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => decodeCodePoint(hex, 16, match))
    .replace(/&([a-z]+);/gi, (_, name) => namedEntityMap[name] ?? `&${name};`);
}

function decodeCodePoint(value, radix, fallback) {
  const parsed = Number.parseInt(value, radix);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0x10ffff) {
    return fallback;
  }
  return String.fromCodePoint(parsed);
}

function htmlToMarkdown(value) {
  if (value == null) {
    return "";
  }

  let markdown = String(value).replace(/\r\n/g, "\n");
  if (!markdown.trim()) {
    return "";
  }

  markdown = markdown.replace(
    /<\s*pre\b[^>]*>\s*<\s*code\b[^>]*>([\s\S]*?)<\s*\/\s*code>\s*<\s*\/\s*pre>/gi,
    (_, code) => `\n\`\`\`\n${decodeHtmlEntities(code).trim()}\n\`\`\`\n`,
  );

  markdown = markdown.replace(
    /<\s*h([1-6])\b[^>]*>([\s\S]*?)<\s*\/\s*h\1>/gi,
    (_, level, content) => `${"#".repeat(Number(level))} ${stripHtmlTags(content).trim()}\n\n`,
  );

  markdown = markdown
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*(strong|b)>/gi, "**$2**")
    .replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\s*\/\s*(em|i)>/gi, "*$2*")
    .replace(
      /<\s*code\b[^>]*>([\s\S]*?)<\s*\/\s*code>/gi,
      (_, content) => `\`${decodeHtmlEntities(stripHtmlTags(content).trim())}\``,
    )
    .replace(
      /<\s*a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\s*\/\s*a>/gi,
      (_, href, content) => `[${stripHtmlTags(content).trim()}](${href})`,
    )
    .replace(
      /<\s*img\b[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi,
      (_, alt, src) => `![${alt}](${src})`,
    )
    .replace(
      /<\s*img\b[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi,
      (_, src, alt) => `![${alt}](${src})`,
    )
    .replace(
      /<\s*li\b[^>]*>([\s\S]*?)<\s*\/\s*li>/gi,
      (_, content) => `- ${stripHtmlTags(content).trim()}\n`,
    )
    .replace(/<\s*\/?\s*(ul|ol)\b[^>]*>/gi, "\n")
    .replace(
      /<\s*(?:p|div)\b[^>]*>([\s\S]*?)<\s*\/\s*(?:p|div)>/gi,
      (_, content) => `${stripHtmlTags(content).trim()}\n\n`,
    )
    .replace(/<[^>]+>/g, "");

  markdown = decodeHtmlEntities(markdown)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return markdown;
}
