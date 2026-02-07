import { Octokit } from "octokit";

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
const GITHUB_ORG = process.env.GITHUB_ORG!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

// Short random ID for unique repo names
function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function triggerAIEdit(repo: string, prompt: string, model?: string) {
  // GitHub needs time to index the workflow file after it's pushed.
  // Retry up to 3 times with increasing delays.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await octokit.rest.actions.createWorkflowDispatch({
        owner: GITHUB_ORG,
        repo,
        workflow_id: "ai-edit.yml",
        ref: "main",
        inputs: {
          prompt,
          model: model || "claude-sonnet-4-5-20250929",
        },
      });
      return; // success
    } catch (err) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 3000));
      } else {
        throw err;
      }
    }
  }
}

export async function getWorkflowStatus(repo: string) {
  try {
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner: GITHUB_ORG,
      repo,
      per_page: 1,
    });
    const run = data.workflow_runs[0];
    if (!run) return { status: "none" as const };
    return {
      status: run.status as string,
      conclusion: run.conclusion as string | null,
      started_at: run.created_at,
      html_url: run.html_url,
    };
  } catch {
    return { status: "none" as const };
  }
}

export async function createSiteRepo(siteName: string, userId: string) {
  const repoName = `${siteName}-${shortId()}`;

  // 1. Create the repo with auto_init so Git API works (private, tagged with owner)
  const repo = await octokit.rest.repos.createInOrg({
    org: GITHUB_ORG,
    name: repoName,
    auto_init: true,
    private: false,
    description: `SiteForge site [owner:${userId}] [display:${siteName}]`,
  });

  // Small delay to let GitHub finish initializing the repo
  await new Promise((r) => setTimeout(r, 2000));

  // 2. Push template files via Contents API (works with fine-grained PATs)
  const files = getTemplateFiles(siteName);
  for (const file of files) {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_ORG,
      repo: repoName,
      path: file.path,
      message: `Add ${file.path}`,
      content: Buffer.from(file.content).toString("base64"),
    });
  }

  // 3. Set the ANTHROPIC_API_KEY as a repo secret
  await setRepoSecret(repoName, "ANTHROPIC_API_KEY", ANTHROPIC_API_KEY);

  return { ...repo.data, name: repoName, displayName: siteName };
}

export async function listUserSites(userId: string) {
  const repos = await octokit.rest.repos.listForOrg({
    org: GITHUB_ORG,
    type: "all",
    sort: "updated",
  });
  return repos.data.filter(
    (repo) => repo.description?.includes(`[owner:${userId}]`)
  );
}

export async function getRepoInfo(repoName: string) {
  const repo = await octokit.rest.repos.get({
    owner: GITHUB_ORG,
    repo: repoName,
  });
  return repo.data;
}

// Extract display name from repo description
export function getDisplayName(description: string | null): string | null {
  const match = description?.match(/\[display:(.+?)\]/);
  return match ? match[1] : null;
}

// --- Template Files (embedded, no filesystem needed) ---

function getTemplateFiles(siteName: string) {
  return [
    { path: "index.html", content: INDEX_HTML.replace(/My Site/g, siteName) },
    { path: "CLAUDE.md", content: CLAUDE_MD },
    { path: "netlify.toml", content: NETLIFY_TOML },
    { path: ".github/workflows/ai-edit.yml", content: AI_EDIT_YML },
  ];
}

const NETLIFY_TOML = `[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "ALLOWALL"
`;

