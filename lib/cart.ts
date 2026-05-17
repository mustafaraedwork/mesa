// Diner cart — localStorage only, no server roundtrip.
// PRD §3.2 + Closing Mode Q5: stores {product_id, quantity} pairs (no price
// snapshot). TTL 2h, key `mesa-cart-{slug}`.

export type CartItem = { product_id: string; quantity: number };
export type Cart = { items: CartItem[]; updatedAt: number };

const TTL_MS = 2 * 60 * 60 * 1000;

function storageKey(slug: string): string {
  return `mesa-cart-${slug}`;
}

export function getCart(slug: string): Cart {
  if (typeof window === 'undefined') return { items: [], updatedAt: 0 };
  const raw = window.localStorage.getItem(storageKey(slug));
  if (!raw) return { items: [], updatedAt: 0 };
  try {
    const parsed = JSON.parse(raw) as Cart;
    if (Date.now() - parsed.updatedAt > TTL_MS) {
      window.localStorage.removeItem(storageKey(slug));
      return { items: [], updatedAt: 0 };
    }
    return parsed;
  } catch {
    return { items: [], updatedAt: 0 };
  }
}

function writeCart(slug: string, cart: Cart) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(slug), JSON.stringify(cart));
  // Trigger a storage event in this same tab — `localStorage.setItem` only
  // fires `storage` in *other* tabs, so we manually nudge listeners here.
  window.dispatchEvent(new CustomEvent('mesa-cart-change', { detail: { slug } }));
}

export function setQuantity(slug: string, productId: string, qty: number): Cart {
  const cart = getCart(slug);
  const idx = cart.items.findIndex((i) => i.product_id === productId);
  let next: CartItem[];
  if (qty <= 0) {
    next = cart.items.filter((i) => i.product_id !== productId);
  } else if (idx === -1) {
    next = [...cart.items, { product_id: productId, quantity: qty }];
  } else {
    next = cart.items.map((i, j) => (j === idx ? { ...i, quantity: qty } : i));
  }
  const updated = { items: next, updatedAt: Date.now() };
  writeCart(slug, updated);
  return updated;
}

export function addToCart(slug: string, productId: string): Cart {
  const cart = getCart(slug);
  const existing = cart.items.find((i) => i.product_id === productId);
  return setQuantity(slug, productId, (existing?.quantity ?? 0) + 1);
}

export function clearCart(slug: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(slug));
  window.dispatchEvent(new CustomEvent('mesa-cart-change', { detail: { slug } }));
}

export function totalQuantity(cart: Cart): number {
  return cart.items.reduce((s, i) => s + i.quantity, 0);
}

// Subscribe to cart changes from any tab. Returns an unsubscribe fn.
// `cb` fires for both same-tab mutations (custom event) and cross-tab
// `storage` events.
export function subscribe(slug: string, cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent).detail as { slug?: string } | undefined;
    if (!detail || detail.slug === slug) cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === storageKey(slug)) cb();
  };
  window.addEventListener('mesa-cart-change', onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('mesa-cart-change', onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
