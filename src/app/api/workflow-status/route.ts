import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getWorkflowStatus } from "@/lib/github";

// GET /api/workflow-status?repo=site-name-abc123
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = req.nextUrl.searchParams.get("repo");
  if (!repo) {
    return NextResponse.json({ error: "Missing repo param" }, { status: 400 });
  }

  const status = await getWorkflowStatus(repo);
  return NextResponse.json(status);
}
