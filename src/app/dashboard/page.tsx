"use client";

import { useState, useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

interface Site {
  id: string;
  name: string;
  url: string;
  github_url: string;
}

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [siteDescription, setSiteDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSites();
  }, []);

  async function fetchSites() {
    try {
      const res = await fetch("/api/sites");
      if (res.ok) {
        const data = await res.json();
        setSites(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSite(e: React.FormEvent) {
    e.preventDefault();
    if (!newSiteName.trim() || creating) return;

    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSiteName.trim().toLowerCase(),
          description: siteDescription.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSites((prev) => [data, ...prev]);
        setNewSiteName("");
        setSiteDescription("");
        setShowCreate(false);
      } else {
        setError(data.error || "Failed to create site");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">SiteForge</h1>
        <UserButton />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold">Your Sites</h2>
          <button
            onClick={() => { setShowCreate(true); setError(""); }}
            className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition"
          >
            + New Site
          </button>
        </div>

        {/* Create Site Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <form
              onSubmit={handleCreateSite}
              className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-semibold mb-1">Create New Site</h3>
              <p className="text-sm text-neutral-500 mb-5">
                Describe what you want and AI will build it for you.
              </p>

              {/* Site Name */}
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                Site name
              </label>
              <input
                type="text"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                placeholder="my-awesome-site"
                className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400 mb-4"
                autoFocus
              />

              {/* Description / Initial Prompt */}
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                What should your site be about?
              </label>
              <textarea
                value={siteDescription}
                onChange={(e) => setSiteDescription(e.target.value)}
                placeholder={"e.g. A portfolio site for a freelance photographer named Sarah. Dark theme, gallery grid with hover effects, about page, contact form. Use blues and golds as accent colors.\n\nYou can also paste links to sites you like for inspiration, or describe any content, images, or files you want included."}
                rows={6}
                className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400 mb-2 resize-none text-sm"
              />
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md">
                  Paste links for inspiration
                </span>
                <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md">
                  Describe your content
                </span>
                <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-md">
                  Include text, bios, data
                </span>
              </div>

              {error && (
                <p className="text-sm text-red-400 mb-4">{error}</p>
              )}
              {creating && (
                <div className="mb-4 p-3 bg-neutral-800 rounded-lg border border-neutral-700">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-sm text-neutral-300 font-medium">Setting up your site...</span>
                  </div>
                  <p className="text-xs text-neutral-500 ml-4">
                    Creating repo, deploying to Netlify, and sending your description to AI. Takes ~20 seconds.
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                  className="px-4 py-2 text-neutral-400 hover:text-white transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSiteName.trim() || creating}
                  className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Site"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center text-neutral-500 py-20">Loading sites...</div>
        )}

        {/* Empty State */}
        {!loading && sites.length === 0 && (
          <div className="text-center py-20">
            <p className="text-neutral-500 text-lg mb-2">No sites yet</p>
            <p className="text-neutral-600 text-sm mb-6">
              Create a site and describe what you want — AI builds it for you.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition"
            >
              Create Your First Site
            </button>
          </div>
        )}

        {/* Sites Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((site) => (
            <Link
              key={site.id}
              href={`/dashboard/${site.id}`}
              className="border border-neutral-800 rounded-xl p-4 hover:border-neutral-600 transition group"
            >
              <div className="aspect-video bg-neutral-900 rounded-lg mb-3 overflow-hidden">
                <iframe
                  src={site.url}
                  className="w-full h-full pointer-events-none scale-50 origin-top-left"
                  style={{ width: "200%", height: "200%" }}
                  title={site.name}
                />
              </div>
              <h3 className="font-medium group-hover:text-neutral-300 transition">
                {site.name}
              </h3>
              <p className="text-sm text-neutral-500">{site.url}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
