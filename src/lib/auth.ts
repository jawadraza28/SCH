"use strict";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "@/Models";
import { connectToDatabase } from "@/lib/mongodb";

// Rate limiting store (in production, use Redis)
const loginAttempts = new Map();
type Role = "admin" | "teacher" | "student";

export const DEFAULT_STUDENT_PASSWORD = "12345678";
export const DEFAULT_TEACHER_PASSWORD = "12341234";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
};

export const authenticate = async (identifier: string, password: string, role: Role) => {
  await connectToDatabase();

  // Rate limiting check
  const now = Date.now();
  const attempts = loginAttempts.get(identifier) || [];
  const recentAttempts = attempts.filter(
    (timestamp: number) => now - timestamp < 15 * 60 * 1000
  );

  if (recentAttempts.length >= 5) {
    return {
      success: false,
      error: "Too many login attempts. Please try again in 15 minutes.",
    };
  }

  // Find user by role-specific identifier
  let user;

  switch (role) {
    case "admin":
      user = await User.findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { cnic: identifier },
        ],
        role: "admin",
        isActive: true,
      });
      break;

    case "teacher":
      user = await User.findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { cnic: identifier },
        ],
        role: "teacher",
        isActive: true,
      });
      break;

    case "student":
      user = await User.findOne({
        cnic: identifier,
        role: "student",
        isActive: true,
      });
      break;

    default:
      return { success: false, error: "Invalid role" };
  }

  if (!user) {
    // Increment login attempts
    loginAttempts.set(identifier, [...recentAttempts, now]);
    return {
      success: false,
      error: "Invalid credentials. Please check your CNIC/email and password.",
    };
  }

  // Check if account is locked
  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    return {
      success: false,
      error: "Account locked due to too many failed attempts. Please try again later.",
    };
  }

  // Verify password
  let isPasswordValid = await bcrypt.compare(password, user.password);
  const roleDefaultPassword = role === "student" ? DEFAULT_STUDENT_PASSWORD : role === "teacher" ? DEFAULT_TEACHER_PASSWORD : "";
  if (!isPasswordValid && roleDefaultPassword && password === roleDefaultPassword) {
    user.password = await bcrypt.hash(roleDefaultPassword, 12);
    user.firstLoginCompleted = true;
    isPasswordValid = true;
  }

  if (!isPasswordValid) {
    // Increment login attempts
    loginAttempts.set(identifier, [...recentAttempts, now]);
    return {
      success: false,
      error: "Invalid credentials. Please check your CNIC/email and password.",
    };
  }

  // Successful login - clear attempts
  loginAttempts.delete(identifier);

  // Generate JWT token
  const token = jwt.sign(
    {
      id: user._id,
      role: user.role,
      school: user.school,
      name: user.name,
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  return {
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      role: user.role,
      email: user.email,
      cnic: user.cnic,
      school: user.school,
      firstLoginCompleted: user.firstLoginCompleted,
    },
  };
};

export const verifyToken = async (token: string) => {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (!decoded.id) return { valid: false, error: "Invalid token payload" };

    await connectToDatabase();

    const user = await User.findById(decoded.id).select(
      "-password -passwordResetToken -passwordResetExpires"
    );

    if (!user || !user.isActive) {
      return { valid: false, error: "User not found or inactive" };
    }

    return {
      valid: true,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        email: user.email,
        cnic: user.cnic,
        school: user.school,
        firstLoginCompleted: user.firstLoginCompleted,
      },
    };
  } catch {
    return { valid: false, error: "Invalid or expired token" };
  }
};

export const refreshToken = async (token: string) => {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (!decoded.id) return { success: false, error: "Invalid token payload" };

    await connectToDatabase();

    const user = await User.findById(decoded.id).select(
      "-password -passwordResetToken -passwordResetExpires"
    );

    if (!user || !user.isActive) {
      return { success: false, error: "User not found or inactive" };
    }

    const newToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        school: user.school,
        name: user.name,
      },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    return { success: true, token: newToken };
  } catch {
    return { success: false, error: "Invalid or expired token" };
  }
};

export const logout = async () => {
  // Clear the cookie
  const response = NextResponse.json({ success: true });
  (await cookies()).delete("token");
  return response;
};

export const getCurrentUser = async () => {
  await connectToDatabase();

  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return { user: null, authenticated: false };
  }

  const result = await verifyToken(token);

  return {
    user: result.user,
    authenticated: result.valid,
  };
};

// Middleware for route protection
export const withAuth = (handler: (request: Request) => Promise<Response> | Response) => {
  return async (request: Request) => {
    await connectToDatabase();

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized - no token provided" },
        { status: 401 }
      );
    }

    const result = await verifyToken(token);

    if (!result.valid) {
      (await cookies()).delete("token");
      return NextResponse.json(
        { error: "Unauthorized - invalid token" },
        { status: 401 }
      );
    }

    // Attach user to request for handler
    const newRequest = new Request(request.url, request);
    // @ts-expect-error - augmenting the request with the authenticated user
    newRequest.authenticatedUser = result.user;

    return handler(newRequest);
  };
};

// Middleware for role-based authorization
export const withRole = (...allowedRoles: string[]) => {
  return async (request: Request) => {
    await connectToDatabase();

    // @ts-expect-error - reading the user attached by the withAuth middleware
    const user = request.authenticatedUser;

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized - no user" },
        { status: 401 }
      );
    }

    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { error: "Forbidden - insufficient permissions" },
        { status: 403 }
      );
    }

    return NextResponse.next();
  };
};

// Password hashing helper
export const hashPassword = async (password: string) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// CNIC normalization helper
export const normalizeCNIC = (cnic: string) => {
  // Remove any dashes or spaces
  const normalized = cnic.replace(/[- ]/g, "");

  // Format as 42101-1234567-1
  if (normalized.length === 13 && /^\d{13}$/.test(normalized)) {
    return `${normalized.substring(0, 5)}-${normalized.substring(5, 12)}-${normalized.substring(12)}`;
  }

  return cnic;
};