"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const AUTH_KEY = "admin-authenticated";

export default function Header({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(sessionStorage.getItem(AUTH_KEY) === "true");
  }, []);

  function handleLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    setIsAdmin(false);
    router.replace("/");
  }

  return (
    <header className={`site-header ${variant === "dark" ? "dark" : ""}`}>
      <div className="wrap">
        <Link href="/" className="brand">
          열렸조
        </Link>
        <nav className="nav" aria-label="주요 메뉴">
          <Link href="/#flow">동작 방식</Link>
          <Link href="/team">팀 소개</Link>
          <Link href="/send">올려진 파일 확인</Link>
        </nav>
        {isAdmin && (
          <button type="button" className="btn btn-ghost btn-small" onClick={handleLogout}>
            로그아웃
          </button>
        )}
      </div>
    </header>
  );
}
