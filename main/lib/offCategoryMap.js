// Maps OpenFoodFacts categories_tags (en:foo) to our 12 flat categories.
// First match wins; precedence ordered top-down so beverages/meats override
// the broader plant-based-foods bucket.

const CATEGORY_RULES = [
  { tag: /^en:beverages|^en:drinks|^en:waters|^en:milks|^en:plant-milks|^en:teas|^en:coffees|^en:juices|^en:fruit-juices|^en:nectars|^en:syrups|^en:smoothies|^en:sodas|^en:beers|^en:wines|^en:spirits|^en:liquors|^en:energy-drinks|^en:sports-drinks/, cat: 'beverages' },
  { tag: /^en:meats|^en:poultry|^en:beef|^en:pork|^en:lamb|^en:game|^en:cured-meats|^en:sausages|^en:hams|^en:salami|^en:bacon|^en:chickens|^en:turkeys|^en:offals/, cat: 'meat' },
  { tag: /^en:fishes|^en:seafood|^en:shellfish|^en:tunas|^en:salmons|^en:cods|^en:anchovies|^en:sardines|^en:mackerels|^en:crustaceans|^en:molluscs|^en:prawns|^en:shrimps|^en:oysters/, cat: 'fish' },
  { tag: /^en:eggs/, cat: 'eggs' },
  { tag: /^en:dairies|^en:cheeses|^en:yogurts|^en:butters|^en:creams|^en:fermented-dairies|^en:cottage-cheeses|^en:fresh-cheeses/, cat: 'dairy' },
  { tag: /^en:fruits|^en:berries|^en:citrus|^en:apples|^en:bananas|^en:dried-fruits/, cat: 'fruit' },
  { tag: /^en:legumes|^en:beans|^en:lentils|^en:chickpeas|^en:peas|^en:soybeans|^en:tofu|^en:tempeh/, cat: 'legumes' },
  { tag: /^en:nuts|^en:seeds|^en:peanuts|^en:almonds|^en:walnuts|^en:hazelnuts|^en:pistachios|^en:cashews|^en:nut-butters|^en:seed-butters/, cat: 'nuts_seeds' },
  { tag: /^en:vegetables|^en:mushrooms|^en:potatoes|^en:tomatoes|^en:carrots|^en:onions|^en:peppers|^en:cucumbers|^en:salads|^en:leafy-vegetables|^en:root-vegetables|^en:cruciferous-vegetables|^en:squashes/, cat: 'vegetables' },
  { tag: /^en:cereals|^en:breads|^en:pastas|^en:rices|^en:flours|^en:oats|^en:wheats|^en:cereals-and-potatoes|^en:breakfast-cereals/, cat: 'grains' },
  { tag: /^en:sweets|^en:chocolates|^en:candies|^en:sugars|^en:desserts|^en:cookies|^en:biscuits|^en:cakes|^en:ice-creams|^en:honeys|^en:jams|^en:spreads/, cat: 'sweets' },
];

const VALID_CATEGORIES = new Set([
  'vegetables', 'fruit', 'meat', 'fish', 'dairy', 'eggs',
  'grains', 'legumes', 'nuts_seeds', 'sweets', 'beverages', 'other',
]);

/** Given an array of OFF category tags (e.g. ['en:vegetables', 'en:mushrooms']),
 *  return the best-match category slug, or 'other' if none match. */
function categoryFromOffTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return 'other';
  const lower = tags.map(t => String(t || '').toLowerCase());
  for (const rule of CATEGORY_RULES) {
    if (lower.some(t => rule.tag.test(t))) return rule.cat;
  }
  return 'other';
}

module.exports = { categoryFromOffTags, VALID_CATEGORIES };
