import { Panel } from "@/components/ui/Panel";

export function LibraryPage() {
  return (
    <Panel>
      <h1>Мои генерации</h1>
      <p className="muted">
        Список треков с фильтрами по типу, настроению и дате. Появится после интеграции с реальной
        генерацией.
      </p>
    </Panel>
  );
}
