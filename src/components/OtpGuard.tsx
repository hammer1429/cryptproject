"use client";

/**
 * OTP 로그인을 해야만 안쪽 화면을 보여 주는 문지기 컴포넌트 (담당: 박민지)
 *  - 로그인하지 않았거나 세션(10분)이 끝났으면 /login 으로 보낸다.
 *  - 세션이 끝나는 순간에도 자동으로 로그인 화면으로 보낸다.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSessionExpiry, otpLogout } from "@/lib/crypto/otp";

function formatLeft(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}분 ${String(total % 60).padStart(2, "0")}초`;
}

export default function OtpGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const goLogin = () => {
      const returnTo = encodeURIComponent(window.location.pathname);
      router.replace(`/login?returnTo=${returnTo}`);
    };

    const expiry = getSessionExpiry();
    if (expiry === null) {
      goLogin();
      return;
    }
    setExpiresAt(expiry);

    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (getSessionExpiry(current) === null) {
        window.clearInterval(timer);
        goLogin();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [router]);

  if (expiresAt === null) {
    return (
      <main className="page-main">
        <div className="wrap">
          <div className="page-narrow">
            <div className="panel">
              <p className="waiting">OTP 로그인 상태를 확인하는 중입니다.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="otp-session-bar" role="status">
        <div className="wrap">
          <span>OTP 인증됨 · 세션 남은 시간 {formatLeft(expiresAt - now)}</span>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              otpLogout();
              router.replace("/login");
            }}
          >
            OTP 로그아웃
          </button>
        </div>
      </div>
      {children}
    </>
  );
}
