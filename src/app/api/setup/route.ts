import { NextResponse } from "next/server";
import { hashPassword, normalizeCNIC } from "@/lib/auth";
import { User } from "@/Models";
import { SchoolConfiguration } from "@/Models";
import { connectToDatabase } from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { r2Configured, uploadToR2 } from "@/lib/object-storage";

export const POST = async (request: Request) => {
  try {
    if (!process.env.JWT_SECRET) {
      return NextResponse.json(
        { error: "JWT_SECRET is missing from your .env file" },
        { status: 500 }
      );
    }

    await connectToDatabase();

    const contentType = request.headers.get("content-type") ?? "";
    const body = contentType.includes("multipart/form-data") ? Object.fromEntries(await request.formData()) : await request.json();
    const {
      schoolName,
      schoolAddress,
      schoolPhone,
      schoolEmail,
      schoolDescription,
      monthlyFee,
      adminName,
      adminEmail,
      adminCNIC,
      adminPassword,
      logo,
      schoolIcon,
      coverImage,
    } = body;

    // Validate required fields
    if (
      !schoolName ||
      !adminName ||
      !adminEmail ||
      !adminCNIC ||
      !adminPassword
    ) {
      return NextResponse.json(
        { error: "All required fields must be provided" },
        { status: 400 }
      );
    }

    if (adminPassword.length < 8) {
      return NextResponse.json(
        { error: "Admin password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(adminEmail).trim().toLowerCase();
    const normalizedCNIC = normalizeCNIC(String(adminCNIC).trim());

    if (!/^\d{5}-\d{7}-\d$/.test(normalizedCNIC)) {
      return NextResponse.json(
        { error: "Admin CNIC must use the format 42101-1234567-1" },
        { status: 400 }
      );
    }

    // Setup is only for an empty installation. Existing deployments must use
    // the normal admin settings and password-reset flows.
    const existingAdmin = await User.findOne({ role: "admin" }).lean();

    if (existingAdmin) {
      return NextResponse.json(
        { error: "Admin account already exists" },
        { status: 409 }
      );
    }

    // A school may have been created by an earlier failed setup attempt.
    // Reuse it when it has no administrator so setup can be safely retried.
    let schoolConfig = await SchoolConfiguration.findOne({ schoolName: String(schoolName).trim() });
    let createdSchool = false;

    if (!schoolConfig) {
      schoolConfig = await SchoolConfiguration.create({
        schoolName: String(schoolName).trim(),
        schoolAddress,
        schoolPhone,
        schoolEmail: String(schoolEmail ?? "").trim().toLowerCase(),
        schoolDescription,
        monthlyFee: Number(monthlyFee) || 0,
        academicYear: "2026-2027",
        schoolPrimaryColor: "#3b82f6",
        schoolSecondaryColor: "#1e293b",
      });
      if ([logo, schoolIcon, coverImage].some((item) => item instanceof File)) {
        if (!r2Configured()) return NextResponse.json({ error: "Cloudflare R2 photo storage is not configured" }, { status: 500 });
        const uploads: Record<string, string> = {};
        for (const [field, file] of [["logo", logo], ["schoolIcon", schoolIcon], ["coverImage", coverImage] ] as const) {
          if (!(file instanceof File) || !file.size) continue;
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return NextResponse.json({ error: "School images must be JPG, PNG, or WebP" }, { status: 400 });
          const buffer = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: field === "coverImage" ? 1600 : 800, height: field === "coverImage" ? 700 : 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer();
          const objectName = `school/${field}-${Date.now()}.jpg`;
          await uploadToR2(objectName, buffer, "image/jpeg");
          uploads[field] = `r2://${process.env.R2_BUCKET_NAME}/${objectName}`;
        }
        Object.assign(schoolConfig, uploads);
        await schoolConfig.save();
      }
      createdSchool = true;
    }

    // Hash password
    const hashedPassword = await hashPassword(adminPassword);

    let adminUser;
    try {
      adminUser = await User.create({
        name: String(adminName).trim(),
        email: normalizedEmail,
        cnic: normalizedCNIC,
        role: "admin",
        password: hashedPassword,
        isActive: true,
        school: schoolConfig._id,
      });
    } catch (error) {
      if (createdSchool) await SchoolConfiguration.findByIdAndDelete(schoolConfig._id);
      throw error;
    }

    // Return success response (without password)
    const response = NextResponse.json({
      success: true,
      message: "Admin account created successfully",
      admin: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        cnic: adminUser.cnic,
        role: adminUser.role,
      },
      school: {
        id: schoolConfig._id,
        name: schoolConfig.schoolName,
      },
    });

    // Set authentication cookie
    response.cookies.set("token", jwt.sign(
      {
        id: adminUser._id,
        role: "admin",
        school: adminUser.school,
        name: adminUser.name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    ), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      {
        error: "Something went wrong. Please try again.",
        detail: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
};

export async function GET() {
  try {
    await connectToDatabase();
    const setupAvailable = !(await User.exists({ role: "admin" }));
    return NextResponse.json({ setupAvailable });
  } catch (error) {
    console.error("Setup availability check error:", error);
    return NextResponse.json({ error: "Unable to check setup status" }, { status: 500 });
  }
}