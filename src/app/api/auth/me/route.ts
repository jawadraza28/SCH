import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const GET = async () => {
  try {
    const result = await getCurrentUser();

    if (!result.authenticated || !result.user) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: result.user.id,
        name: result.user.name,
        role: result.user.role,
        email: result.user.email,
        cnic: result.user.cnic,
        school: result.user.school,
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return NextResponse.json(
      { authenticated: false, error: "Something went wrong" },
      { status: 500 }
    );
  }
};