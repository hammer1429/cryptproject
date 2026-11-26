"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatBytes } from "@/lib/format";
import { consumeDownload, getUploadedFile, UploadedFileRecord } from "@/lib/uploadStore";
import { CheckState, verifyIntegrity } from "@/lib/crypto/integrity";

export default function ElecSign() {
  const [file, setFile] = useState<UploadedFileRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [hashState, setHashState] = useState<CheckState>("not-implemented");
  const [signatureState, setSignatureState] = useState<CheckState>("not-implemented");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem("download-file-id");
    if (!id) {
      setIsLoading(false);
      setError("다운로드할 파일 정보가 없습니다.");
      return;
    }

    void getUploadedFile(id)
      .then((record) => {
        if (!record) {
          setError("파일을 찾을 수 없거나 이미 삭제되었습니다.");
          return;
        }
        if (record.expiresAt <= Date.now()) {
          setError("파일의 보관 시간이 만료되었습니다.");
          return;
        }
        setFile(record);
      })
      .catch(() => setError("파일 정보를 불러오는 중 오류가 발생했습니다."))
      .finally(() => setIsLoading(false));
  }, []);

  async function verifySignedFile() {
    if (!file) return;
    setIsVerifying(true);
    setVerified(false);
    setError("");
    setHashState("not-implemented");
    setSignatureState("not-implemented");
    try {
      const plain = await file.file.arrayBuffer();
      const result = await verifyIntegrity(
        plain,
        file.digest,
        file.signature,
        file.publicKeyJwk,
        file.signatureImage,
      );
      setHashState(result.hash);
      setSignatureState(result.signature);
      setVerified(result.hash === "ok" && result.signature === "ok");
      if (result.hash !== "ok" || result.signature !== "ok") {
        setError("파일 무결성 또는 보내는 사람의 서명을 검증하지 못했습니다.");
      }
    } catch {
      setHashState("fail");
      setSignatureState("fail");
      setError("전자서명 검증 중 오류가 발생했습니다.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function downloadVerifiedFile() {
    if (!file || !verified) return;

    setIsDownloading(true);
    setError("");
    try {
      const result = await consumeDownload(file.id);
      if (!result.allowed) {
        setError(
          result.reason === "expired"
            ? "파일의 보관 시간이 만료되었습니다."
            : result.reason === "limit-reached"
              ? "다운로드 횟수를 모두 사용했습니다."
              : "파일을 찾을 수 없거나 이미 삭제되었습니다.",
        );
        setFile(null);
        sessionStorage.removeItem("download-file-id");
        return;
      }

      const url = URL.createObjectURL(file.file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setFile({ ...file, downloadCount: (file.downloadCount ?? 0) + 1 });
      if (result.downloadsRemaining === 0) {
        sessionStorage.removeItem("download-file-id");
      }
    } catch {
      setError("다운로드 횟수를 처리하는 중 오류가 발생했습니다.");
    } finally {
      setIsDownloading(false);
    }
  }

  function checkLabel(state: CheckState) {
    if (state === "ok") return "검증 성공";
    if (state === "fail") return "검증 실패";
    return "검증 대기";
  }

  function checkClass(state: CheckState) {
    if (state === "ok") return "chip-ok";
    if (state === "fail") return "chip-fail";
    return "chip-todo";
  }

  const downloadLimitReached =
    file !== null && (file.downloadCount ?? 0) >= (file.maxDownloads ?? 1);

  if (isLoading) {
    return (
      <div className="panel">
        <p className="waiting">다운로드할 파일을 확인하는 중입니다.</p>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <h2>1. 서명 대상 파일 확인</h2>
        {file ? (
          <div className="file-row">
            <div>
              <div className="name">{file.name}</div>
              <div className="size">{formatBytes(file.size)}</div>
            </div>
            <Link href="/send" className="btn btn-ghost btn-small">
              목록으로
            </Link>
          </div>
        ) : (
          <p className="panel-sub">다운로드할 파일을 찾을 수 없습니다.</p>
        )}
      </div>

      {file && (
        <div className="panel">
          <h2>2. 보내는 사람 서명 확인</h2>
          <p className="panel-sub">
            업로드할 때 저장된 서명 이미지와 ECDSA 서명을 확인합니다.
          </p>
          {error && <div className="error" role="alert">{error}</div>}
          {file.signatureImage ? (
            <div className="field">
              <span className="label">보내는 사람 서명</span>
              <img
                className="signature-preview"
                src={file.signatureImage}
                alt="보내는 사람이 업로드할 때 작성한 서명"
              />
            </div>
          ) : (
            <div className="error" role="alert">이 파일에는 보내는 사람 서명 정보가 없습니다.</div>
          )}
          <ul className="checks" aria-label="전자서명 검증 결과">
            <li>
              <span>SHA-256 무결성 검사</span>
              <span className={`chip ${checkClass(hashState)}`}>{checkLabel(hashState)}</span>
            </li>
            <li>
              <span>ECDSA 서명 및 서명 이미지 검사</span>
              <span className={`chip ${checkClass(signatureState)}`}>{checkLabel(signatureState)}</span>
            </li>
          </ul>
          {verified && (
            <div className="notice">보내는 사람 서명과 파일 무결성이 모두 검증되었습니다.</div>
          )}
          {downloadLimitReached && <div className="notice">다운로드 횟수를 모두 사용했습니다.</div>}
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={isVerifying}
              onClick={() => void verifySignedFile()}
            >
              {isVerifying ? "검증 중..." : "전자서명 검증"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!verified || isDownloading || downloadLimitReached}
              onClick={() => void downloadVerifiedFile()}
            >
              {isDownloading ? "다운로드 준비 중..." : "파일 다운로드"}
            </button>
            <Link href="/send" className="btn btn-ghost">
              취소
            </Link>
          </div>
        </div>
      )}

      {!file && (
        <div className="panel">
          {error && <div className="error" role="alert">{error}</div>}
          <div className="actions">
            <Link href="/send" className="btn btn-primary">파일 로비로 이동</Link>
          </div>
        </div>
      )}
    </>
  );
}
