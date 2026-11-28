"use client";

/**
 * OTP 로그인 화면 (담당: 박민지)
 *  1) 처음이면: QR 코드를 OTP 앱(Google Authenticator 등)으로 찍어 등록
 *  2) 앱에 뜬 6자리 코드를 입력해 로그인
 *  3) 로그인 후 파일 목록 → 전자서명 → 다운로드
 */

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  MAX_LOGIN_ATTEMPTS,
  OTP_DIGITS,
  attemptOtpLogin,
  attemptOtpReset,
  getOrCreateOtpState,
  isOtpLoggedIn,
  otpAuthUri,
  secondsRemaining,
  type OtpState,
} from "@/lib/crypto/otp";

function safeReturnTo(): string {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/send";
}

function groupKey(secret: string) {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export default function OtpLoginPage() {
  const router = useRouter();
  const [state, setState] = useState<OtpState | null>(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOtpLoggedIn()) {
      router.replace(safeReturnTo());
      return;
    }
    const loaded = getOrCreateOtpState();
    setState(loaded);
    setLockedUntil(loaded.lockedUntil);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [router]);

  useEffect(() => {
    if (!state || state.registered) return;
    void QRCode.toDataURL(otpAuthUri(state.secret), { width: 200, margin: 1 }).then(setQr);
  }, [state]);

  const isLocked = lockedUntil > now;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isLocked) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await attemptOtpLogin(code);
      if (result.ok) {
        router.replace(safeReturnTo());
        return;
      }
      setCode("");
      if (result.reason === "locked") {
        setLockedUntil(result.lockedUntil);
        setError(`${MAX_LOGIN_ATTEMPTS}회 틀려서 잠시 잠겼습니다. 잠금이 풀린 뒤 다시 시도하세요.`);
      } else {
        setError(`코드가 맞지 않거나 이미 사용한 코드입니다. 남은 시도 ${result.attemptsLeft}회`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset() {
    if (!state || isSubmitting || isLocked) return;
    const message = state.registered
      ? "입력한 코드로 본인 확인 후 OTP 앱 등록을 처음부터 다시 할까요? 기존 앱에 등록한 코드는 더 이상 쓸 수 없습니다."
      : "OTP 앱 등록을 처음부터 다시 할까요? 기존 앱에 등록한 코드는 더 이상 쓸 수 없습니다.";
    if (!window.confirm(message)) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await attemptOtpReset(code);
      setCode("");
      if (result.ok) {
        setState(result.state);
        setLockedUntil(0);
        return;
      }
      if (result.reason === "locked") {
        setLockedUntil(result.lockedUntil);
        setError(`${MAX_LOGIN_ATTEMPTS}회 틀려서 잠시 잠겼습니다. 잠금이 풀린 뒤 다시 시도하세요.`);
      } else {
        setError(`코드가 맞지 않거나 이미 사용한 코드라 재등록하지 않았습니다. 남은 시도 ${result.attemptsLeft}회`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const lockLeft = Math.ceil((lockedUntil - now) / 1000);

  return (
    <>
      <Header />
      <main className="page-main">
        <div className="wrap">
          <div className="page-narrow">
            <h1 className="page-title">OTP 로그인</h1>
            <p className="page-lead">
              OTP 앱의 6자리 코드로 로그인해야 파일을 확인하고 전자서명할 수 있습니다.
            </p>

            {state && !state.registered && (
              <div className="panel">
                <h2>1. OTP 앱에 등록하기 (처음 한 번)</h2>
                <p className="panel-sub">
                  Google Authenticator 같은 OTP 앱에서 QR 코드를 찍거나, 아래 설정 키를 직접 입력하세요.
                </p>
                <div className="otp-setup">
                  {qr ? <img src={qr} alt="OTP 앱 등록용 QR 코드" width={200} height={200} /> : null}
                  <div>
                    <div className="label">설정 키</div>
                    <code className="otp-key">{groupKey(state.secret)}</code>
                    <p className="size">방식: 시간 기준(TOTP) · 6자리 · 30초</p>
                  </div>
                </div>
              </div>
            )}

            {state && (
              <div className="panel">
                <h2>{state.registered ? "앱의 코드 입력" : "2. 앱에 뜬 코드 입력"}</h2>
                <p className="panel-sub">코드는 {secondsRemaining(now)}초 뒤 바뀝니다.</p>
                <form onSubmit={handleSubmit}>
                  <div className="field" style={{ marginTop: 0 }}>
                    <label htmlFor="otp-code">6자리 코드</label>
                    <input
                      id="otp-code"
                      className="otp-input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={OTP_DIGITS}
                      value={code}
                      disabled={isLocked}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    />
                  </div>

                  {isLocked ? (
                    <div className="error" role="alert">
                      시도 횟수를 넘겨 잠겼습니다. {Math.floor(lockLeft / 60)}분 {lockLeft % 60}초 뒤 다시 시도하세요.
                    </div>
                  ) : error ? (
                    <div className="error" role="alert">
                      {error}
                    </div>
                  ) : null}

                  <div className="actions">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSubmitting || isLocked || code.length !== OTP_DIGITS}
                    >
                      {isSubmitting ? "확인 중..." : "로그인"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void handleReset()}
                      disabled={isSubmitting || isLocked || (state.registered && code.length !== OTP_DIGITS)}
                    >
                      OTP 앱 다시 등록
                    </button>
                  </div>
                  {state.registered && (
                    <p className="panel-sub" style={{ marginTop: 12, marginBottom: 0 }}>
                      앱을 다시 등록하려면 지금 앱에 뜬 6자리 코드를 입력한 뒤 &quot;OTP 앱 다시 등록&quot;을 누르세요.
                    </p>
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
