import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ElecSign from "./elecsign";

export default function ElecSignPage() {
  return (
    <>
      <Header />
      <main className="page-main">
        <div className="wrap">
          <div className="page-narrow">
            <h1 className="page-title">전자서명</h1>
            <p className="page-lead">
              보내는 사람이 남긴 서명과 파일 무결성을 확인한 뒤 다운로드합니다.
            </p>
            <ElecSign />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
