# Shevky Plugin: Content Bridge

Pulls content from external APIs and injects it into the Shevky build pipeline. Includes a mapping language, pagination, and request controls.

## Features

- Fetches remote content during build
- Flexible field mapping and transformations
- Pagination support (page, offset, cursor)
- Request settings (method, headers, body, timeout)
- Optional markdown export to disk

## Installation

```bash
npm i @shevky/plugin-content-bridge
```

## Usage

Add the plugin to your Shevky config:

```json
{
  "plugins": [
    "@shevky/plugin-content-bridge"
  ]
}
```

Add plugin config in `site.json` (recommended: `sources`):

```json
{
  "pluginConfigs": {
    "shevky-content-bridge": {
      "maxItems": 10,
      "output": {
        "directory": "./tmp/content-bridge",
        "fileNameFormat": "{lang}/{slug}.md"
      },
      "sources": [
        {
          "name": "posts",
          "fetch": {
            "endpointUrl": "https://dummyjson.com/posts",
            "method": "GET",
            "headers": {},
            "timeoutMs": 30000,
            "pagination": {
              "pageParam": "skip",
              "sizeParam": "limit",
              "pageIndexStart": 0,
              "pageSize": 10,
              "itemsPath": "$_posts",
              "totalPath": "$_total"
            }
          },
          "mapping": {
            "frontMatter": {
              "id": "$_id",
              "lang": "tr",
              "title": "$_title",
              "slug": "$slugify($_title)",
              "canonical": "$concat('~/', $slugify($_title))",
              "template": "post",
              "layout": "default",
              "status": "published",
              "featured": true,
              "tags": "$_tags",
              "date": "$now()",
              "description": "$_title",
              "category": "$_tags[0]"
            },
            "content": "$_body",
            "sourcePath": "$concat('bridge://dummyjson/posts/', $_id, '.md')"
          },
          "output": {
            "directory": "./tmp/content-bridge/posts",
            "fileNameFormat": "{frontMatter.slug}-{id}.md"
          },
          "maxItems": 5
        }
      ]
    }
  }
}
```

## Configuration

### Sources

Use `sources` to fetch from multiple APIs. Each source has its own `fetch` and `mapping`.

- `sources`: Array of `{ name?, fetch, mapping, maxItems? }`
- `maxItems`: Optional global limit (applies to all sources)
- `output`: Optional global markdown export config (`source.output` can override)

### Fetch

- `endpointUrl`: API URL (required)
- `method`: `GET` or `POST` (default `GET`)
- `headers`: Request headers
- `body`: POST body (string or object). Objects are JSON-stringified.
- `timeoutMs`: Request timeout in ms (default `30000`)
- `pagination`: Optional. Enables multi-page fetching.

### Pagination

- `pageParam`: Page parameter (`page`, `skip`, `offset`, etc.)
- `sizeParam`: Page size parameter (`limit`, `pageSize`, etc.)
- `pageIndexStart`: Start index (e.g. 0 or 1)
- `pageIndexStep`: Increment size. In `offset` mode, usually `pageSize`.
- `pageSize`: Page size
- `delayMs`: Delay between requests
- `itemsPath`: Path to the array in the response (e.g. `$_posts`)
- `totalPath`: Path to the total count (e.g. `$_total`)
- `hasMorePath`: Boolean continuation flag
- `nextPagePath`: Next page number
- `nextCursorPath`: Cursor value
- `cursorParam`: Cursor parameter
- `cursorStart`: Initial cursor value
- `mode`: `page` | `offset` | `cursor`

Mode explanation:

- `page`: page number increments by 1 (`page=1,2,3`)
- `offset`: index is an offset and increases by `pageSize` (`skip=0,10,20`)
- `cursor`: uses `nextCursorPath` and sends it via `cursorParam`

If `pageParam` is `skip` or `offset`, mode is inferred as `offset`.

Continuation priority:

1. `nextCursorPath`
2. `hasMorePath`
3. `nextPagePath`
4. `totalPath`
5. Short page check (`items.length < pageSize`)

### Mapping

- `frontMatter`: Maps Shevky front matter fields
- `content`: Content body (markdown)
- `sourcePath`: Source path (required)

### Limits

- `maxItems`: Optional. Global limit for the plugin. Each source can override it with its own `maxItems`.

### Output (Markdown Export)

- `output.directory`: Target folder for generated markdown files (relative paths are resolved from project root)
- `output.fileNameFormat`: Output file format (default: `{slug}.md`)
- `source.output`: Optional per-source override. Set `false` to disable export for that source.

`fileNameFormat` supports:

- Placeholder format: `{slug}`, `{id}`, `{lang}`, `{frontMatter.slug}`, `{source.id}`
- Direct field references: `$_slug-$_id.md`, `$_frontMatter.lang/$_source.id.md`
- Mapping expression format: `"$concat($_lang, '/', $_slug, '.md')"`

If no extension is provided, `.md` is appended automatically.

Field references:

- `$_field` reads from source
- `$_tags[0]` reads array element
- `'text'` is a literal string
- `$slugify($_title)` calls a function (functions can be nested)

Functions:

- `$slugify(value)` -> URL-safe slug
- `$concat(a, b, c...)` -> joins values into one string
- `$lower(value)` -> lowercase string
- `$upper(value)` -> uppercase string
- `$trim(value)` -> trims whitespace
- `$join(array, separator)` -> joins array into a string
- `$if(condition, then, else)` -> conditional value
- `$eq(a, b)` -> equality check
- `$neq(a, b)` -> inequality check
- `$gt(a, b)` -> greater-than check
- `$gte(a, b)` -> greater-than-or-equal check
- `$lt(a, b)` -> less-than check
- `$lte(a, b)` -> less-than-or-equal check
- `$and(v1, v2, ...)` -> logical AND
- `$or(v1, v2, ...)` -> logical OR
- `$not(value)` -> logical NOT
- `$coalesce(v1, v2, v3...)` -> first non-empty value (`null`, `undefined`, `""` are skipped)
- `$date(value, format)` -> formats a date; no `format` returns ISO
- `$now()` -> current datetime in ISO
- `$today()` -> current datetime in ISO (same as `$now`)
- `$number(value)` -> parses to number (invalid -> `undefined`)
- `$boolean(value)` -> normalizes truthy values
- `$default(value, fallback)` -> fallback if value is empty
- `$replace(value, from, to)` -> string replace (all occurrences)
- `$htmlToMD(value)` -> converts basic HTML into Markdown
- `$truncate(value, len)` -> limits string length to `len`
- `$contains(valueOrArray, needle)` -> checks string/array membership
- `$merge(array1, array2, ...)` -> merges arrays
- `$unique(array)` -> removes duplicates
- `$compact(array)` -> removes empty items (`null`, `undefined`, empty string/array/object)
- `$nanoid(length)` -> random id
- `$uuid()` -> random UUID (v4)

`$date` format tokens: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`.

### Required Front Matter Fields

- `id`
- `lang`
- `title`
- `slug`
- `canonical`
- `template`
- `layout`
- `status`

## License

MIT
