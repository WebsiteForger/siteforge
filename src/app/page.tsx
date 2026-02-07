import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-white">
      <h1 className="text-5xl font-bold mb-4">SiteForge</h1>
      <p className="text-xl text-neutral-400 mb-8 max-w-md text-center">
        Edit your websites with AI. Just describe what you want changed.
      </p>
      <SignedOut>
        <div className="flex gap-4">
          <Link
            href="/sign-in"
            className="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="px-6 py-3 border border-neutral-700 rounded-lg font-medium hover:border-neutral-500 transition"
          >
            Sign Up
          </Link>
        </div>
      </SignedOut>
      <SignedIn>
        <Link
          href="/dashboard"
          className="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition"
        >
          Go to Dashboard
        </Link>
      </SignedIn>
    </main>
  );
}
