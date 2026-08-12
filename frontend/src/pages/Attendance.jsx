import React, { useState, useEffect } from "react";
import { CalendarCheck, CheckCircle2, XCircle, Clock, Search, Users } from "lucide-react";
import { subscribeStudents } from "../services/studentsService";
import { subscribeAttendance, markAttendanceInFirestore } from "../services/attendanceService";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";
import { SkeletonLoader } from "../components/SkeletonLoader";

export const Attendance = () => {
  const [students, setStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    setLoading(true);
    const unsubStudents = subscribeStudents((sList) => {
      setStudents(sList);
      setLoading(false);
    });

    const unsubAttendance = subscribeAttendance((attList) => {
      setAttendanceRecords(attList);
    }, todayStr);

    return () => {
      unsubStudents();
      unsubAttendance();
    };
  }, [todayStr]);

  const handleMark = async (studentId, status) => {
    await markAttendanceInFirestore(studentId, status, todayStr);
  };

  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone.includes(searchTerm)
  );

  if (loading) {
    return <SkeletonLoader type="card" />;
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CalendarCheck className="text-emerald-400" size={26} /> Today's Attendance Log
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Daily student check-in management ({todayStr})
        </p>
      </div>

      {/* Sticky Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search student to mark attendance..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* Student Attendance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredStudents.map((s) => {
          const rec = attendanceRecords.find((a) => a.studentId === s.id);
          const status = rec ? rec.status : "Not Marked";

          return (
            <SaaSCard key={s.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                  {s.photo ? (
                    <img src={s.photo} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    <Users size={18} className="text-slate-400" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">{s.name}</h4>
                  <p className="text-xs text-slate-400">Seat #{s.seatNumber || "N/A"}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMark(s.id, "Present")}
                  className={`h-10 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all ${
                    status === "Present"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <CheckCircle2 size={15} /> Present
                </button>
                <button
                  onClick={() => handleMark(s.id, "Absent")}
                  className={`h-10 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all ${
                    status === "Absent"
                      ? "bg-rose-600 text-white shadow-md shadow-rose-600/20"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <XCircle size={15} /> Absent
                </button>
              </div>
            </SaaSCard>
          );
        })}
      </div>
    </div>
  );
};
