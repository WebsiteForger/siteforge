# SiteForge - AI-Powered Website Editor Platform

> "Like Lovable, but simpler and cheaper. Users edit their sites with AI or CMS. You host nothing."

---

## Project Overview

SiteForge is a white-label SaaS platform where users can:
1. **Log in** to a dashboard
2. **View** their websites (live preview via iframe)
3. **Edit content** directly via a git-based CMS (text, images, etc.)
4. **Chat with AI** to make design/code changes ("make the header blue", "add a contact form")
5. **See changes deploy in real-time** via Netlify auto-deploy

### Core Principle: Host Nothing
- No servers, no Docker, no GPU, no compute from your PC
- You `git push` once, then your PC can be off forever
- Everything runs on Netlify + GitHub free tiers

---

## Architecture

```
User prompt → Netlify Function → GitHub workflow_dispatch → Claude Code Action → git commit → Netlify auto-deploy → iframe refresh
```

**We write zero AI code. Claude Code Action IS the agent. We just pass it a string.**

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js (App Router) + Tailwind | SSR, API routes, great DX |
| **Auth** | Clerk | Easiest auth, free 10k users, drop-in components |
| **Database** | Netlify DB (Postgres via Neon) | One-click, built into Netlify |
| **CMS** | Decap CMS (v0.2) | Open source, git-based, embeddable |
| **AI Agent** | Claude Code GitHub Action | Runs on GitHub's servers, not ours |
| **Git** | GitHub API (Octokit) | Repo creation, workflow triggers |
| **Hosting** | Netlify | Auto-deploy, preview URLs, functions, DB |

### API Keys: JUST TWO
- `GITHUB_PAT` — trigger workflow_dispatch
- `ANTHROPIC_API_KEY` — stored as GitHub secret, used by Claude Code Action

---

## AI Model (configured in workflow YAML, not our code)

| Model | Input/1M | Output/1M | Notes |
|-------|----------|-----------|-------|
| **Haiku 4.5** | $0.80 | $4.00 | Cheapest option |
| **Sonnet 4.5** | $3.00 | $15.00 | Safe default |
| **Sonnet 5** | TBD | TBD | Coming soon — reassess |

Switching models = one line change in `.github/workflows/ai-edit.yml`

---

## Business Math
- Charge: **$9/user/month**
- AI cost: ~$2-4/user/month
- Infrastructure at 0 users: **$0/month**
- **Margin: ~60-70%**
