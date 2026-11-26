"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const AUTH_KEY = "admin-authenticated";

export default function AdminDashboardPage() {
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) !== "true") {
      window.location.replace("/admin?returnTo=%2Fadmin%2Fadminpage");
      return;
    }
    setIsAuthorized(true);
  }, []);

  return (
    <>
      <Header />
      <main className="page-main">
        <div className="wrap">
          <div className="page-narrow">
            <h1 className="page-title">관리자 페이지</h1>
            <p className="page-lead">확인할 관리 기능을 선택하세요.</p>

            {isAuthorized ? (
              <>
                <section className="panel">
                  <h2>다운로드 로그</h2>
                  <p className="panel-sub">파일 다운로드 시각과 횟수 기록을 확인합니다.</p>
                  <Link href="/admin/log" className="btn btn-primary">
                    로그 페이지로 이동
                  </Link>
                </section>

                <section className="panel">
                  <h2>업로드 파일 관리</h2>
                  <p className="panel-sub">업로드된 파일을 확인하고 필요하면 삭제할 수 있습니다.</p>
                  <Link href="/admin/files" className="btn btn-primary">
                    파일 확인 및 삭제
                  </Link>
                </section>
              </>
            ) : (
              <p className="waiting">관리자 권한을 확인하는 중입니다.</p>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}