"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AIChatPanel } from "@/components/AIChatPanel";
import { SitePreview } from "@/components/SitePreview";

export default function SiteEditorPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [previewKey, setPreviewKey] = useState(0);
  const [aiStatus, setAiStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const prevStatusRef = useRef<string>("");

  const siteUrl = `https://${siteId}.netlify.app`;

  // Poll workflow status
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflow-status?repo=${siteId}`);
      if (!res.ok) return;
      const data = await res.json();

      const wasWorking = prevStatusRef.current === "in_progress" || prevStatusRef.current === "queued";
      const isWorking = data.status === "in_progress" || data.status === "queued";
      const isDone = data.status === "completed" && data.conclusion === "success";
      const isFailed = data.status === "completed" && data.conclusion === "failure";

      if (isWorking) {
        setAiStatus("working");
      } else if (wasWorking && isDone) {
        setAiStatus("done");
        // Wait for Netlify to rebuild then refresh preview
        setTimeout(() => {
          setPreviewKey((k) => k + 1);
          setTimeout(() => setAiStatus("idle"), 5000);
        }, 15000);
      } else if (wasWorking && isFailed) {
        setAiStatus("failed");
        setTimeout(() => setAiStatus("idle"), 8000);
      } else {
        // Don't override "done" state while we're waiting for Netlify
        if (aiStatus !== "done") setAiStatus("idle");
      }

      prevStatusRef.current = data.status;
    } catch { /* ignore */ }
  }, [siteId, aiStatus]);

  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 6000);
    return () => clearInterval(interval);
  }, [pollStatus]);

  function handleEditSubmitted() {
    setAiStatus("working");
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-neutral-400 hover:text-white transition">
            &larr; Sites
          </Link>
          <h1 className="font-semibold">{siteId}</h1>
          {aiStatus === "working" && (
            <span className="flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 font-medium">
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
              Claude is editing...
            </span>
          )}
          {aiStatus === "done" && (
            <span className="flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-green-500/20 text-green-400 font-medium">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              Changes deployed!
            </span>
          )}
          {aiStatus === "failed" && (
            <span className="flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-400 font-medium">
              AI edit failed
            </span>
          )}
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
          />
        </div>
      </div>
    </div>
  );
}
