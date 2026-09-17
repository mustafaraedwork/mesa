import { CLOSING_VIRTUAL_CATEGORY_ID } from '@/lib/closing';
import type { MenuCategory, MenuProduct } from '@/lib/menu';

export const SUGGESTION_COUNT = 4;

/**
 * Pick complementary items for a set of "seed" products — PRD §3.2.
 *
 * Precedence:
 *  1. Manual `custom_suggestion_ids` on a seed whose `suggestions_type` is 'custom'.
 *  2. Items from categories the owner linked as complements of the seeds' categories.
 *  3. Fill from categories not represented among the seeds.
 *
 * Always excluded: the seeds themselves, duplicates, and unavailable items.
 * Category order is preserved, so the list already respects the active mode (Q4).
 *
 * The cart seeds this with everything in the basket; the product page seeds it
 * with the single product being viewed, so the diner sees the owner's pairings
 * before ordering rather than only at checkout.
 */
export function pickSuggestions(
  categories: MenuCategory[],
  seeds: MenuProduct[],
  count: number = SUGGESTION_COUNT,
): MenuProduct[] {
  const seedIds = new Set(seeds.map((p) => p.id));
  const seedCategoryIds = new Set(seeds.map((p) => p.category_id));

  const productIndex = new Map<string, MenuProduct>();
  for (const cat of categories) {
    if (cat.id === CLOSING_VIRTUAL_CATEGORY_ID) continue;
    for (const p of cat.products) productIndex.set(p.id, p);
  }

  const picked: MenuProduct[] = [];
  const pickedIds = new Set<string>();
  const tryAdd = (p: MenuProduct | undefined) => {
    if (picked.length >= count) return;
    if (!p || pickedIds.has(p.id) || seedIds.has(p.id) || !p.is_available) return;
    picked.push(p);
    pickedIds.add(p.id);
  };

  // 1 — manual pairings chosen on the seed itself.
  for (const seed of seeds) {
    if (seed.suggestions_type !== 'custom') continue;
    for (const id of seed.custom_suggestion_ids ?? []) tryAdd(productIndex.get(id));
  }

  // 2 — categories the owner marked as complementary to the seeds' categories.
  const complementIds = new Set<string>();
  for (const cat of categories) {
    if (seedCategoryIds.has(cat.id)) {
      for (const cid of cat.complement_ids) complementIds.add(cid);
    }
  }
  for (const cat of categories) {
    if (cat.id === CLOSING_VIRTUAL_CATEGORY_ID) continue;
    if (!complementIds.has(cat.id)) continue;
    for (const p of cat.products) tryAdd(p);
  }

  // 3 — fill from whatever the seeds don't already cover.
  for (const cat of categories) {
    if (cat.id === CLOSING_VIRTUAL_CATEGORY_ID) continue;
    if (seedCategoryIds.has(cat.id)) continue;
    for (const p of cat.products) tryAdd(p);
  }

  return picked.slice(0, count);
}
