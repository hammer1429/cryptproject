"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";

const ADMIN_ID = "admin";
const ADMIN_PASSWORD = "admin1234";
const AUTH_KEY = "admin-authenticated";

export default function AdminLoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");

    if (id.trim() === ADMIN_ID && password === ADMIN_PASSWORD) {
      setIsSubmitting(true);
      sessionStorage.setItem(AUTH_KEY, "true");

      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
        router.replace(returnTo);
      } else {
        router.replace("/admin/adminpage");
      }
      return;
    }

    setError("관리자 ID 또는 비밀번호가 올바르지 않습니다.");
  }

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <span className="brand">열렸조 관리자</span>
        </div>
      </header>

      <main className="page-main">
        <div className="wrap">
          <div className="page-narrow">
            <h1 className="page-title">관리자 로그인</h1>
            <p className="page-lead">관리자만 이용할 수 있는 페이지입니다.</p>

            <div className="panel">
              <form onSubmit={handleSubmit}>
                <div className="field" style={{ marginTop: 0 }}>
                  <label htmlFor="admin-id">관리자 ID</label>
                  <input
                    id="admin-id"
                    name="id"
                    type="text"
                    autoComplete="username"
                    value={id}
                    onChange={(event) => setId(event.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 44,
                      padding: "8px 12px",
                      border: "2px solid var(--line)",
                      borderRadius: 8,
                      font: "inherit",
                      background: "var(--white)",
                      color: "var(--ink)",
                    }}
                  />
                </div>

                <div className="field">
                  <label htmlFor="admin-password">비밀번호</label>
                  <input
                    id="admin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 44,
                      padding: "8px 12px",
                      border: "2px solid var(--line)",
                      borderRadius: 8,
                      font: "inherit",
                      background: "var(--white)",
                      color: "var(--ink)",
                    }}
                  />
                </div>

                {error ? (
                  <div className="error" role="alert">
                    {error}
                  </div>
                ) : null}

                <div className="actions">
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "로그인 중..." : "로그인"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