const AI_EDIT_YML = `name: AI Edit (Claude Code)

on:
  workflow_dispatch:
    inputs:
      prompt:
        description: "The user's edit request"
        required: true
        type: string
      model:
        description: "Claude model to use"
        required: false
        default: "claude-sonnet-4-5-20250929"
        type: string

jobs:
  ai-edit:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Scrape reference sites
        run: |
          mkdir -p reference
          # Extract URLs from the prompt
          URLS=\$(echo "\${{ github.event.inputs.prompt }}" | grep -oP 'https?://[^\\s"'"'"'<>]+' || true)
          if [ -n "\$URLS" ]; then
            for URL in \$URLS; do
              DOMAIN=\$(echo "\$URL" | sed 's|https\\?://||' | sed 's|/.*||')
              echo "Scraping \$URL (domain: \$DOMAIN)..."
              mkdir -p "reference/\$DOMAIN"
              # Mirror the site: follow links within same domain, download images, CSS, JS
              wget --mirror --convert-links --adjust-extension --page-requisites \\
                --no-parent --timeout=10 --tries=2 --wait=0.5 \\
                --directory-prefix="reference" \\
                --reject="*.zip,*.tar,*.gz,*.pdf,*.mp4,*.avi,*.mov" \\
                --no-host-directories \\
                -e robots=off \\
                "\$URL" 2>&1 | tail -5 || true
              echo "Done scraping \$DOMAIN"
              echo "Files downloaded:"
              find "reference/" -type f | head -50
            done
            # Also dump raw HTML for each page for easy reading
            for URL in \$URLS; do
              echo "---"
              echo "Fetching clean HTML: \$URL"
              curl -sL "\$URL" > "reference/main-page.html" 2>/dev/null || true
              # Try to find subpages from the main page
              SUBPAGES=\$(curl -sL "\$URL" | grep -oP 'href="(/[^"]*)"' | sed 's/href="//;s/"//' | sort -u | head -20)
              for SUB in \$SUBPAGES; do
                SAFE_NAME=\$(echo "\$SUB" | tr '/' '_')
                echo "  Fetching subpage: \$URL\$SUB"
                curl -sL "\$URL\$SUB" > "reference/page\$SAFE_NAME.html" 2>/dev/null || true
              done
            done
          fi
          echo "=== Reference files ==="
          find reference/ -type f 2>/dev/null | head -100 || echo "No reference files"

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Run Claude
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude --model "\${{ github.event.inputs.model }}" --dangerously-skip-permissions --max-turns 30 -p "
          The user wants you to edit their website. Here is their request:

          \${{ github.event.inputs.prompt }}

          IMPORTANT INSTRUCTIONS:
          1. Read CLAUDE.md first for the site editing rules.

          2. If there is a reference/ directory, it contains a SCRAPED COPY of the user's
             existing site or reference site. READ EVERY HTML FILE in reference/ carefully.
             Extract ALL real content: text, headings, descriptions, addresses, phone numbers,
             apartment listings, team members, services, prices — EVERYTHING.

          3. For images: check reference/ for downloaded images. Copy any useful images to the
             site root (or an images/ folder). If images weren't downloaded, keep the original
             URLs from the source site as img src (hotlink them).

          4. If the user linked to an existing site to recreate:
             - You MUST reproduce ALL the content and functionality, not just the homepage
             - Check EVERY subpage HTML file in reference/
             - Include all navigation links, all sections, all data
             - If the site has listings (apartments, products, etc.) — include ALL of them
             - If links go to external sites, keep those as external links
             - Recreate the COMPLETE site, not a summary of it

          5. After making all changes, commit them with a descriptive message using git.
          "

      - name: Push changes
        run: |
          git config user.name "claude[bot]"
          git config user.email "noreply@anthropic.com"
          # Don't push the reference/ scrape folder
          echo "reference/" >> .gitignore
          git add -A
          git diff --staged --quiet || git commit -m "AI edit via SiteForge"
          git push
`;

