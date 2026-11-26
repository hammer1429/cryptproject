/**
 * 전자서명과 무결성 모듈 (담당: 김용현)
 *
 * 흐름
 *  - 보내는 사람 브라우저: 원본 파일의 digest(SHA-256)를 계산하고 ECDSA로 서명한다.
 *  - 받는 사람 브라우저: 복호화한 파일로 verifyIntegrity 를 호출해 해시와 서명을 확인한다.
 */

export type CheckState = "ok" | "fail" | "not-implemented";

export interface IntegrityResult {
  hash: CheckState;
  signature: CheckState;
}

export interface ElectronicSignature {
  digest: string;
  signature: string;
  publicKeyJwk: JsonWebKey;
}

const KEY_DATABASE_NAME = "cryptoproject-integrity";
const KEY_STORE_NAME = "signing-key";

function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE_NAME)) {
        request.result.createObjectStore(KEY_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getSigningKeyPair(): Promise<CryptoKeyPair> {
  const database = await openKeyDatabase();
  const existing = await new Promise<CryptoKeyPair | undefined>((resolve, reject) => {
    const request = database.transaction(KEY_STORE_NAME, "readonly").objectStore(KEY_STORE_NAME).get("sender");
    request.onsuccess = () => resolve(request.result as CryptoKeyPair | undefined);
    request.onerror = () => reject(request.error);
  });

  if (existing?.privateKey && existing.publicKey) {
    database.close();
    return existing;
  }

  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  ) as CryptoKeyPair;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE_NAME, "readwrite");
    transaction.objectStore(KEY_STORE_NAME).put(pair, "sender");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return pair;
}

function toBase64Url(data: ArrayBuffer): string {
  let binary = "";
  new Uint8Array(data).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/** 파일 내용의 SHA-256 해시를 16진수 문자열로 돌려준다. (브라우저) */
export async function hashBytes(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** 해시에 송신자의 전자서명을 붙인다. (브라우저) */
export async function signDigest(digest: string): Promise<string> {
  const pair = await getSigningKeyPair();
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    pair.privateKey,
    new TextEncoder().encode(digest),
  );
  return toBase64Url(signature);
}

/** 파일의 SHA-256 해시를 계산하고 같은 데이터에 대한 ECDSA 전자서명을 생성한다. */
export async function signBytes(data: ArrayBuffer, signatureImage?: string): Promise<ElectronicSignature> {
  const digest = await hashBytes(data);
  const signedPayload = signatureImage
    ? `${digest}|${await hashBytes(new TextEncoder().encode(signatureImage).buffer)}`
    : digest;
  const signature = await signDigest(signedPayload);
  const publicKeyJwk = await exportPublicKey();
  return { digest, signature, publicKeyJwk };
}

/** 서명 검증에 사용할 공개키를 JWK로 내보낸다. */
export async function exportPublicKey(): Promise<JsonWebKey> {
  const pair = await getSigningKeyPair();
  return crypto.subtle.exportKey("jwk", pair.publicKey);
}

/** 복호화된 파일이 해시와 서명에 맞는지 확인한다. (브라우저) */
export async function verifyIntegrity(
  plain: ArrayBuffer,
  digest: string,
  signature: string,
  publicKeyJwk?: JsonWebKey,
  signatureImage?: string,
): Promise<IntegrityResult> {
  if (!/^[a-f0-9]{64}$/i.test(digest) || !signature) {
    return { hash: "fail", signature: "fail" };
  }

  const recalculatedDigest = await hashBytes(plain);
  const hashState: CheckState = recalculatedDigest === digest ? "ok" : "fail";

  try {
    if (!publicKeyJwk) return { hash: hashState, signature: "fail" };
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const signedPayload = signatureImage
      ? `${digest}|${await hashBytes(new TextEncoder().encode(signatureImage).buffer)}`
      : digest;
    const isValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(signedPayload),
    );
    return { hash: hashState, signature: isValid ? "ok" : "fail" };
  } catch {
    return { hash: hashState, signature: "fail" };
  }
}

/** 보내는 사람 토큰을 저장용 해시로 바꾼다. (서버) */
export function hashToken(token: string): string {
  // TODO(김용현): SHA-256 해시로 교체. 지금은 원문을 그대로 저장합니다.
  return token;
}
