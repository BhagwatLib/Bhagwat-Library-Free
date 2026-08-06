import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Users,
  Filter,
} from "lucide-react";
import { clsx } from "clsx";
import { subscribeStudents } from "../services/studentsService";
import { deleteStudent } from "../utils/store";
import { StudentForm } from "../components/StudentForm";
import { StudentProfile } from "../components/StudentProfile";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { EmptyState } from "../components/EmptyState";
import { Pagination } from "../components/Pagination";
import { ConfirmModal } from "../components/ConfirmModal";
import { StudentMobileCard } from "../components/StudentMobileCard";

export const StudentList = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBatch, setFilterBatch] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [viewingStudent, setViewingStudent] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeStudents((data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async () => {
    if (studentToDelete) {
      setIsDeleting(true);
      try {
        await deleteStudent(studentToDelete);
      } finally {
        setIsDeleting(false);
        setStudentToDelete(null);
      }
    }
  };

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students
      .filter((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.phone.includes(searchTerm) ||
          (s.seatNumber && String(s.seatNumber).includes(searchTerm));

        const batchStr = Array.isArray(s.batch)
          ? s.batch.join(" ")
          : String(s.batch || "");

        const matchesBatch =
          filterBatch === "All" || batchStr.toLowerCase().includes(filterBatch.toLowerCase());

        const status =
          s.status ||
          (s.paidAmount >= s.totalAmount && s.totalAmount > 0
            ? "Paid"
            : s.paidAmount > 0
            ? "Partial"
            : "Unpaid");

        const matchesStatus = filterStatus === "All" || status === filterStatus;

        return matchesSearch && matchesBatch && matchesStatus;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [students, searchTerm, filterBatch, filterStatus]);

  // Paginated Students
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStudents.slice(start, start + itemsPerPage);
  }, [filteredStudents, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage) || 1;

  if (loading) {
    return <SkeletonLoader type="card" />;
  }

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="text-blue-400" size={24} /> Students Directory
          </h1>
          <p className="text-xs text-slate-400">
            {students.length} Total Enrolled Students
          </p>
        </div>

        <button
          onClick={() => {
            setEditingStudent(null);
            setIsFormOpen(true);
          }}
          className="h-12 bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/25 active:scale-95 transition-all flex-shrink-0"
        >
          <Plus size={18} /> Add Student
        </button>
      </div>

      {/* Sticky Mobile Search Bar & Filter Chips */}
      <div className="space-y-3 sticky top-[60px] z-20 bg-slate-950/90 backdrop-blur-md pt-1 pb-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search name, phone, or seat #..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full h-12 bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500 shadow-inner"
          />
        </div>

        {/* Filter Chips Horizontal Scroll */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar-hidden py-1">
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
            <Filter size={13} /> Filter:
          </span>
          {["All", "Morning", "Noon", "Afternoon", "Evening"].map((b) => (
            <button
              key={b}
              onClick={() => {
                setFilterBatch(b);
                setCurrentPage(1);
              }}
              className={clsx(
                "px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border",
                filterBatch === b
                  ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
              )}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Card List (No desktop table!) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {paginatedStudents.map((student) => (
          <StudentMobileCard
            key={student.id}
            student={student}
            onView={() => setViewingStudent(student)}
            onEdit={() => {
              setEditingStudent(student);
              setIsFormOpen(true);
            }}
            onDelete={() => setStudentToDelete(student.id)}
          />
        ))}

        {filteredStudents.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={Users}
              title="No students found"
              description="No student records match your search or filter options."
              actionLabel="Add New Student"
              onAction={() => {
                setEditingStudent(null);
                setIsFormOpen(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="pt-2">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
          totalItems={filteredStudents.length}
        />
      </div>

      {/* Form Modal / Sheet */}
      {isFormOpen && (
        <StudentForm
          student={editingStudent}
          mode="personal"
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => setIsFormOpen(false)}
        />
      )}

      {/* Profile Drawer / Sheet */}
      {viewingStudent && (
        <StudentProfile
          student={viewingStudent}
          onClose={() => setViewingStudent(null)}
          onEdit={() => {
            setEditingStudent(viewingStudent);
            setViewingStudent(null);
            setIsFormOpen(true);
          }}
          onUpdate={() => {}}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!studentToDelete}
        onClose={() => !isDeleting && setStudentToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Student Record"
        message="Are you sure you want to delete this student record? This action cannot be undone."
        confirmText="Delete Student"
        isLoading={isDeleting}
      />
    </div>
  );
};