const CLAUDE_MD = `# SiteForge — AI Site Editor Instructions

You are an expert web developer building and editing a user's live website. The user is NOT
technical — they describe what they want in plain language. Your job is to FULLY implement
their request, no matter how complex.

## CRITICAL RULES

1. **ALWAYS complete the task fully.** Never leave partial work, placeholders, or TODOs.
2. **NEVER break the site.** Verify HTML is valid after changes.
3. **Use ALL real content.** If there is a reference/ directory, extract EVERY piece of
   content from it — text, images, data, listings, addresses, phone numbers, everything.
4. **No placeholder text.** Every heading, paragraph, and data point must be real.
5. **Mobile-first, always responsive.** Use Tailwind responsive prefixes.
6. **No frameworks.** Static HTML + Tailwind CSS only. No React, Vue, etc.
7. **For images:** Copy from reference/ to images/ folder if available, otherwise hotlink
   original URLs. NEVER use placeholder image services.

## Tech Stack

- **HTML5** — semantic elements, multiple files OK (index.html, about.html, etc.)
- **Tailwind CSS** — via CDN (\`<script src="https://cdn.tailwindcss.com"></script>\`)
- **Vanilla JavaScript** — for interactivity (tabs, modals, filters, maps, etc.)
- **Netlify Forms** — add \`data-netlify="true"\` to forms
- **Google Fonts** — via CDN
- **SVG icons** — inline or from CDN (heroicons, etc.)
- **Images** — store in images/ folder, optimize with proper alt text

## When recreating an existing site:
- Read ALL HTML files in reference/
- Include EVERY page's content (use sections or separate HTML files)
- Reproduce all navigation, all listings, all data
- Keep external links pointing to their original URLs
- Match the structure and information architecture
- If there are property/product listings — include ALL of them
- If there's a map — embed Google Maps iframe
- If there's a contact form — use Netlify Forms

## Quality Checklist
- [ ] ALL content from reference site is included
- [ ] Responsive on mobile and desktop
- [ ] All navigation links work
- [ ] No placeholder text or "lorem ipsum" anywhere
- [ ] Images display correctly
- [ ] The site is complete and production-ready
`;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Site</title>
  <meta name="description" content="Welcome to my website. Built with SiteForge.">
  <meta property="og:title" content="My Site">
  <meta property="og:description" content="Welcome to my website.">
  <meta property="og:type" content="website">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌐</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: { primary: '#2563eb', secondary: '#1e40af', accent: '#3b82f6' },
          fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] }
        }
      }
    }
  </script>
  <style type="text/tailwindcss">html { scroll-behavior: smooth; }</style>
