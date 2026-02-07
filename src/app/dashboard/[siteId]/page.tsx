"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AIChatPanel } from "@/components/AIChatPanel";
import { SitePreview } from "@/components/SitePreview";
import { DeployStatus } from "@/components/DeployStatus";

export default function SiteEditorPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [previewKey, setPreviewKey] = useState(0);
  const [deployStatus, setDeployStatus] = useState<"idle" | "building" | "ready">("idle");

  const siteUrl = `https://${siteId}.netlify.app`;

  function handleEditSubmitted() {
    setDeployStatus("building");
  }

  function handleDeployReady() {
    setDeployStatus("ready");
    setPreviewKey((k) => k + 1); // force iframe reload
    setTimeout(() => setDeployStatus("idle"), 3000);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-neutral-400 hover:text-white transition">
            &larr; Sites
          </Link>
          <h1 className="font-semibold">{siteId}</h1>
          <DeployStatus status={deployStatus} />
        </div>
        <UserButton />
      </header>

      <div className="flex-1 flex">
        {/* Live Preview */}
        <div className="flex-1 p-4">
          <SitePreview url={siteUrl} reloadKey={previewKey} />
        </div>

        {/* AI Chat Panel */}
        <div className="w-96 border-l border-neutral-800">
          <AIChatPanel
            siteId={siteId}
            onEditSubmitted={handleEditSubmitted}
            onDeployReady={handleDeployReady}
          />
        </div>
      </div>
    </div>
  );
}
