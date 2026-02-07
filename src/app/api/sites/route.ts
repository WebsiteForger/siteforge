import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSiteRepo, listUserSites } from "@/lib/github";
import { createNetlifySite } from "@/lib/netlify";

// GET /api/sites — list sites owned by the logged-in user
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repos = await listUserSites(userId);
  const sites = repos.map((repo) => ({
    id: repo.name,
    name: repo.name,
    url: `https://${repo.name}.netlify.app`,
    github_url: repo.html_url,
    created_at: repo.created_at,
  }));

  return NextResponse.json(sites);
}

// POST /api/sites — create a new site (GitHub repo + Netlify site)
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await req.json();

  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    return NextResponse.json(
      { error: "Site name must be lowercase letters, numbers, and hyphens only" },
      { status: 400 }
    );
  }

  // 1. Create GitHub repo from template + set Anthropic API key secret
  const repo = await createSiteRepo(name, userId);

  // 2. Create Netlify site linked to the GitHub repo (auto-deploys on push)
  const netlifySite = await createNetlifySite(name);

  return NextResponse.json({
    id: repo.name,
    name: repo.name,
    url: netlifySite.url,
    github_url: repo.html_url,
    netlify_admin: netlifySite.admin_url,
  });
}
