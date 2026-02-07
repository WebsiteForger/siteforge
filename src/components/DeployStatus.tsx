"use client";

export function DeployStatus({ status }: { status: "idle" | "building" | "ready" }) {
  if (status === "idle") return null;

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full font-medium ${
        status === "building"
          ? "bg-yellow-500/20 text-yellow-400"
          : "bg-green-500/20 text-green-400"
      }`}
    >
      {status === "building" ? "Building..." : "Deployed!"}
    </span>
  );
}
