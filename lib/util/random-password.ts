// Universal random password generator (browser + Node). Avoids visually
// confusable chars (0/O, 1/l/I).

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRandomPassword(length = 12): string {
  const out: string[] = [];
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    out.push(ALPHABET[bytes[i] % ALPHABET.length]);
  }
  return out.join('');
}
