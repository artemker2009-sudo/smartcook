"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { User as UserIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";

// Глобальный вход в личный кабинет — плавающая аватар-кнопка справа вверху
// (зеркально гамбургеру слева). Монтируется всегда (в app/layout.tsx) и сама
// решает видимость на клиенте по usePathname — тот же приём, что у TabBar,
// потому что серверный root-layout не пересчитывает свой gate при soft-навигации.
// Прячется там же, где таб-бар (админка, полноэкранная комната банкета), а также
// на самой странице кабинета (нет смысла вести на текущий экран).
export default function ProfileEntry() {
  const pathname = usePathname() || "/";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initial, setInitial] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const apply = (user: { user_metadata?: { avatar_url?: string; full_name?: string }; email?: string } | null) => {
      if (!active) return;
      setAvatarUrl(user?.user_metadata?.avatar_url ?? null);
      const name = user?.user_metadata?.full_name || user?.email || "";
      setInitial(name ? name.charAt(0).toUpperCase() : null);
    };
    supabase.auth.getSession().then(({ data: { session } }) => apply(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user ?? null));
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAdminRoute = pathname.startsWith("/admin");
  const isPartyRoom = pathname.startsWith("/party/") && pathname !== "/party/create";
  const isProfile = pathname.startsWith("/profile");
  if (isAdminRoute || isPartyRoom || isProfile) return null;

  return (
    <Link
      href="/profile"
      onClick={() => reachGoal("profile_open")}
      aria-label="Личный кабинет"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top) + var(--space-2))",
        right: "var(--space-3)",
        zIndex: 50,
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        background: "var(--color-surface)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        textDecoration: "none",
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : initial ? (
        <span style={{ color: "white", background: "var(--color-accent)", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-body)" }}>
          {initial}
        </span>
      ) : (
        <UserIcon size={24} color="var(--color-text)" />
      )}
    </Link>
  );
}
