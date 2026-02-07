import { Octokit } from "octokit";
import * as fs from "fs";
import * as path from "path";

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
const GITHUB_ORG = process.env.GITHUB_ORG!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

// The template directory that gets cloned for every new user site
const TEMPLATE_DIR = path.join(process.cwd(), "templates", "starter");

export async function triggerAIEdit(repo: string, prompt: string) {
  await octokit.rest.actions.createWorkflowDispatch({
    owner: GITHUB_ORG,
    repo,
    workflow_id: "ai-edit.yml",
    ref: "main",
    inputs: { prompt },
  });
}

export async function createSiteRepo(siteName: string) {
  // 1. Create the repo
  const repo = await octokit.rest.repos.createInOrg({
    org: GITHUB_ORG,
    name: siteName,
    auto_init: false,
    private: false,
    description: "Created by SiteForge",
  });

  // 2. Push template files to the repo
  const files = getTemplateFiles(TEMPLATE_DIR);
  const tree = await Promise.all(
    files.map(async (file) => {
      const content = fs.readFileSync(file.absolutePath, "utf-8");
      const blob = await octokit.rest.git.createBlob({
        owner: GITHUB_ORG,
        repo: siteName,
        content: Buffer.from(content).toString("base64"),
        encoding: "base64",
      });
      return {
        path: file.relativePath,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.data.sha,
      };
    })
  );

  const treeResult = await octokit.rest.git.createTree({
    owner: GITHUB_ORG,
    repo: siteName,
    tree,
  });

  const commit = await octokit.rest.git.createCommit({
    owner: GITHUB_ORG,
    repo: siteName,
    message: "Initial site from SiteForge template",
    tree: treeResult.data.sha,
    parents: [],
  });

  await octokit.rest.git.createRef({
    owner: GITHUB_ORG,
    repo: siteName,
    ref: "refs/heads/main",
    sha: commit.data.sha,
  });

  // 3. Set the ANTHROPIC_API_KEY as a repo secret for Claude Code Action
  await setRepoSecret(siteName, "ANTHROPIC_API_KEY", ANTHROPIC_API_KEY);

  return repo.data;
}

export async function listOrgRepos() {
  const repos = await octokit.rest.repos.listForOrg({
    org: GITHUB_ORG,
    type: "all",
    sort: "updated",
  });
  return repos.data;
}

export async function getRepoInfo(repoName: string) {
  const repo = await octokit.rest.repos.get({
    owner: GITHUB_ORG,
    repo: repoName,
  });
  return repo.data;
}

// --- Helpers ---

function getTemplateFiles(
  dir: string,
  base?: string
): { absolutePath: string; relativePath: string }[] {
  const baseDir = base || dir;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: { absolutePath: string; relativePath: string }[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getTemplateFiles(fullPath, baseDir));
    } else {
      files.push({
        absolutePath: fullPath,
        relativePath: path.relative(baseDir, fullPath).replace(/\\/g, "/"),
      });
    }
  }
  return files;
}

async function setRepoSecret(repo: string, secretName: string, secretValue: string) {
  // Get the repo's public key for encrypting secrets
  const { data: publicKey } = await octokit.rest.actions.getRepoPublicKey({
    owner: GITHUB_ORG,
    repo,
  });

  // Encrypt the secret using libsodium (we use tweetsodium which is lighter)
  // For now, we'll use the GitHub API directly with sodium
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
