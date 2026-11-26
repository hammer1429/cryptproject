"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatBytes } from "@/lib/format";
import { listDownloadLogs, type DownloadLogRecord } from "@/lib/uploadStore";

const AUTH_KEY = "admin-authenticated";

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AdminLogPage() {
  const [logs, setLogs] = useState<DownloadLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) !== "true") {
      window.location.replace("/admin?returnTo=%2Fadmin%2Flog");
      return;
    }

    async function loadLogs() {
      try {
        setLogs(await listDownloadLogs());
      } catch {
        setError("다운로드 기록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadLogs();
  }, []);

  return (
    <>
      <Header />
      <main className="page-main">
        <div className="wrap">
          <div className="page-narrow">
            <h1 className="page-title">다운로드 로그</h1>
            <p className="page-lead">파일이 다운로드된 기록을 확인합니다.</p>
            <div className="panel">
              <div className="file-row">
                <div>
                  <h2>로그 목록</h2>
                  {!isLoading && !error && (
                    <p className="panel-sub">총 {logs.length}건의 다운로드 기록</p>
                  )}
                </div>
                <Link href="/admin/adminpage" className="btn btn-ghost btn-small">
                  관리자 페이지
                </Link>
              </div>

              {isLoading ? (
                <p className="waiting">관리자 권한과 기록을 확인하는 중입니다.</p>
              ) : error ? (
                <div className="error" role="alert">
                  {error}
                </div>
              ) : logs.length === 0 ? (
                <p className="big-state">다운로드 기록이 없습니다.</p>
              ) : (
                <div className="table-scroll">
                  <table className="roles">
                    <thead>
                      <tr>
                        <th scope="col">다운로드 시각</th>
                        <th scope="col">파일 이름</th>
                        <th scope="col">크기</th>
                        <th scope="col">파일 ID</th>
                        <th scope="col">회차</th>
                        <th scope="col">남은 횟수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td>{formatTime(log.downloadedAt)}</td>
                          <td>{log.fileName}</td>
                          <td>{formatBytes(log.fileSize)}</td>
                          <td className="path">{log.fileId}</td>
                          <td>
                            {log.downloadNumber}/{log.maxDownloads}
                          </td>
                          <td>{log.downloadsRemaining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
