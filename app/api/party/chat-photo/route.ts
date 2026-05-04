import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PARTY_CHAT_PHOTO_BUCKET = "recipe_photos";
const PARTY_CHAT_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_PHOTO_MESSAGE_PREFIX = "__party_chat_photo__:";

export const runtime = "nodejs";

const createServerSupabaseClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for party chat photo uploads");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);
};

const getPhotoExtension = (file: File) => {
  const fileExtension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fileExtension) return fileExtension;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Неизвестная ошибка сервера");

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const partyId = String(formData.get("partyId") ?? "").trim();
    const userId = String(formData.get("userId") ?? "").trim();
    const userName = String(formData.get("userName") ?? "").trim();
    const file = formData.get("file");

    if (!partyId || !userId || !userName) {
      return NextResponse.json({ error: "Не хватает данных для отправки фото" }, { status: 400 });
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Выберите фото для отправки" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Можно отправлять только фото" }, { status: 400 });
    }

    if (file.size > PARTY_CHAT_PHOTO_MAX_BYTES) {
      return NextResponse.json({ error: "Фото слишком большое. Максимум 8 МБ" }, { status: 413 });
    }

    const supabase = createServerSupabaseClient();
    const extension = getPhotoExtension(file);
    const filePath = `party-chat/${partyId}/${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const fileBuffer = await file.arrayBuffer();

    console.log("1. Загружаем фото чата:", {
      partyId,
      userId,
      filePath,
      size: file.size,
      type: file.type,
    });

    const { error: uploadError } = await supabase.storage
      .from(PARTY_CHAT_PHOTO_BUCKET)
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("Supabase chat photo upload error:", uploadError);
      throw new Error("Supabase Storage Error: " + JSON.stringify(uploadError));
    }

    const { data } = supabase.storage.from(PARTY_CHAT_PHOTO_BUCKET).getPublicUrl(filePath);

    if (!data.publicUrl) {
      throw new Error("Supabase Storage Error: public URL was not returned");
    }

    console.log("2. Записываем фото в party_messages:", { partyId, userId, filePath });
    const { data: message, error: messageError } = await supabase
      .from("party_messages")
      .insert([
        {
          party_id: partyId,
          user_id: userId,
          user_name: userName,
          text: `${CHAT_PHOTO_MESSAGE_PREFIX}${data.publicUrl}`,
        },
      ])
      .select("*")
      .single();

    if (messageError) {
      console.error("Supabase party_messages photo insert error:", messageError);
      throw new Error("Supabase Error: " + JSON.stringify(messageError));
    }

    console.log("3. Фото отправлено в чат:", { partyId, messageId: message?.id });
    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error("Party chat photo upload route error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
