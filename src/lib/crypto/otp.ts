/**
 * OTP 인증 모듈 (담당: 박민지)  --  브라우저에서 실행됩니다.
 *
 * 방식: TOTP (RFC 6238, 시간 기반 일회용 비밀번호)
 *  - 처음 한 번, 브라우저가 무작위 비밀키(20바이트)를 만들고
 *    사용자가 Google Authenticator 같은 OTP 앱에 등록한다. (QR 또는 설정 키 입력)
 *  - 이후 30초마다 앱과 브라우저가 같은 계산을 해서 같은 6자리 코드를 얻는다.
 *      카운터 = floor(현재시각 / 30초)
 *      코드   = HMAC-SHA1(비밀키, 카운터) 를 잘라서(dynamic truncation) 6자리로 만든 값
 *  - 비밀키는 네트워크로 오가지 않고, 코드만 입력하므로 "그 기기를 가진 사람"만 로그인할 수 있다.
 *
 * 보안 장치
 *  - 상수 시간 비교: 몇 번째 자리에서 틀렸는지 응답 시간으로 새지 않게 한다.
 *  - 시계 오차 허용: 앞뒤 1구간(±30초)까지만 인정한다.
 *  - 재사용 방지: 한 번 쓴 코드(카운터)는 다시 받지 않는다.
 *  - 무차별 대입 방어: 5회 틀리면 5분간 잠근다.
 *  - 세션 타임아웃: 로그인은 10분 동안만 유지된다.
 *
 * 한계 (발표 때 언급하면 좋음)
 *  - 지금은 서버가 없어서 비밀키와 시도 횟수를 브라우저(localStorage)에 보관한다.
 *    실제 서비스라면 비밀키 보관과 검증은 서버에서 해야 한다.
 */

export const OTP_DIGITS = 6;
export const OTP_PERIOD_SECONDS = 30;
export const OTP_ALLOWED_DRIFT = 1; // 앞뒤 몇 구간까지 허용할지
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 5 * 60 * 1000;
export const SESSION_DURATION_MS = 10 * 60 * 1000;

const ISSUER = "열렸조";
const ACCOUNT = "file-share";
const STATE_KEY = "otp-state";
const SESSION_KEY = "otp-session";

/* ---------------- Base32 (OTP 앱이 쓰는 비밀키 표기법) ---------------- */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("잘못된 Base32 문자입니다.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/* ---------------- 핵심 계산 ---------------- */

/** 암호학적으로 안전한 난수로 새 비밀키를 만든다. (20바이트 = 160비트) */
export function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/** 현재 시각이 몇 번째 30초 구간인지 (TOTP의 카운터) */
export function currentCounter(now = Date.now()): number {
  return Math.floor(now / 1000 / OTP_PERIOD_SECONDS);
}

/** 이번 코드가 몇 초 뒤에 바뀌는지 (화면 표시용) */
export function secondsRemaining(now = Date.now()): number {
  return OTP_PERIOD_SECONDS - (Math.floor(now / 1000) % OTP_PERIOD_SECONDS);
}

/** HOTP: HMAC-SHA1(비밀키, 카운터)를 6자리 숫자로 바꾼다. (RFC 4226) */
export async function generateHotp(secret: string, counter: number): Promise<string> {
  const keyBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  // 카운터를 8바이트 빅엔디언으로
  const counterBytes = new ArrayBuffer(8);
  const view = new DataView(counterBytes);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));

  // Dynamic truncation: 마지막 바이트의 하위 4비트를 시작 위치로 4바이트를 뽑는다.
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];

  return (binary % 10 ** OTP_DIGITS).toString().padStart(OTP_DIGITS, "0");
}

/** TOTP: 지금 시각의 6자리 코드 */
export async function generateOtp(secret: string, now = Date.now()): Promise<string> {
  return generateHotp(secret, currentCounter(now));
}

/** 상수 시간 비교: 처음 틀린 자리에서 멈추지 않고 끝까지 비교한다. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 입력한 코드가 맞으면 일치한 카운터를, 틀리면 null 을 돌려준다.
 * lastUsedCounter 이하의 카운터는 이미 쓴 코드로 보고 거절한다.
 */
export async function verifyOtp(
  input: string,
  secret: string,
  lastUsedCounter = -1,
  now = Date.now(),
): Promise<number | null> {
  if (!new RegExp(`^\\d{${OTP_DIGITS}}$`).test(input)) return null;
  const base = currentCounter(now);
  let matched: number | null = null;
  // 일치를 찾아도 멈추지 않고 모든 후보를 계산한다. (시간 차이로 정보가 새지 않게)
  for (let drift = -OTP_ALLOWED_DRIFT; drift <= OTP_ALLOWED_DRIFT; drift += 1) {
    const counter = base + drift;
    const expected = await generateHotp(secret, counter);
    if (constantTimeEqual(input, expected) && counter > lastUsedCounter) matched = counter;
  }
  return matched;
}

