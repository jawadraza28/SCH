import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";

const COOKIE_NAME = "finance_unlocked";
const FINANCE_PASSWORD = process.env.FINANCE_ACCESS_PASSWORD || "todayschool";

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  if (typeof body?.password !== "string" || body.password !== FINANCE_PASSWORD) {
    return NextResponse.json({ error: "Incorrect finance password" }, { status: 401 });
  }
  (await cookies()).set(COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 30,
    path: "/dashboard/finance",
  });
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const session = await getCurrentUser();
  if (!session.authenticated || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }
  (await cookies()).set(COOKIE_NAME, "", { httpOnly: true, expires: new Date(0), path: "/dashboard/finance" });
  return NextResponse.json({ success: true });
}
