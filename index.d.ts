import type { PluginDefinition, PluginHooks } from "@shevky/base";

export type ContentBridgeConfig = {
  sources: ContentBridgeSource[];
  maxItems?: number;
};

export type ContentBridgeMapping = {
  frontMatter?: Record<string, string>;
  content?: string;
  sourcePath?: string;
};

export type ContentBridgeFetchConfig = {
  endpointUrl?: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | Record<string, any>;
  pagination?: ContentBridgePagination;
  timeoutMs?: number;
};

export type ContentBridgeSource = {
  name?: string;
  fetch: ContentBridgeFetchConfig;
  mapping: ContentBridgeMapping;
  maxItems?: number;
};

export type ContentBridgePagination = {
  mode?: "page" | "offset" | "cursor";
  pageParam?: string;
  sizeParam?: string;
  pageIndexStart?: number;
  pageIndexStep?: number;
  pageSize?: number;
  delayMs?: number;
  itemsPath?: string;
  totalPath?: string;
  hasMorePath?: string;
  nextPagePath?: string;
  nextCursorPath?: string;
  cursorParam?: string;
  cursorStart?: string;
};

declare const plugin: PluginDefinition & { hooks: PluginHooks };

export default plugin;
