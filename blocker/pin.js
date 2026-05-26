// SHA-256 hex of a PIN (salted) so PINs are never stored in the clear. Shared by
// the popup (session unlock PIN) and Options (master PIN) so both hash the same
// way. crypto.subtle is available on extension pages (secure context).
export async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("blocker-pin:" + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
