import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Используем админский ключ, чтобы счетчик лайков 100% менялся
const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

export async function POST(req: Request) {
  try {
    const { postId, sessionId, action } = await req.json();

    if (action === 'like') {
      await supabase.from('photo_likes').insert({ post_id: postId, session_id: sessionId });
    } else {
      await supabase.from('photo_likes').delete().match({ post_id: postId, session_id: sessionId });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}