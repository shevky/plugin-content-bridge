const REQUIRED_KEYS = [
  "id",
  "lang",
  "title",
  "slug",
  "canonical",
  "template",
  "layout",
  "status",
];

export function getMissingRequired(frontMatter) {
  return REQUIRED_KEYS.filter((key) => !frontMatter[key]);
}
