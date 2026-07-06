import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAndConsumeReadRateLimit, readRateLimitResponse } from "@/lib/rateLimit";

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

export async function POST(req: Request) {
  try {
    const rateLimit = await checkAndConsumeReadRateLimit(req, "photo-feed");
    if (!rateLimit.ok) return readRateLimitResponse(rateLimit);

    const { sort, sessionId } = await req.json();

    let query = supabase.from('feed_posts').select('*, recipes(title)').eq('status', 'approved');

    if (sort === 'top') {
      query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
    } else if (sort === 'old') {
      query = query.order('created_at', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data: posts, error } = await query.limit(50);
    if (error) throw error;

    let likedPostIds = new Set();
    if (sessionId && posts && posts.length > 0) {
      const postIds = posts.map((p: any) => p.id);
      const { data: likes } = await supabase.from('photo_likes').select('post_id').in('post_id', postIds).eq('session_id', sessionId);
      if (likes) likes.forEach((l: any) => likedPostIds.add(l.post_id));
    }

    const formattedPosts = posts?.map((p: any) => ({ ...p, is_liked: likedPostIds.has(p.id) })) || [];
    return NextResponse.json({ feed: formattedPosts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}