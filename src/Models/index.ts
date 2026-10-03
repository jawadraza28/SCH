"use strict";

import mongoose from "mongoose";

const { Schema } = mongoose;

// ==========================================
// School Configuration Schema
// ==========================================
const schoolConfigurationSchema = new Schema({
  schoolName: {
    type: String,
    required: true,
    trim: true,
  },
  schoolAddress: {
    type: String,
    trim: true,
  },
  schoolPhone: {
    type: String,
    trim: true,
  },
  schoolEmail: {
    type: String,
    trim: true,
    lowercase: true,
  },
  schoolDescription: {
    type: String,
    trim: true,
  },
  schoolTheme: {
    type: String,
    default: "modern-blue",
  },
  schoolPrimaryColor: {
    type: String,
    default: "#3b82f6",
  },
  schoolSecondaryColor: {
    type: String,
    default: "#1e293b",
  },
  academicYear: {
    type: String,
    required: true,
    enum: ["2023-2024", "2024-2025", "2025-2026", "2026-2027"],
    default: "2026-2027",
  },
  monthlyFee: {
    type: Number,
    required: true,
    min: 0,
  },
  schoolTimezone: {
    type: String,
    default: "Asia/Karachi",
  },
  favicon: {
    type: String,
    default: "/favicon.ico",
  },
  logo: {
    type: String,
    default: "",
  },
  coverImage: {
    type: String,
    default: "",
  },
  schoolIcon: {
    type: String,
    default: "",
  },
  subscriptionPlan: {
    type: String,
    default: "standard",
  },
}, { timestamps: true });

export const SchoolConfiguration = mongoose.models.SchoolConfiguration || mongoose.model("SchoolConfiguration", schoolConfigurationSchema);

