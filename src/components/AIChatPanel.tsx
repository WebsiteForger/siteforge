"use client";

import { useState } from "react";

interface Message {
  role: "user" | "system";
  content: string;
}

interface AIChatPanelProps {
  siteId: string;
  onEditSubmitted: () => void;
  onDeployReady: () => void;
}

export function AIChatPanel({ siteId, onEditSubmitted, onDeployReady }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "Tell me what changes you'd like to make to your site." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, prompt: userMessage }),
      });

      if (!res.ok) throw new Error("Failed to trigger edit");

      setMessages((prev) => [
        ...prev,
        { role: "system", content: "Got it! Claude is working on your changes. This may take a minute..." },
      ]);
      onEditSubmitted();

      // Poll for deploy completion (simplified — real version would check Netlify API)
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "Changes deployed! Refreshing preview." },
        ]);
        onDeployReady();
        setLoading(false);
      }, 60000); // 60 second estimate
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: "Something went wrong. Try again." },
      ]);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-neutral-800">
        <h2 className="font-semibold">AI Editor</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm px-3 py-2 rounded-lg max-w-[85%] ${
              msg.role === "user"
                ? "bg-blue-600 text-white ml-auto"
                : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="text-sm px-3 py-2 rounded-lg bg-neutral-800 text-neutral-500 max-w-[85%]">
            Claude is editing your site...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-neutral-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Make the header blue..."
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-neutral-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
