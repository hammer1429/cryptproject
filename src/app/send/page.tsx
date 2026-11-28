"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import OtpGuard from "@/components/OtpGuard";
import { formatBytes } from "@/lib/format";
import { deleteUploadedFile, listUploadedFiles } from "@/lib/uploadStore";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: number;
  expiresAt: number;
  maxDownloads?: number;
  downloadCount?: number;
  file: Blob;
  digest: string;
  signature: string;
  signatureImage?: string;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SendPage() {
  return (
    <>
      <Header />
      <OtpGuard>
        <FileLobby />
      </OtpGuard>
      <Footer />
    </>
  );
}

/**
 * 파일 목록 화면. OtpGuard 안쪽에서만 그려지므로,
 * OTP 로그인이 확인된 뒤에야 아래 useEffect(파일 불러오기)가 실행된다.
 */
function FileLobby() {
  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);

  useEffect(() => {
    async function loadFiles() {
      const records = await listUploadedFiles();
      const now = Date.now();
      const liveRecords = records.filter((record) => record.expiresAt > now);
      await Promise.all(records.filter((record) => record.expiresAt <= now).map((record) => deleteUploadedFile(record.id)));
      setFiles(liveRecords);
    }
    void loadFiles();

    const intervalId = window.setInterval(() => {
      void loadFiles();
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function removeFile(id: string) {
    await deleteUploadedFile(id);
    setFiles((current) => current.filter((file) => file.id !== id));
  }

  function openElectronicSignature(file: UploadedFile) {
    sessionStorage.setItem("download-file-id", file.id);
    router.push("/send/elecsign");
  }

  return (
      <main className="page-main">
        <div className="wrap">
          <div className="page-narrow">
            <div className="file-row" style={{ marginBottom: "24px" }}>
              <div>
                <h1 className="page-title">파일 로비</h1>
                <p className="page-lead" style={{ marginBottom: 0 }}>
                  업로드된 파일을 확인하고 관리합니다.
                </p>
              </div>
              <Link href="/send/new" className="btn btn-primary">
                파일 올리기
              </Link>
            </div>

            {files.length === 0 ? (
              <div className="panel" style={{ textAlign: "center" }}>
                <p className="big-state">업로드된 파일이 없습니다.</p>
                <p className="panel-sub">새 파일을 올려 로비에 등록하세요.</p>
                <Link href="/send/new" className="btn btn-primary">
                  새 파일 올리기
                </Link>
              </div>
            ) : (
              <div className="panel">
                <h2>업로드 목록</h2>
                <p className="panel-sub">총 {files.length}개의 파일</p>
                {files.map((file) => (
                  <div className="file-row" style={{ padding: "16px 0", borderTop: "1px solid var(--line)" }} key={file.id}>
                    <div>
                      <div className="name">{file.name}</div>
                      <div className="size">
                        {formatBytes(file.size)} · 업로드 {formatTime(file.uploadedAt)}
                      </div>
                      <div className="size">삭제 예정 {formatTime(file.expiresAt)}</div>
                      <div className="size">
                        다운로드 {file.downloadCount ?? 0}/{file.maxDownloads ?? 1}회
                      </div>
                    </div>
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => openElectronicSignature(file)}
                      >
                        전자서명 후 다운로드
                      </button>
                      <button type="button" className="btn btn-danger btn-small" onClick={() => void removeFile(file.id)}>
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
  );
}
