"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatBytes } from "@/lib/format";
import { deleteUploadedFile, listUploadedFiles, type UploadedFileRecord } from "@/lib/uploadStore";

const AUTH_KEY = "admin-authenticated";

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminFilesPage() {
  const [files, setFiles] = useState<UploadedFileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) !== "true") {
      window.location.replace("/admin?returnTo=%2Fadmin%2Ffiles");
      return;
    }

    async function loadFiles() {
      try {
        setFiles(await listUploadedFiles());
      } catch {
        setError("업로드 파일 목록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadFiles();
  }, []);

  async function removeFile(file: UploadedFileRecord) {
    if (!window.confirm(`"${file.name}" 파일을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`)) {
      return;
    }

    setDeletingId(file.id);
    setError("");
    try {
      await deleteUploadedFile(file.id);
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } catch {
      setError("파일을 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Header />
      <main className="page-main">
        <div className="wrap">
          <div className="page-narrow">
            <h1 className="page-title">업로드 파일 관리</h1>
            <p className="page-lead">파일을 확인하고 삭제할 수 있습니다.</p>

            <div className="panel">
              <div className="file-row">
                <div>
                  <h2>파일 목록</h2>
                  {!isLoading && !error && <p className="panel-sub">총 {files.length}개 파일</p>}
                </div>
                <Link href="/admin/adminpage" className="btn btn-ghost btn-small">
                  관리자 페이지
                </Link>
              </div>

              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              {isLoading ? (
                <p className="waiting">관리자 권한과 파일 목록을 확인하는 중입니다.</p>
              ) : error ? null : files.length === 0 ? (
                <p className="big-state">확인할 파일이 없습니다.</p>
              ) : (
                <div className="table-scroll">
                  <table className="roles">
                    <thead>
                      <tr>
                        <th scope="col">파일 이름</th>
                        <th scope="col">크기</th>
                        <th scope="col">업로드 시각</th>
                        <th scope="col">만료 시각</th>
                        <th scope="col">다운로드</th>
                        <th scope="col">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => (
                        <tr key={file.id}>
                          <td>{file.name}</td>
                          <td>{formatBytes(file.size)}</td>
                          <td>{formatTime(file.uploadedAt)}</td>
                          <td>{formatTime(file.expiresAt)}</td>
                          <td>{file.downloadCount ?? 0}/{file.maxDownloads ?? 1}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-danger btn-small"
                              disabled={deletingId !== null}
                              onClick={() => void removeFile(file)}
                            >
                              {deletingId === file.id ? "삭제 중..." : "삭제"}
                            </button>
                          </td>
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
