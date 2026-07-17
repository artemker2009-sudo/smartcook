import type { Metadata } from "next";
import AppNavigation from "@/components/AppNavigation";
import CommunityFeed, { type CommunityPost } from "@/components/CommunityFeed";

export const metadata: Metadata = {
  title: "Лента сообщества — SmartCook",
  description: "Фото блюд от пользователей SmartCook. Делитесь своими блюдами и оценивайте чужие.",
  alternates: { canonical: "/feed" },
};

// Лента сообщества (/). Серверный компонент: первые одобренные посты читаются на
// СЕРВЕРЕ из публичного view community_posts_public (не отдаёт user_ref/status,
// только одобренные) и попадают в HTML сразу. Интерактив (лайки, публикация,
// «мои на модерации») — в клиентском CommunityFeed. explicit columns, без
// служебных полей в пейлоаде.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

async function getFeed(): Promise<CommunityPost[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/community_posts_public?select=id,created_at,user_name,recipe_title,recipe_id,photo_url,caption,likes_count,liked_by_me&order=created_at.desc&limit=60`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as CommunityPost[]) : [];
  } catch {
    return [];
  }
}

export default async function FeedPage() {
  const items = await getFeed();
  return (
    <div className="container">
      <AppNavigation activeSection="feed" />
      <CommunityFeed initialItems={items} />
    </div>
  );
}
