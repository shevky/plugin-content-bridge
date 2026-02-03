import { plugin } from "@shevky/base";

import { loadContentFromApi } from "./lib/loader.js";

const PLUGIN_NAME = "shevky-content-bridge";
const PLUGIN_VERSION = "0.0.1";

/** @typedef {import("./index.d.ts").ContentBridgeConfig} ContentBridgeConfig */
/** @typedef {import("./index.d.ts").ContentBridgeMapping} ContentBridgeMapping */
/** @typedef {import("./index.d.ts").ContentBridgeSource} ContentBridgeSource */

/** @type {import("@shevky/base").PluginHooks} */
const hooks = {
  [plugin.hooks.CONTENT_LOAD]: async function (ctx) {
    /** @type {ContentBridgeConfig} */
    const config = ctx.config.get(PLUGIN_NAME);
    if (!config) {
      ctx.log.warn(
        `[${PLUGIN_NAME}] Missing config. Add a 'pluginConfigs.${PLUGIN_NAME}' entry in site.json.`,
      );
      return;
    }

    if (typeof ctx.addContent !== "function") {
      throw new Error("Content Bridge: ctx.addContent is missing.");
    }

    ctx.log.info(`[${PLUGIN_NAME}] Content load started.`);

    const sources = Array.isArray(config.sources) ? config.sources : [];
    if (sources.length === 0) {
      ctx.log.warn(`[${PLUGIN_NAME}] No sources defined.`);
      return;
    }

    for (const source of sources) {
      const fetchConfig = source.fetch ?? {};
      const API_URL = fetchConfig.endpointUrl;
      if (!API_URL) {
        ctx.log.warn(
          `[${PLUGIN_NAME}] Missing endpointUrl in source configuration.`,
        );
        continue;
      }

      const method = (fetchConfig.method ?? "GET").toUpperCase();
      const headers = { ...(fetchConfig.headers ?? {}) };
      const body = fetchConfig.body;
      const timeoutMs = Number.isFinite(fetchConfig.timeoutMs)
        ? fetchConfig.timeoutMs
        : 30_000;
      const maxItems = Number.isFinite(source.maxItems)
        ? source.maxItems
        : Number.isFinite(config.maxItems)
          ? config.maxItems
          : undefined;

      await loadContentFromApi({
        ctx,
        url: API_URL,
        method,
        headers,
        body,
        pagination: fetchConfig.pagination,
        timeoutMs,
        frontMatterMapping: source.mapping?.frontMatter ?? {},
        contentMapping: source.mapping?.content,
        sourcePathMapping: source.mapping?.sourcePath,
        pluginName: PLUGIN_NAME,
        maxItems,
      });
    }

    ctx.log.info(`[${PLUGIN_NAME}] Content load finished.`);
  },
};

const PLUGIN = { name: PLUGIN_NAME, version: PLUGIN_VERSION, hooks };
export default PLUGIN;