/** OTP 앱 등록용 주소 (QR 코드에 담는 값) */
export function otpAuthUri(secret: string): string {
  const label = encodeURIComponent(`${ISSUER}:${ACCOUNT}`);
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: String(OTP_DIGITS),
    period: String(OTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ---------------- 상태 저장 (서버 대신 브라우저에 보관) ---------------- */

export interface OtpState {
  secret: string;
  registered: boolean; // OTP 앱 등록 후 첫 코드 확인까지 마쳤는지
  failedAttempts: number;
  lockedUntil: number; // 0 이면 잠기지 않음
  lastUsedCounter: number;
}

function readState(): OtpState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as OtpState) : null;
  } catch {
    return null;
  }
}

function writeState(state: OtpState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

/** 저장된 상태를 가져오고, 없으면 새 비밀키로 만든다. */
export function getOrCreateOtpState(): OtpState {
  const existing = readState();
  if (existing) return existing;
  const fresh: OtpState = {
    secret: generateSecret(),
    registered: false,
    failedAttempts: 0,
    lockedUntil: 0,
    lastUsedCounter: -1,
  };
  writeState(fresh);
  return fresh;
}

/** 등록을 처음부터 다시 한다. (새 비밀키 발급) */
export function resetOtpRegistration(): OtpState {
  localStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  return getOrCreateOtpState();
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "locked"; lockedUntil: number }
  | { ok: false; reason: "wrong"; attemptsLeft: number };

/** 로그인 시도: 잠금 확인 → 코드 검증 → 실패 횟수/재사용/세션 처리 */
export async function attemptOtpLogin(input: string, now = Date.now()): Promise<LoginResult> {
  const state = getOrCreateOtpState();

  if (state.lockedUntil > now) {
    return { ok: false, reason: "locked", lockedUntil: state.lockedUntil };
  }
  if (state.lockedUntil !== 0) {
    // 잠금 시간이 지났으면 초기화
    state.lockedUntil = 0;
    state.failedAttempts = 0;
  }

  const matched = await verifyOtp(input.trim(), state.secret, state.lastUsedCounter, now);

  if (matched === null) {
    state.failedAttempts += 1;
    if (state.failedAttempts >= MAX_LOGIN_ATTEMPTS) {
      state.lockedUntil = now + LOCK_DURATION_MS;
      writeState(state);
      return { ok: false, reason: "locked", lockedUntil: state.lockedUntil };
    }
    writeState(state);
    return { ok: false, reason: "wrong", attemptsLeft: MAX_LOGIN_ATTEMPTS - state.failedAttempts };
  }

  state.failedAttempts = 0;
  state.lastUsedCounter = matched; // 같은 코드 재사용 방지
  state.registered = true;
  writeState(state);
  sessionStorage.setItem(SESSION_KEY, String(now + SESSION_DURATION_MS));
  return { ok: true };
}

export type ResetResult =
  | { ok: true; state: OtpState }
  | { ok: false; reason: "locked"; lockedUntil: number }
  | { ok: false; reason: "wrong"; attemptsLeft: number };

/**
 * 재등록 시도 (새 비밀키 발급)
 *  - 잠금 중이면 거절한다.
 *  - 아직 등록 전이면 코드 없이 바로 새 비밀키를 준다.
 *  - 이미 등록됐다면 현재 앱의 올바른 코드를 입력해야 한다.
 *    틀린 코드는 로그인과 똑같이 실패 횟수에 포함되고, 5회면 잠긴다.
 */
export async function attemptOtpReset(input: string, now = Date.now()): Promise<ResetResult> {
  const state = getOrCreateOtpState();

  if (state.lockedUntil > now) {
    return { ok: false, reason: "locked", lockedUntil: state.lockedUntil };
  }

  if (!state.registered) {
    return { ok: true, state: resetOtpRegistration() };
  }

  if (state.lockedUntil !== 0) {
    // 잠금 시간이 지났으면 초기화
    state.lockedUntil = 0;
    state.failedAttempts = 0;
  }

  const matched = await verifyOtp(input.trim(), state.secret, state.lastUsedCounter, now);

  if (matched === null) {
    state.failedAttempts += 1;
    if (state.failedAttempts >= MAX_LOGIN_ATTEMPTS) {
      state.lockedUntil = now + LOCK_DURATION_MS;
      writeState(state);
      return { ok: false, reason: "locked", lockedUntil: state.lockedUntil };
    }
    writeState(state);
    return { ok: false, reason: "wrong", attemptsLeft: MAX_LOGIN_ATTEMPTS - state.failedAttempts };
  }

  return { ok: true, state: resetOtpRegistration() };
}

/* ---------------- 로그인 세션 ---------------- */

/** 세션 만료 시각 (로그인 안 됐거나 만료됐으면 null) */
export function getSessionExpiry(now = Date.now()): number | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  const expiresAt = raw ? Number(raw) : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    if (raw) sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  return expiresAt;
}

export function isOtpLoggedIn(now = Date.now()): boolean {
  return getSessionExpiry(now) !== null;
}

export function otpLogout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
