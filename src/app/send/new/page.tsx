import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Upload from "./upload";
import OtpGuard from "@/components/OtpGuard";

export default function NewUploadPage() {
  return (
    <>
      <Header />
      <OtpGuard>
      <main className="page-main">
        <div className="wrap">
          <div className="page-narrow">
            <h1 className="page-title">새 파일 업로드</h1>
            <p className="page-lead">업로드할 파일, 보관 시간과 다운로드 횟수를 선택하세요.</p>
            <Upload />
          </div>
        </div>
      </main>
      </OtpGuard>
      <Footer />
    </>
  );
}
