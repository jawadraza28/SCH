import TimetableEditor from "@/components/TimetableEditor";

export default function TeacherTimetableWorkspace({ teacherId }: { teacherId: string }) {
  return <div className="mt-6"><TimetableEditor scope="teacher" target={teacherId} readOnly /></div>;
}
