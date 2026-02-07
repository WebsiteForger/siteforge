const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN!;
const NETLIFY_ACCOUNT = process.env.NETLIFY_ACCOUNT_SLUG!;
const GITHUB_INSTALLATION_ID = process.env.NETLIFY_GITHUB_INSTALLATION_ID!;
const GITHUB_ORG = process.env.GITHUB_ORG!;

const API = "https://api.netlify.com/api/v1";

async function netlifyFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NETLIFY_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Netlify API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function createNetlifySite(repoName: string) {
  // Create a deploy key first (required for GitHub linking)
  const deployKey = await netlifyFetch("/deploy_keys", { method: "POST" });

  // Create site linked to the GitHub repo
  const site = await netlifyFetch(`/${NETLIFY_ACCOUNT}/sites`, {
    method: "POST",
    body: JSON.stringify({
      name: repoName, // becomes repoName.netlify.app
      repo: {
        provider: "github",
        repo: `${GITHUB_ORG}/${repoName}`,
        branch: "main",
        cmd: "", // no build command — static HTML
        dir: ".", // publish root directory
        installation_id: GITHUB_INSTALLATION_ID,
        deploy_key_id: deployKey.id,
      },
    }),
  });

  return {
    id: site.id,
    name: site.name,
    url: site.ssl_url || `https://${site.name}.netlify.app`,
    admin_url: site.admin_url,
  };
}

export async function getNetlifySite(siteName: string) {
  try {
    const site = await netlifyFetch(`/sites/${siteName}.netlify.app`);
    return {
      id: site.id,
      name: site.name,
      url: site.ssl_url || `https://${site.name}.netlify.app`,
      deploy_state: site.published_deploy?.state,
    };
  } catch {
    return null;
  }
}

export async function listNetlifySites() {
  const sites = await netlifyFetch(`/${NETLIFY_ACCOUNT}/sites`);
  return sites.map((site: Record<string, unknown>) => ({
    id: site.id,
    name: site.name,
    url: (site.ssl_url as string) || `https://${site.name}.netlify.app`,
  }));
}
