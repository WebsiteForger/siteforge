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
      // Use Opus for initial creation (big task), Sonnet for edits
      triggerAIEdit(repoName, initialPrompt, "claude-opus-4-6").catch((err) =>
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
  return `TASK: Build a complete website called "${siteName}" from scratch.

USER'S DESCRIPTION / REFERENCE:
${description}

YOU MUST DO THE FOLLOWING:

1. Read CLAUDE.md for tech stack and UI rules — follow ALL of them strictly.

2. CHECK the reference/ directory — the workflow has already scraped/downloaded the user's
   reference site(s) including all HTML pages, images, CSS, and assets. READ EVERY FILE.

3. If the user linked to an existing site to recreate:
   - Read ALL HTML files in reference/ — not just the main page
   - Extract EVERY piece of real content: all text, headings, addresses, phone numbers,
     email addresses, business hours, team bios, service descriptions, prices, listings
   - If there are apartment/property/product listings — include ALL of them with ALL details
   - Reproduce ALL navigation: if the original has 5 pages worth of content, create sections
     for all 5 (you can use a single-page layout with sections, or multiple HTML files)
   - Keep external links pointing to their original destinations
   - For images: copy from reference/ to an images/ folder if downloaded, otherwise hotlink
     the original URLs
   - Match the functionality: if the original has a contact form, make one. If it has a
     map embed, include it. If it has downloadable PDFs, link to the originals.

4. If the user just gave a description (no reference site):
   - Generate complete, realistic content — no lorem ipsum, no placeholders
   - Use real-sounding data that matches their description
   - Fill every section with substantial content

5. Design requirements:
   - Modern, professional design — this is their first impression
   - Fully responsive (mobile-first with Tailwind breakpoints)
   - Pick a color scheme that fits the brand/industry
   - Use appropriate Google Fonts
   - Smooth interactions (hover effects, transitions)
   - Proper meta tags, Open Graph tags, favicon

6. ABSOLUTE RULES:
   - The navbar MUST be flush to the top of the viewport. No gap above it. Use top-0.
   - Dropdown menus MUST be hoverable — nest the dropdown inside the trigger element's
     parent so the hover state stays active when moving to dropdown items. Use Tailwind
     group/group-hover. NO gap between the trigger and the dropdown content.
   - NEVER create a page that is not 100% complete. No "under construction", no stubs,
     no "coming soon". If you cannot fully build a page, don't create it and don't link to it.
   - Every page that exists in navigation MUST be fully functional with real content.

7. The site must be COMPLETE and USABLE — not a mockup. A real person should be able to
   visit this site and get all the information they need, just like the original.

8. After making all changes, commit with a descriptive git message.
   Do NOT commit the reference/ directory.`;
}
