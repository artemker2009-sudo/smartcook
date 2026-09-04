import type { Metadata } from "next";
import Link from "next/link";
import DocPage from "@/components/DocPage";

// Страница 404. До неё Next отдавал свой английский дефолт («This page could
// not be found») без шапки и без выхода — на скриншоте проверяющего App Store
// это выглядит как сломанное приложение на чужом языке.
//
// Оформление — то же, что у /privacy и /about (DocPage): общая шапка-меню,
// та же типографика, футер из layout. Единственное действие — «На главную».

export const metadata: Metadata = {
  title: "Страница не найдена — SmartCook",
  // 404 не должна попадать в индекс (у неё нет полезного содержимого) и не
  // должна тянуть за собой ссылочный вес.
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <DocPage title="Страница не найдена">
      <p>
        Такой страницы у нас нет. Возможно, ссылка устарела или в адресе
        опечатка.
      </p>
      <p>
        Вернитесь на главную — и попробуйте снова: сфотографируйте продукты или
        найдите рецепт по названию.
      </p>
      <div style={{ marginTop: "var(--space-5)" }}>
        <Link href="/" className="btn-primary" style={{ textDecoration: "none" }}>
          На главную
        </Link>
      </div>
    </DocPage>
  );
}