// ==========================================
// User Schema (for Auth)
// ==========================================
const userSchema = new Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    unique: true,
    sparse: true,
  },
  cnic: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    validate: {
      validator: function (v: string) {
        // Pakistani CNIC format: 42101-1234567-1 or 4210112345671
        return /^\d{5}-\d{7}-\d$/.test(v) || /^\d{13}$/.test(v);
      },
      message: "Please enter a valid Pakistani CNIC format",
    },
  },
  role: {
    type: String,
    enum: ["admin", "teacher", "student"],
    required: true,
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [8, "Password must be at least 8 characters"],
  },
  passwordChangedAt: {
    type: Date,
  },
  firstLoginCompleted: {
    type: Boolean,
    default: true,
  },
  passwordResetToken: {
    type: String,
  },
  passwordResetExpires: {
    type: Date,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: {
    type: Date,
  },
  school: {
    type: Schema.Types.ObjectId,
    ref: "SchoolConfiguration",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for school + role lookup
userSchema.index({ school: 1, role: 1 });

export const User = mongoose.models.User || mongoose.model("User", userSchema);

// ==========================================
// Student Schema
// ==========================================
const studentSchema = new Schema({
  studentId: {
    type: String,
    unique: true,
    sparse: true,
  },
  fullName: {
    type: String,
    required: [true, "Student full name is required"],
    trim: true,
  },
  cnic: {
    type: String,
    trim: true,
    validate: {
      validator: function (v: string) {
        return /^\d{5}-\d{7}-\d$/.test(v) || /^\d{13}$/.test(v);
      },
      message: "Please enter a valid Pakistani CNIC format",
    },
  },
  dateOfBirth: {
    type: Date,
  },
  gender: {
    type: String,
    enum: ["male", "female", "other"],
  },
  class: {
    type: String,
    required: true,
    trim: true,
  },
  section: {
    type: String,
    required: true,
    trim: true,
  },
  rollNumber: {
    type: String,
    required: true,
  },
  fatherName: {
    type: String,
    trim: true,
  },
  fatherCNIC: {
    type: String,
    trim: true,
    validate: {
      validator: function (v: string) {
        return /^\d{5}-\d{7}-\d$/.test(v) || /^\d{13}$/.test(v);
      },
    },
  },
  fatherPhone: {
    type: String,
    trim: true,
  },
  motherName: {
    type: String,
    trim: true,
  },
  motherCNIC: {
    type: String,
    trim: true,
    validate: {
      validator: function (v: string) {
        return /^\d{5}-\d{7}-\d$/.test(v) || /^\d{13}$/.test(v);
      },
    },
  },
  motherPhone: {
    type: String,
    trim: true,
  },
  homeAddress: {
    type: String,
    trim: true,
  },
  emergencyContact: {
    type: String,
    trim: true,
  },
  admissionDate: {
    type: Date,
    default: Date.now,
  },
  accountStatus: {
    type: String,
    enum: ["pending", "active", "suspended", "rejected"],
    default: "pending",
  },
  currentClass: {
    type: String,
    trim: true,
  },
  currentSection: {
    type: String,
    trim: true,
  },
  profilePhotoUrl: {
    type: String,
    default: "",
  },
  profilePhotoPublicId: {
    type: String,
    default: "",
  },
  temporaryPassword: {
    type: String,
  },
  firstLoginCompleted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for class/section queries
studentSchema.index({ class: 1, section: 1 });
studentSchema.index({ cnic: 1 });
// A roll number is unique inside its own class and section, not school wide.
studentSchema.index({ class: 1, section: 1, rollNumber: 1 }, { unique: true });

export const Student = mongoose.models.Student || mongoose.model("Student", studentSchema);

// ==========================================
// Teacher Schema
// ==========================================
const teacherSchema = new Schema({
  teacherId: {
    type: String,
    unique: true,
    sparse: true,
  },
  name: {
    type: String,
    required: [true, "Teacher name is required"],
    trim: true,
  },
  cnic: {
    type: String,
    trim: true,
    validate: {
      validator: function (v: string) {
        return /^\d{5}-\d{7}-\d$/.test(v) || /^\d{13}$/.test(v);
      },
    },
  },
  phone: {
    type: String,
    trim: true,
  },
  subject: {
    type: String,
    trim: true,
  },
  gender: {
    type: String,
    enum: ["male", "female", "other"],
  },
  profilePhotoUrl: {
    type: String,
    default: "",
  },
  profilePhotoPublicId: {
    type: String,
    default: "",
  },
  assignedClasses: [{
    type: String,
    trim: true,
  }],
  assignedSections: [{
    type: String,
    trim: true,
  }],
  accountStatus: {
    type: String,
    enum: ["active", "inactive", "pending"],
    default: "active",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for teacher assignment lookup
teacherSchema.index({ cnic: 1 });
teacherSchema.index({ assignedClasses: 1 });
teacherSchema.index({ assignedSections: 1 });

export const Teacher = mongoose.models.Teacher || mongoose.model("Teacher", teacherSchema);

const teacherAttendanceSchema = new Schema({
  teacher: {
    type: Schema.Types.ObjectId,
    ref: "Teacher",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["present", "absent", "late", "leave", "unmarked"],
    required: true,
  },
  markedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  markedAt: {
    type: Date,
    default: Date.now,
  },
});

teacherAttendanceSchema.index({ teacher: 1, date: 1 }, { unique: true });
teacherAttendanceSchema.index({ date: 1, status: 1 });

export const TeacherAttendance = mongoose.models.TeacherAttendance || mongoose.model("TeacherAttendance", teacherAttendanceSchema);

// ==========================================
// Class/Section Schema
// ==========================================
const classSectionSchema = new Schema({
  className: {
    type: String,
    required: true,
    trim: true,
  },
  sectionName: {
    type: String,
    required: true,
    trim: true,
  },
  teacherId: {
    type: Schema.Types.ObjectId,
    ref: "Teacher",
  },
  capacity: {
    type: Number,
    default: 50,
  },
  currentStrength: {
    type: Number,
    default: 0,
  },
  academicYear: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

// Ensure class+section combination is unique within a school
classSectionSchema.index({ className: 1, sectionName: 1 }, { unique: true });

export const ClassSection = mongoose.models.ClassSection || mongoose.model("ClassSection", classSectionSchema);

// ==========================================
// Attendance Schema
// ==========================================
const attendanceSchema = new Schema({
  student: {
    type: Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  classSection: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["present", "absent", "late", "leave", "holiday"],
    required: true,
    default: "absent",
  },
  markedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  markedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for efficient attendance queries
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ classSection: 1, date: 1 });
attendanceSchema.index({ date: 1, status: 1 });

export const Attendance = mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);

// ==========================================
// Homework Schema
// ==========================================
const homeworkSchema = new Schema({
  title: {
    type: String,
    required: [true, "Homework title is required"],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  subject: {
    type: String,
    required: [true, "Subject is required"],
    trim: true,
  },
  classSection: {
    type: String,
    required: true,
  },
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: "Teacher",
    required: true,
  },
  assignedToClass: {
    type: String,
    required: true,
  },
  assignedToSection: {
    type: String,
    required: true,
  },
  dueDate: {
    type: Date,
    required: true,
  },
  expiryDate: {
    type: Date,
  },
  assignedAt: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

// Index for homework queries
homeworkSchema.index({ classSection: 1, dueDate: 1 });
homeworkSchema.index({ assignedBy: 1 });
homeworkSchema.index({ expiryDate: 1 });

export const Homework = mongoose.models.Homework || mongoose.model("Homework", homeworkSchema);

// ==========================================
// Exam/Term Schema
// ==========================================
const examTermSchema = new Schema({
  title: {
    type: String,
    required: [true, "Exam term title is required"],
    trim: true,
  },
  school: {
    type: Schema.Types.ObjectId,
    ref: "SchoolConfiguration",
    required: true,
  },
  academicYear: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const ExamTerm = mongoose.models.ExamTerm || mongoose.model("ExamTerm", examTermSchema);

// ==========================================
// Result Schema
// ==========================================
const resultSchema = new Schema({
  student: {
    type: Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  examTerm: {
    type: Schema.Types.ObjectId,
    ref: "ExamTerm",
    required: true,
  },
  subject: {
    type: String,
    required: [true, "Subject name is required"],
    trim: true,
  },
  totalMarks: {
    type: Number,
    required: [true, "Total marks are required"],
    min: [0, "Total marks cannot be negative"],
  },
  passingMarks: {
    type: Number,
    required: [true, "Passing marks are required"],
    min: [0, "Passing marks cannot be negative"],
  },
  obtainedMarks: {
    type: Number,
    required: [true, "Obtained marks are required"],
    min: [0, "Obtained marks cannot be negative"],
    validate: {
      validator: function (v: number) {
        return v <= this.totalMarks;
      },
      message: "Obtained marks cannot exceed total marks",
    },
  },
  percentage: {
    type: Number,
    min: 0,
    max: 100,
  },
  result: {
    type: String,
    enum: ["pass", "fail"],
    default: "pass",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Calculate percentage and result before saving
resultSchema.pre("save", function () {
  if (this.obtainedMarks && this.totalMarks && this.totalMarks > 0) {
    this.percentage = Math.round((this.obtainedMarks / this.totalMarks) * 100);
    this.result = this.obtainedMarks >= this.passingMarks ? "pass" : "fail";
  }
});

// Index for result queries
resultSchema.index({ student: 1, examTerm: 1 });
resultSchema.index({ subject: 1 });

export const Result = mongoose.models.Result || mongoose.model("Result", resultSchema);

// ==========================================
// Fee Schema
// ==========================================
const feeSchema = new Schema({
  student: {
    type: Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  month: {
    type: String,
    required: [true, "Month is required"],
    enum: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ],
  },
  year: {
    type: Number,
    required: true,
  },
  amount: {
    type: Number,
    required: [true, "Fee amount is required"],
    min: [0, "Fee amount cannot be negative"],
  },
  status: {
    type: String,
    enum: ["unpaid", "paid"],
    default: "unpaid",
  },
  paidDate: {
    type: Date,
  },
  markedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for fee queries
feeSchema.index({ student: 1, year: 1, month: 1 });

export const Fee = mongoose.models.Fee || mongoose.model("Fee", feeSchema);

// ==========================================
// Notice Schema
// ==========================================
const noticeSchema = new Schema({
  title: {
    type: String,
    required: [true, "Notice title is required"],
    trim: true,
  },
  description: {
    type: String,
    required: [true, "Notice description is required"],
    trim: true,
  },
  type: {
    type: String,
    enum: ["general", "exam", "holiday", "event", "important", "fee", "result"],
    default: "general",
  },
  published: {
    type: Boolean,
    default: false,
  },
  publishDate: {
    type: Date,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  school: {
    type: Schema.Types.ObjectId,
    ref: "SchoolConfiguration",
    required: true,
  },
}, { timestamps: true });

// Index for notice queries
noticeSchema.index({ school: 1, published: 1, publishDate: -1 });
noticeSchema.index({ type: 1 });

export const Notice = mongoose.models.Notice || mongoose.model("Notice", noticeSchema);

// ==========================================
// Audit Log Schema
// ==========================================
const auditLogSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  role: {
    type: String,
    enum: ["admin", "teacher", "student"],
  },
  action: {
    type: String,
    required: true,
  },
  targetType: {
    type: String,
    required: true,
  },
  targetId: {
    type: Schema.Types.ObjectId,
  },
  details: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Index for audit log queries
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ user: 1, timestamp: -1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

console.log("📚 Database models loaded successfully");