</head>
<body class="bg-white text-gray-900 font-sans antialiased">

  <header class="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
    <nav class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-primary">My Site</a>
      <div class="hidden md:flex items-center gap-8 text-sm">
        <a href="#features" class="text-gray-600 hover:text-gray-900 transition">Features</a>
        <a href="#about" class="text-gray-600 hover:text-gray-900 transition">About</a>
        <a href="#contact" class="text-gray-600 hover:text-gray-900 transition">Contact</a>
        <a href="#contact" class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary transition">Get in Touch</a>
      </div>
      <button id="menu-toggle" class="md:hidden p-2 text-gray-600" aria-label="Toggle menu">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </nav>
    <div id="mobile-menu" class="hidden md:hidden border-t border-gray-100 bg-white">
      <div class="px-6 py-4 space-y-3">
        <a href="#features" class="block text-gray-600 hover:text-gray-900 transition">Features</a>
        <a href="#about" class="block text-gray-600 hover:text-gray-900 transition">About</a>
        <a href="#contact" class="block text-gray-600 hover:text-gray-900 transition">Contact</a>
      </div>
    </div>
  </header>

  <section class="max-w-5xl mx-auto px-6 py-24 md:py-32 text-center">
    <h1 class="text-4xl md:text-6xl font-bold mb-6 leading-tight tracking-tight">Welcome to <span class="text-primary">My Site</span></h1>
    <p class="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">This is your new website. Use the AI editor to customize it however you like. Just describe what you want changed!</p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="#contact" class="px-8 py-3.5 bg-primary text-white rounded-xl font-medium hover:bg-secondary transition shadow-lg shadow-primary/25">Get Started</a>
      <a href="#features" class="px-8 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:border-gray-300 hover:bg-gray-50 transition">Learn More</a>
    </div>
  </section>

  <section id="features" class="bg-gray-50 py-20 md:py-28">
    <div class="max-w-5xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-3xl md:text-4xl font-bold mb-4">Features</h2>
        <p class="text-gray-500 max-w-xl mx-auto">Everything you need, nothing you don't.</p>
      </div>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition">
          <div class="w-12 h-12 bg-blue-100 text-primary rounded-xl flex items-center justify-center mb-5">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <h3 class="text-lg font-semibold mb-2">Lightning Fast</h3>
          <p class="text-gray-500 leading-relaxed">Built with modern tech, your site loads instantly on any device.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition">
          <div class="w-12 h-12 bg-blue-100 text-primary rounded-xl flex items-center justify-center mb-5">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
          </div>
          <h3 class="text-lg font-semibold mb-2">Fully Responsive</h3>
          <p class="text-gray-500 leading-relaxed">Looks perfect on phones, tablets, and desktops. No compromises.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition">
          <div class="w-12 h-12 bg-blue-100 text-primary rounded-xl flex items-center justify-center mb-5">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          </div>
          <h3 class="text-lg font-semibold mb-2">Always Online</h3>
          <p class="text-gray-500 leading-relaxed">Hosted on a global CDN. Your site is always fast and available.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="about" class="py-20 md:py-28">
    <div class="max-w-3xl mx-auto px-6 text-center">
      <h2 class="text-3xl md:text-4xl font-bold mb-6">About</h2>
      <p class="text-lg text-gray-500 leading-relaxed mb-4">This website was built with SiteForge. You can edit anything you see here by chatting with the AI editor. Change colors, add sections, update text — whatever you need.</p>
      <p class="text-lg text-gray-500 leading-relaxed">No coding required. Just describe what you want and it happens.</p>
    </div>
  </section>

  <section id="contact" class="bg-gray-50 py-20 md:py-28">
    <div class="max-w-xl mx-auto px-6">
      <div class="text-center mb-10">
        <h2 class="text-3xl md:text-4xl font-bold mb-4">Get in Touch</h2>
        <p class="text-gray-500">Have a question? Reach out and we'll get back to you.</p>
      </div>
      <form name="contact" method="POST" data-netlify="true" class="space-y-4">
        <input type="hidden" name="form-name" value="contact">
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" id="name" name="name" required placeholder="Your name" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition">
          </div>
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" id="email" name="email" required placeholder="you@example.com" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition">
          </div>
        </div>
        <div>
          <label for="message" class="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea id="message" name="message" required rows="4" placeholder="How can we help?" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition resize-none"></textarea>
        </div>
        <button type="submit" class="w-full px-6 py-3.5 bg-primary text-white rounded-xl font-medium hover:bg-secondary transition shadow-lg shadow-primary/25">Send Message</button>
      </form>
    </div>
  </section>

  <footer class="border-t border-gray-100 py-10">
    <div class="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <a href="/" class="text-lg font-bold text-primary">My Site</a>
      <div class="flex gap-6 text-sm text-gray-400">
        <a href="#features" class="hover:text-gray-600 transition">Features</a>
        <a href="#about" class="hover:text-gray-600 transition">About</a>
        <a href="#contact" class="hover:text-gray-600 transition">Contact</a>
      </div>
      <p class="text-sm text-gray-400">Built with SiteForge</p>
    </div>
  </footer>

  <script>
    const toggle = document.getElementById('menu-toggle');
    const menu = document.getElementById('mobile-menu');
    toggle.addEventListener('click', () => menu.classList.toggle('hidden'));
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => menu.classList.add('hidden')));
  </script>

</body>
</html>`;

// --- Secret Encryption ---

async function setRepoSecret(repo: string, secretName: string, secretValue: string) {
  const { data: publicKey } = await octokit.rest.actions.getRepoPublicKey({
    owner: GITHUB_ORG,
    repo,
  });

  const sodium = await import("tweetsodium");
  const messageBytes = Buffer.from(secretValue);
  const keyBytes = Buffer.from(publicKey.key, "base64");
  const encryptedBytes = sodium.seal(messageBytes, keyBytes);
  const encrypted = Buffer.from(encryptedBytes).toString("base64");

  await octokit.rest.actions.createOrUpdateRepoSecret({
    owner: GITHUB_ORG,
    repo,
    secret_name: secretName,
    encrypted_value: encrypted,
    key_id: publicKey.key_id,
  });
}
