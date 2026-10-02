import Pagination from "@/components/Pagination";
import { recentAttendanceMonths } from "@/lib/attendance";

type AttendanceRecord = {
  _id: unknown;
  date: Date | string;
  classSection?: string;
  status: string;
};

type AttendanceHistoryProps = {
  records: AttendanceRecord[];
  page: number;
  pages: number;
  month: string;
  from: string;
  to: string;
  present: number;
  late: number;
  absent: number;
  leave: number;
  holidays: number;
  hrefFor: (page: number) => string;
};

export default function AttendanceHistory({
  records,
  page,
  pages,
  month,
  from,
  to,
  present,
  late,
  absent,
  leave,
  holidays,
  hrefFor,
}: AttendanceHistoryProps) {
  const counted = present + late + absent;
  const rate = counted ? Math.round(((present + late) / counted) * 100) : 0;
  const hasFilters = Boolean(month || from || to);

  return (
    <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="font-semibold">Attendance history</h2>
            <p className="mt-1 text-sm text-slate-500">Choose a month or exact days to check the recorded attendance.</p>
          </div>
          <p className="text-sm font-semibold text-blue-700">{rate}% attendance</p>
        </div>
        <form className="mt-5 grid gap-3 sm:grid-cols-4" method="get">
          <label className="text-sm font-medium text-slate-600">
            Month
            <select name="month" defaultValue={month} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900">
              <option value="">All months</option>
              {recentAttendanceMonths().map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-600">
            From day
            <input name="from" type="date" defaultValue={from} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal text-slate-900" />
          </label>
          <label className="text-sm font-medium text-slate-600">
            To day
            <input name="to" type="date" defaultValue={to} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal text-slate-900" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Apply</button>
            {hasFilters ? <a href="?" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Clear</a> : null}
          </div>
        </form>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[["Present", present, "text-emerald-600"], ["Late", late, "text-amber-600"], ["Absent", absent, "text-red-600"], ["Leave", leave, "text-violet-600"], ["Holiday", holidays, "text-slate-600"]].map(([label, value, color]) => <div key={String(label)} className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-lg font-bold ${color}`}>{value}</p></div>)}
        </div>
      </div>
      <div className="overflow-x-auto px-6 py-4 sm:px-8">
        {records.length ? <table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3">Date</th><th className="py-3">Class</th><th className="py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{records.map((record) => <tr key={String(record._id)}><td className="py-3">{new Date(record.date).toLocaleDateString()}</td><td className="py-3">{record.classSection || "-"}</td><td className="py-3 capitalize">{record.status}</td></tr>)}</tbody></table> : <p className="py-8 text-center text-sm text-slate-400">No attendance records match this period.</p>}
      </div>
      <div className="border-t border-slate-100 px-6 py-4 sm:px-8"><Pagination page={page} pages={pages} hrefFor={hrefFor} /></div>
    </section>
  );
}
