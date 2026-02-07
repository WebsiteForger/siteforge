"use client";

export function SitePreview({ url, reloadKey }: { url: string; reloadKey: number }) {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-neutral-800 bg-white">
      <iframe
        key={reloadKey}
        src={url}
        className="w-full h-full min-h-[calc(100vh-8rem)]"
        title="Site preview"
      />
    </div>
  );
}
