import type { Metadata } from "next";
import AppNavigation from "@/components/AppNavigation";
import ProfileApp from "@/components/ProfileApp";

// Личный кабинет. Персональная страница — не индексируем (за ней всё равно
// сессия пользователя, публичного контента нет).
export const metadata: Metadata = {
  title: "Личный кабинет — SmartCook",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return (
    <>
      <AppNavigation activeSection="profile" />
      <ProfileApp />
    </>
  );
}
