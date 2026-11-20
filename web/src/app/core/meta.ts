// Display helpers: cuisine glyphs/colors and Manhattan ZIP -> neighborhood.

const EMOJI: Record<string, string> = {
  American: '🍽️', 'New American': '🍽️', Japanese: '🍣', Italian: '🍝', Chinese: '🥟', Pizza: '🍕',
  Mexican: '🌮', 'Latin American': '🥑', 'Asian/Asian Fusion': '🥢', Fusion: '🥢', French: '🥐', Thai: '🍜',
  'Bakery Products/Desserts': '🧁', Salads: '🥗', Hamburgers: '🍔', Chicken: '🍗', Indian: '🍛',
  Sandwiches: '🥪', 'Sandwiches/Salads/Mixed Buffet': '🥪', Caribbean: '🍹', Irish: '🍺', Spanish: '🥘',
  Mediterranean: '🫒', Greek: '🥙', Korean: '🍲', Steakhouse: '🥩', 'Bagels/Pretzels': '🥯', Vegan: '🥦',
  Vegetarian: '🥦', Seafood: '🦞', 'Middle Eastern': '🧆', Egyptian: '🧆', 'Coffee/Tea': '☕',
  'Frozen Desserts': '🍦', Hotdogs: '🌭', 'Tex-Mex': '🌯', 'Jewish/Kosher': '🥯', 'Chinese/Cuban': '🥟',
  Polish: '🥟', Chilean: '🥑', Donuts: '🍩', 'Juice, Smoothies, Fruit Salads': '🧃', Peruvian: '🥑',
  Vietnamese: '🍜', Turkish: '🥙', Ethiopian: '🍛', German: '🥨', Soul: '🍗', Barbecue: '🍖',
};

const SHORT: Record<string, string> = {
  'Bakery Products/Desserts': 'Bakery & desserts',
  'Sandwiches/Salads/Mixed Buffet': 'Sandwiches',
  'Asian/Asian Fusion': 'Asian fusion',
  'Bagels/Pretzels': 'Bagels',
  'Jewish/Kosher': 'Kosher',
  'Chinese/Cuban': 'Chinese-Cuban',
  Hotdogs: 'Hot dogs',
};

const HOODS: Record<string, string> = {
  '10001': 'Chelsea', '10002': 'Lower East Side', '10003': 'East Village', '10004': 'FiDi', '10005': 'FiDi',
  '10006': 'FiDi', '10007': 'Tribeca', '10009': 'East Village', '10010': 'Gramercy', '10011': 'Chelsea',
  '10012': 'SoHo', '10013': 'Tribeca', '10014': 'West Village', '10016': 'Murray Hill', '10017': 'Midtown East',
  '10018': 'Garment District', '10019': 'Midtown West', '10020': 'Rockefeller Center', '10021': 'Upper East Side',
  '10022': 'Midtown East', '10023': 'Upper West Side', '10024': 'Upper West Side', '10025': 'Upper West Side',
  '10026': 'Harlem', '10027': 'Harlem', '10028': 'Upper East Side', '10029': 'East Harlem', '10030': 'Harlem',
  '10031': 'Hamilton Heights', '10032': 'Washington Heights', '10033': 'Washington Heights', '10034': 'Inwood',
  '10035': 'East Harlem', '10036': "Hell's Kitchen", '10037': 'Harlem', '10038': 'Seaport', '10039': 'Harlem',
  '10040': 'Washington Heights', '10044': 'Roosevelt Island', '10065': 'Upper East Side', '10069': 'Upper West Side',
  '10075': 'Upper East Side', '10128': 'Upper East Side', '10280': 'Battery Park City', '10282': 'Battery Park City',
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Undo the title-casing artifacts in the DOHMH names ("Mama'S" -> "Mama's", "Nyc" -> "NYC", "7Th" -> "7th"). */
export function tidyName(name: string): string {
  return name
    .replace(/([A-Za-z]{2,})['\u2019]([A-Z])/g, (_, a: string, b: string) => `${a}'${b.toLowerCase()}`)
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n: string, s: string) => n + s.toLowerCase())
    .replace(/\b(Nyc|Bbq|Ny|Usa)\b/g, (m) => m.toUpperCase());
}

export const emoji = (cuisine: string) => EMOJI[cuisine] ?? '🍴';
export const cuisineLabel = (cuisine: string) => SHORT[cuisine] ?? cuisine;
export const hue = (s: string) => hash(s) % 360;
export const hood = (zip?: string) => (zip && HOODS[zip]) || 'Manhattan';
