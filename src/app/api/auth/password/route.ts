import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { User } from "@/Models";

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session.authenticated || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { currentPassword, newPassword } = await request.json();
    if (!newPassword || String(newPassword).length < 8) return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    await connectToDatabase();
    const user = await User.findById(session.user.id);
    if (!user || !(await bcrypt.compare(String(currentPassword ?? ""), user.password))) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    user.password = await hashPassword(String(newPassword)); user.passwordChangedAt = new Date(); user.firstLoginCompleted = true; await user.save();
    (await cookies()).set("token", "", { httpOnly: true, expires: new Date(0), path: "/" });
    return NextResponse.json({ success: true, message: "Password changed. Please sign in again." });
  } catch (error) { console.error("Password change error:", error); return NextResponse.json({ error: "Unable to change password" }, { status: 500 }); }
}
