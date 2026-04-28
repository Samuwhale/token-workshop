export const SEARCH_SCOPE_CATEGORIES = {
  fill: ["FILL_COLOR"],
  stroke: ["STROKE_COLOR"],
  text: [
    "TEXT_FILL",
    "FONT_FAMILY",
    "FONT_STYLE",
    "FONT_SIZE",
    "LINE_HEIGHT",
    "LETTER_SPACING",
    "TEXT_CONTENT",
  ],
  radius: ["CORNER_RADIUS"],
  spacing: ["GAP"],
  gap: ["GAP"],
  size: ["WIDTH_HEIGHT"],
  "stroke-width": ["STROKE_FLOAT"],
  opacity: ["OPACITY"],
  typography: [
    "FONT_FAMILY",
    "FONT_STYLE",
    "FONT_SIZE",
    "LINE_HEIGHT",
    "LETTER_SPACING",
  ],
  effect: ["EFFECT_COLOR"],
  visibility: ["SHOW_HIDE"],
} as const;

export const SEARCH_SCOPE_CATEGORY_KEYS = Object.keys(
  SEARCH_SCOPE_CATEGORIES,
) as Array<keyof typeof SEARCH_SCOPE_CATEGORIES>;

export const SUPPORTED_SEARCH_SCOPE_VALUES = new Set<string>(
  SEARCH_SCOPE_CATEGORY_KEYS,
);

export const SEARCH_HAS_CANONICAL_VALUES = [
  "alias",
  "direct",
  "duplicate",
  "description",
  "extension",
  "managed",
  "unused",
] as const;

export type SearchHasQualifierValue =
  (typeof SEARCH_HAS_CANONICAL_VALUES)[number];

export type CrossCollectionSearchHasQualifierValue = Exclude<
  SearchHasQualifierValue,
  "unused"
>;

export const CROSS_COLLECTION_SEARCH_HAS_CANONICAL_VALUES =
  SEARCH_HAS_CANONICAL_VALUES.filter(
    (
      value,
    ): value is CrossCollectionSearchHasQualifierValue => value !== "unused",
  );

export const CROSS_COLLECTION_SEARCH_HAS_CANONICAL_SET = new Set<string>(
  CROSS_COLLECTION_SEARCH_HAS_CANONICAL_VALUES,
);

export const SEARCH_HAS_VALUES = new Set<string>([
  "alias",
  "direct",
  "duplicate",
  "description",
  "extension",
  "managed",
  "generator",
  "unused",
]);

export const CROSS_COLLECTION_SEARCH_HAS_VALUES = new Set<string>([
  "alias",
  "direct",
  "duplicate",
  "description",
  "extension",
  "managed",
  "generator",
]);

export const SEARCH_HAS_CANONICAL_MAP: Record<
  string,
  SearchHasQualifierValue
> = {
  alias: "alias",
  direct: "direct",
  duplicate: "duplicate",
  description: "description",
  extension: "extension",
  managed: "managed",
  generator: "managed",
  unused: "unused",
};
