"use client";

import { DragEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes } from "@/lib/format";
import { DEFAULT_EXPIRY_MS, EXPIRY_OPTIONS, MAX_FILE_BYTES } from "@/lib/types";
import { saveUploadedFile } from "@/lib/uploadStore";
import { signBytes } from "@/lib/crypto/integrity";

export default function Upload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expiryMs, setExpiryMs] = useState<number>(DEFAULT_EXPIRY_MS);
  const [customMinutes, setCustomMinutes] = useState("");
  const [useCustomExpiry, setUseCustomExpiry] = useState(false);
  const [maxDownloads, setMaxDownloads] = useState("1");
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.strokeStyle = "#14181b";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
  }, [file]);

  function getSignaturePoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startSignature(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getSignaturePoint(event);
    if (!canvas || !context || !point) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function drawSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const context = signatureCanvasRef.current?.getContext("2d");
    const point = getSignaturePoint(event);
    if (!context || !point) return;
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasSignature(true);
  }

  function stopSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = signatureCanvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  function updateCustomMinutes(value: string) {
    setCustomMinutes(value);
    setUseCustomExpiry(true);
    setError("");

    const minutes = Number(value);
    if (value && Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440) {
      setExpiryMs(minutes * 60 * 1000);
    }
  }

  function selectFile(selected: File | null) {
    setError("");

    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setError(`파일은 ${formatBytes(MAX_FILE_BYTES)} 이하만 선택할 수 있습니다.`);
      return;
    }

    setFile(selected);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  async function uploadFile() {
    if (!file) return;

    const downloadLimit = Number(maxDownloads);
    if (!Number.isSafeInteger(downloadLimit) || downloadLimit < 1) {
      setError("다운로드 횟수는 1 이상의 정수로 입력하세요.");
      return;
    }

    if (useCustomExpiry) {
      const minutes = Number(customMinutes);
      if (!customMinutes || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        setError("보관 시간은 1분부터 1440분(24시간) 사이의 정수로 입력하세요.");
        return;
      }
    }

    setError("");
    setIsUploading(true);
    const uploadedAt = Date.now();
    try {
      if (!hasSignature || !signatureCanvasRef.current) {
        setError("파일을 업로드하려면 먼저 전자 서명란에 서명하세요.");
        setIsUploading(false);
        return;
      }
      const signatureImage = signatureCanvasRef.current.toDataURL("image/png");
      const plain = await file.arrayBuffer();
      const signingResult = await signBytes(plain, signatureImage);
      await saveUploadedFile({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        uploadedAt,
        expiresAt: uploadedAt + expiryMs,
        maxDownloads: downloadLimit,
        downloadCount: 0,
        file,
        digest: signingResult.digest,
        signature: signingResult.signature,
        publicKeyJwk: signingResult.publicKeyJwk,
        signatureImage,
      });
      router.push("/send");
    } catch {
      setError("파일을 저장하는 중 오류가 발생했습니다.");
      setIsUploading(false);
    }
  }

  return (
    <>
      <div className="panel">
        <h2>1. 파일 선택</h2>
        <p className="panel-sub">파일 하나를 최대 {formatBytes(MAX_FILE_BYTES)}까지 업로드할 수 있습니다.</p>

        {file ? (
          <div className="file-row">
            <div>
              <div className="name">{file.name}</div>
              <div className="size">{formatBytes(file.size)}</div>
            </div>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => selectFile(null)}>
              다른 파일
            </button>
          </div>
        ) : (
          <div
            className={`dropzone${isDragging ? " is-over" : ""}`}
            role="button"
            tabIndex={0}
            onClick={openFilePicker}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openFilePicker();
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            />
            <span className="big">파일을 끌어다 놓거나 눌러서 고르세요</span>
            <span className="small">선택한 파일은 최대 {formatBytes(MAX_FILE_BYTES)}까지 가능합니다.</span>
          </div>
        )}

        {error && <div className="error" role="alert">{error}</div>}
      </div>

      <div className="panel">
        <h2>2. 보내는 사람 서명</h2>
        <p className="panel-sub">마우스나 터치로 서명란에 서명하세요.</p>
        <div className="field">
          <span className="label">서명란</span>
          <canvas
            ref={signatureCanvasRef}
            className="signature-canvas"
            width={900}
            height={260}
            aria-label="보내는 사람이 서명할 영역"
            onPointerDown={startSignature}
            onPointerMove={drawSignature}
            onPointerUp={stopSignature}
            onPointerCancel={stopSignature}
          />
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={clearSignature}>
            서명 지우기
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>3. 보관 시간 선택</h2>
        <p className="panel-sub">받는 사람이 열지 않아도 이 시간이 지나면 파일이 삭제됩니다.</p>
        <div className="segmented" role="radiogroup" aria-label="보관 시간">
          {EXPIRY_OPTIONS.map((option) => (
            <label key={option.ms}>
              <input
                type="radio"
                name="expiry"
                value={option.ms}
                checked={!useCustomExpiry && expiryMs === option.ms}
                onChange={() => {
                  setUseCustomExpiry(false);
                  setCustomMinutes("");
                  setExpiryMs(option.ms);
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <div className="field">
          <label htmlFor="custom-expiry">다른 시간 직접 입력</label>
          <div className="custom-expiry">
            <input
              id="custom-expiry"
              type="number"
              min={1}
              max={1440}
              step={1}
              inputMode="numeric"
              value={customMinutes}
              placeholder="예: 30"
              onChange={(event) => updateCustomMinutes(event.target.value)}
            />
            <span>분</span>
          </div>
          <p className="hint">1분 이상 24시간(1440분) 이하로 입력할 수 있습니다.</p>
        </div>
      </div>

      <div className="panel">
        <h2>4. 다운로드 횟수 설정</h2>
        <p className="panel-sub">설정한 횟수만큼 다운로드하면 파일이 삭제됩니다.</p>
        <div className="field">
          <label htmlFor="max-downloads">최대 다운로드 횟수</label>
          <div className="custom-expiry">
            <input
              id="max-downloads"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={maxDownloads}
              onChange={(event) => {
                setMaxDownloads(event.target.value);
                setError("");
              }}
            />
            <span>회</span>
          </div>
          <p className="hint">1 이상의 정수를 입력하세요.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={!file || !hasSignature || isUploading} onClick={uploadFile}>
            {isUploading ? "업로드 중..." : "파일 업로드"}
          </button>
        </div>
      </div>
    </>
  );
}