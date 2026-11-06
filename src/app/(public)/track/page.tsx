import { TrackClient } from "./client";
export const metadata = { title: "Track your application" };
export default function Track() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Track your application</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Enter the tracking code you received when you applied, and the email you used.</p>
      <TrackClient />
    </div>
  );
}
