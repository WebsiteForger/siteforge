import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { triggerAIEdit } from "@/lib/github";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId, prompt } = await req.json();

  if (!siteId || !prompt) {
    return NextResponse.json({ error: "Missing siteId or prompt" }, { status: 400 });
  }

  // That's it. This is the entire AI backend.
  await triggerAIEdit(siteId, prompt);

  return NextResponse.json({ ok: true, message: "Edit triggered" });
}
