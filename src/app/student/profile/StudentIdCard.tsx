type StudentIdCardProps = {
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolIcon?: string;
  student: {
    _id: unknown;
    fullName: string;
    class: string;
    section: string;
    rollNumber: string;
    cnic?: string;
    fatherPhone?: string;
    motherPhone?: string;
    emergencyContact?: string;
    gender?: string;
    profilePhotoUrl?: string;
  };
};

export default function StudentIdCard({ schoolName, schoolAddress, schoolPhone, schoolIcon, student }: StudentIdCardProps) {
  return (
    <section className="student-id-card" aria-label="Printable student identification card">
      <div className="student-id-card-topline">
        <div className="student-id-mark">{schoolIcon ? <img src={schoolIcon} alt="" /> : <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="School"><path d="m3 10 9-5 9 5-9 5-9-5Z" /><path d="M6 12v5c3 2 9 2 12 0v-5M21 10v6" /></svg>}</div>
        <div>
          <p className="student-id-school">{schoolName}</p>
          <p className="student-id-subtitle">Student identification card</p>
        </div>
        <span className="student-id-year">Student ID</span>
      </div>
      <div className="student-id-card-body">
        <div className="student-id-photo">
          {student.profilePhotoUrl ? <img src={`/api/students/${String(student._id)}/photo?card=1`} alt="Student" /> : <span>{student.fullName.charAt(0).toUpperCase()}</span>}
        </div>
        <div className="student-id-details">
          <h1>{student.fullName}</h1>
          <div className="student-id-grid">
            <span>Student ID</span><strong>{String(student._id).slice(-8).toUpperCase()}</strong>
            <span>Phone</span><strong>{student.fatherPhone || student.motherPhone || student.emergencyContact || "-"}</strong>
            <span>Class</span><strong>{student.class}-{student.section}</strong>
            <span>Roll number</span><strong>{student.rollNumber}</strong>
            <span>CNIC</span><strong>{student.cnic || "-"}</strong>
          </div>
        </div>
      </div>
      <div className="student-id-card-footer">
        <span>{schoolAddress || schoolPhone || "Official student record"}</span>
        <span className="student-id-signature">Authorized signature</span>
      </div>
    </section>
  );
}
