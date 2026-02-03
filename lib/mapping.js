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
