import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CommunityFeed, { type CommunityPost } from "@/components/CommunityFeed";
import { FEATURE_COMMUNITY_FEED } from "@/lib/features";
import { readRows } from "@/lib/supabaseRead";

// При выключенной ленте метаданных нет вовсе — чтобы название раздела не
// просочилось в <title> страницы 404.
export const metadata: Metadata = FEATURE_COMMUNITY_FEED
  ? {
      title: "Лента сообщества — SmartCook",
      description: "Фото блюд от пользователей SmartCook. Делитесь своими блюдами и оценивайте чужие.",
      alternates: { canonical: "/feed" },
    }
  : {};

// Лента сообщества (/). Серверный компонент: первые одобренные посты читаются на
// СЕРВЕРЕ из публичного view community_posts_public (не отдаёт user_ref/status,
// только одобренные) и попадают в HTML сразу. Интерактив (лайки, публикация,
// «мои на модерации») — в клиентском CommunityFeed. explicit columns, без
// служебных полей в пейлоаде.
async function getFeed(): Promise<CommunityPost[]> {
  // Сбой — исключение, а не пустая лента (lib/supabaseRead.ts).
  return readRows<CommunityPost>(
    `community_posts_public?select=id,created_at,user_name,recipe_title,recipe_id,photo_url,caption,likes_count,liked_by_me&order=created_at.desc&limit=60`,
    { revalidate: 60 },
  );
}

export default async function FeedPage() {
  // Лента скрыта флагом — настоящий 404, и до запроса к БД.
  if (!FEATURE_COMMUNITY_FEED) notFound();
  const items = await getFeed();
  return (
    <div className="container feed-container">
      <CommunityFeed initialItems={items} />
    </div>
  );
}
