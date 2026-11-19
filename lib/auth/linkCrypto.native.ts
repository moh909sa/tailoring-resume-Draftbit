import { Buffer } from "buffer";
import { CryptoDigestAlgorithm, digest, getRandomValues } from "expo-crypto";

// Supabase needs these Web Crypto primitives to generate an S256 challenge on native.
export function ensureLinkCrypto() {
  if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
  const crypto = globalThis.crypto;
  if (typeof crypto.getRandomValues !== "function") {
    Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: getRandomValues });
  }
  if (typeof crypto.subtle?.digest !== "function") {
    const subtle = crypto.subtle ?? {};
    if (!crypto.subtle) Object.defineProperty(crypto, "subtle", { configurable: true, value: subtle });
    Object.defineProperty(subtle, "digest", {
      configurable: true,
      value: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        if ((typeof algorithm === "string" ? algorithm : algorithm.name) !== "SHA-256") {
          throw new Error("Only SHA-256 is supported for email links.");
        }
        return digest(CryptoDigestAlgorithm.SHA256, data);
      },
    });
  }
  if (typeof globalThis.TextEncoder !== "function") {
    class NativeTextEncoder {
      readonly encoding = "utf-8";

      encode(input = "") {
        return Uint8Array.from(Buffer.from(input, "utf8"));
      }

      encodeInto(input: string, destination: Uint8Array) {
        let read = 0;
        let written = 0;
        for (const character of input) {
          const bytes = this.encode(character);
          if (written + bytes.length > destination.length) break;
          destination.set(bytes, written);
          read += character.length;
          written += bytes.length;
        }
        return { read, written };
      }
    }
    Object.defineProperty(globalThis, "TextEncoder", { configurable: true, value: NativeTextEncoder });
  }
  if (typeof globalThis.btoa !== "function") {
    Object.defineProperty(globalThis, "btoa", {
      configurable: true,
      value: (value: string) => {
        for (const character of value) {
          if (character.charCodeAt(0) > 255) throw new TypeError("Expected a binary string.");
        }
        return Buffer.from(value, "latin1").toString("base64");
      },
    });
  }
}
