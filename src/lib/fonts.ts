export type FontGroup = "Clean" | "Elegant" | "Playful";

export type FontOption = {
  value: string;
  label: string;
  stack: string;
  group: FontGroup;
  weight: number;
};

/** Same families Fotoblast offers for projected event text. */
export const FONT_OPTIONS: readonly FontOption[] = [
  {
    value: "system",
    label: "System Sans",
    stack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    group: "Clean",
    weight: 700,
  },
  {
    value: "montserrat",
    label: "Montserrat",
    stack: "var(--font-montserrat), sans-serif",
    group: "Clean",
    weight: 700,
  },
  {
    value: "oswald",
    label: "Oswald",
    stack: "var(--font-oswald), sans-serif",
    group: "Clean",
    weight: 500,
  },
  {
    value: "bebas",
    label: "Bebas Neue",
    stack: "var(--font-bebas), sans-serif",
    group: "Clean",
    weight: 400,
  },
  {
    value: "roboto-slab",
    label: "Roboto Slab",
    stack: "var(--font-roboto-slab), serif",
    group: "Clean",
    weight: 600,
  },
  {
    value: "playfair",
    label: "Playfair Display",
    stack: "var(--font-playfair), serif",
    group: "Elegant",
    weight: 700,
  },
  {
    value: "cormorant",
    label: "Cormorant Garamond",
    stack: "var(--font-cormorant), serif",
    group: "Elegant",
    weight: 600,
  },
  {
    value: "cinzel",
    label: "Cinzel",
    stack: "var(--font-cinzel), serif",
    group: "Elegant",
    weight: 600,
  },
  {
    value: "libre-baskerville",
    label: "Libre Baskerville",
    stack: "var(--font-libre-baskerville), serif",
    group: "Elegant",
    weight: 700,
  },
  {
    value: "merriweather",
    label: "Merriweather",
    stack: "var(--font-merriweather), serif",
    group: "Elegant",
    weight: 700,
  },
  {
    value: "great-vibes",
    label: "Great Vibes",
    stack: "var(--font-great-vibes), cursive",
    group: "Elegant",
    weight: 400,
  },
  {
    value: "parisienne",
    label: "Parisienne",
    stack: "var(--font-parisienne), cursive",
    group: "Elegant",
    weight: 400,
  },
  {
    value: "dancing",
    label: "Dancing Script",
    stack: "var(--font-dancing), cursive",
    group: "Playful",
    weight: 600,
  },
  {
    value: "pacifico",
    label: "Pacifico",
    stack: "var(--font-pacifico), cursive",
    group: "Playful",
    weight: 400,
  },
  {
    value: "lobster",
    label: "Lobster",
    stack: "var(--font-lobster), cursive",
    group: "Playful",
    weight: 400,
  },
  {
    value: "fredoka",
    label: "Fredoka",
    stack: "var(--font-fredoka), sans-serif",
    group: "Playful",
    weight: 500,
  },
  {
    value: "comfortaa",
    label: "Comfortaa",
    stack: "var(--font-comfortaa), sans-serif",
    group: "Playful",
    weight: 600,
  },
  {
    value: "comic-neue",
    label: "Comic Neue",
    stack: "var(--font-comic-neue), cursive",
    group: "Playful",
    weight: 700,
  },
  {
    value: "bubblegum",
    label: "Bubblegum Sans",
    stack: "var(--font-bubblegum), cursive",
    group: "Playful",
    weight: 400,
  },
  {
    value: "caveat",
    label: "Caveat",
    stack: "var(--font-caveat), cursive",
    group: "Playful",
    weight: 600,
  },
  {
    value: "permanent-marker",
    label: "Permanent Marker",
    stack: "var(--font-permanent-marker), cursive",
    group: "Playful",
    weight: 400,
  },
  {
    value: "bangers",
    label: "Bangers",
    stack: "var(--font-bangers), cursive",
    group: "Playful",
    weight: 400,
  },
];

const FONT_BY_VALUE = new Map(FONT_OPTIONS.map((font) => [font.value, font]));

export function getFont(value: string): FontOption {
  return FONT_BY_VALUE.get(value) ?? FONT_OPTIONS[0];
}

export const FONT_GROUPS: readonly FontGroup[] = ["Clean", "Elegant", "Playful"];
