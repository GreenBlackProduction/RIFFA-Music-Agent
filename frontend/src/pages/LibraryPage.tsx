import { useTranslation } from "react-i18next";
import { LibraryCard } from "@/components/studio/LibraryCard";
import "./LibraryPage.css";

export function LibraryPage() {
  const { i18n } = useTranslation();
  const isEN = (i18n.resolvedLanguage || i18n.language || "ru").startsWith("en");

  return (
    <div className="library-page">
      <div className="top-meta">
        <div className="breadcrumb">
          <b>{isEN ? "library" : "библиотека"}</b>
        </div>
        <div>{isEN ? "your tracks" : "твои треки"}</div>
      </div>
      <h1 className="h-page">
        {isEN ? <>My <em>library</em>.</> : <>Моя <em>библиотека</em>.</>}
      </h1>
      <LibraryCard />
    </div>
  );
}
