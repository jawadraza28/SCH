import { NextResponse } from "next/server";
import { authenticate, normalizeCNIC } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

export const POST = async (request: Request) => {
  try {
    await connectToDatabase();

    const body = await request.json();
    const { identifier, password, role } = body;

    if (!identifier || !password || !role) {
      return NextResponse.json(
        { error: "Identifier, password, and role are required" },
        { status: 400 }
      );
    }

    // Validate role
    if (role !== "admin" && role !== "teacher" && role !== "student") {
      return NextResponse.json(
        { error: "Invalid role specified" },
        { status: 400 }
      );
    }

    const normalizedIdentifier = identifier.includes("@")
      ? identifier.trim().toLowerCase()
      : normalizeCNIC(identifier);
    const result = await authenticate(normalizedIdentifier, password, role);

    if (result.success) {
      const response = NextResponse.json({
        success: true,
        user: result.user,
      });

      // Set authentication cookie
      response.cookies.set("token", result.token!, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
      });

      return response;
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error("Login error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isDatabaseUnavailable = error instanceof Error && (error.name === "MongooseServerSelectionError" || error.name === "MongooseError" || error.name === "MongoServerSelectionError" || errorMessage.includes("querySrv") || errorMessage.includes("buffering timed out") || errorMessage.includes("Could not connect to any servers"));
    return NextResponse.json(
      {
        error: isDatabaseUnavailable ? "Database is unavailable. Check MongoDB Atlas Network Access and try again." : "Something went wrong. Please try again.",
        detail: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: isDatabaseUnavailable ? 503 : 500 }
    );
  }
};