export function ensureLinkCrypto() {
  if (typeof globalThis.crypto?.subtle?.digest !== "function" ||
      typeof globalThis.crypto?.getRandomValues !== "function" ||
      typeof TextEncoder !== "function" || typeof btoa !== "function") {
    throw new Error("Open the app over HTTPS to use email links.");
  }
}
