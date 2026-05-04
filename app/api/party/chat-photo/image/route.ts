import { NextResponse } from "next/server";

export const runtime = "nodejs";

const getAllowedStorageHost = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    return new URL(supabaseUrl).host;
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const photoUrl = requestUrl.searchParams.get("url");
    const allowedStorageHost = getAllowedStorageHost();

    if (!photoUrl || !allowedStorageHost) {
      return NextResponse.json({ error: "Не хватает URL фото" }, { status: 400 });
    }

    const parsedPhotoUrl = new URL(photoUrl);

    if (parsedPhotoUrl.protocol !== "https:" || parsedPhotoUrl.host !== allowedStorageHost) {
      return NextResponse.json({ error: "Недопустимый URL фото" }, { status: 400 });
    }

    const storageResponse = await fetch(parsedPhotoUrl, { cache: "no-store" });

    if (!storageResponse.ok) {
      return NextResponse.json({ error: "Фото недоступно" }, { status: storageResponse.status });
    }

    const contentType = storageResponse.headers.get("content-type") ?? "image/jpeg";
    const imageBuffer = await storageResponse.arrayBuffer();

    return new Response(imageBuffer, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Party chat photo proxy error:", error);
    return NextResponse.json({ error: "Не удалось загрузить фото" }, { status: 500 });
  }
}
