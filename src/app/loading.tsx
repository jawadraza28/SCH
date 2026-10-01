import { PageLoader } from "@/components/Loaders";

/**
 * App-level loading UI. Streams while a route segment waits on MongoDB; the
 * dashboard/student/teacher segments each override it with a more specific
 * label, so this covers everything else (root, login, setup, about-us).
 */
export default function Loading() {
  return <PageLoader label="Loading" />;
}
