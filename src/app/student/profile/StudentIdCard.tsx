type StudentIdCardProps = {
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
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

export default function StudentIdCard({ schoolName, schoolAddress, schoolPhone, student }: StudentIdCardProps) {
  return (
    <section className="student-id-card" aria-label="Printable student identification card">
      <div className="student-id-card-topline">
        <div className="student-id-mark">{schoolName.charAt(0).toUpperCase()}</div>
        <div>
          <p className="student-id-school">{schoolName}</p>
          <p className="student-id-subtitle">Student identification card</p>
        </div>
        <span className="student-id-year">2026</span>
      </div>
      <div className="student-id-card-body">
        <div className="student-id-photo">
          {student.profilePhotoUrl ? <img src={`/api/students/${String(student._id)}/photo`} alt="Student" /> : <span>{student.fullName.charAt(0).toUpperCase()}</span>}
        </div>
        <div className="student-id-details">
          <h1>{student.fullName}</h1>
          <div className="student-id-grid">
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
