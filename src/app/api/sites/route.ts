import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSiteRepo, listUserSites, getDisplayName, triggerAIEdit } from "@/lib/github";
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
    name: getDisplayName(repo.description) || repo.name,
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

  const { name, description } = await req.json();

  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    return NextResponse.json(
      { error: "Site name must be lowercase letters, numbers, and hyphens only" },
      { status: 400 }
    );
  }

  try {
    // 1. Create GitHub repo from template + set Anthropic API key secret
    const repo = await createSiteRepo(name, userId);
    const repoName = repo.name; // e.g. "my-site-a1b2c3"

    // 2. Create Netlify site linked to the GitHub repo (auto-deploys on push)
    const netlifySite = await createNetlifySite(repoName);

    // 3. If user provided a description, trigger the AI to customize the site
    if (description) {
      const initialPrompt = buildInitialPrompt(name, description);
      // Fire-and-forget — don't wait for the AI to finish
      triggerAIEdit(repoName, initialPrompt).catch((err) =>
        console.error("Failed to trigger initial AI edit:", err)
      );
    }

    return NextResponse.json({
      id: repoName,
      name: name,
      url: netlifySite.url,
      github_url: repo.html_url,
      netlify_admin: netlifySite.admin_url,
    });
  } catch (error) {
    console.error("Failed to create site:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create site" },
      { status: 500 }
    );
  }
}

function buildInitialPrompt(siteName: string, description: string): string {
  return `This is a BRAND NEW site called "${siteName}". The user just created it and wants you to completely redesign it based on their description below. Do NOT keep the default template — transform the entire site to match what they want.

USER'S DESCRIPTION:
${description}

INSTRUCTIONS:
1. Read CLAUDE.md first for the rules.
2. Completely rewrite index.html to match the user's description.
3. Replace ALL placeholder content with real content based on their description.
4. If they mentioned specific text, bios, company info, or data — use it word for word.
5. If they linked to a site for inspiration — match that style as closely as possible.
6. Pick a color scheme that fits their brand/description. Update the Tailwind config.
7. Make sure the site title, meta tags, and Open Graph tags match the new content.
8. The site must be fully complete — no placeholders, no TODOs, no "coming soon".
9. Keep it static HTML + Tailwind CSS. No frameworks.
10. Make it look professional and polished. This is their first impression.`;
}
