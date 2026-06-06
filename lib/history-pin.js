// history-pin.js — PIN hashing for history lock (Pro)
// Uses Web Crypto API only — no browser, btcAPI, cryptoGet, cryptoSet

async function hashPin(pin) {
  const encoded = new TextEncoder().encode(String(pin));
  const digest  = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPin(pin, storedHash) {
  if (!storedHash) return false;
  const hash = await hashPin(pin);
  return hash === storedHash;
}

if (typeof module !== "undefined") {
  module.exports = { hashPin, verifyPin };
}
