import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { deletePartyAction } from "@/app/actions/party";

export const runtime = "nodejs";

export async function DELETE(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Не хватает ID банкета" }, { status: 400 });
  }

  const result = await deletePartyAction(id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
