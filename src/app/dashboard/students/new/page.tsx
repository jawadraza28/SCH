import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Administrators cannot add students. Teachers submit student requests and an
 * administrator approves them, so this route sends the administrator to the
 * approval queue instead of offering a create form.
 */
export default function AdminNewStudentPage() {
  redirect("/dashboard/students/requests");
}
