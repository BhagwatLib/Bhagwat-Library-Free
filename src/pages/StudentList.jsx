import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Users,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Armchair,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";
import { subscribeStudents } from "../services/studentsService";
import { subscribeBatches } from "../services/batchesService";
import { deleteStudent } from "../utils/store";
import { StudentForm } from "../components/StudentForm";
import { StudentProfile } from "../components/StudentProfile";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { EmptyState } from "../components/EmptyState";
import { Pagination } from "../components/Pagination";
import { ConfirmModal } from "../components/ConfirmModal";
import { StudentMobileCard } from "../components/StudentMobileCard";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";

// Helper: Checks if a batch name or object represents "All Batch" / "All Shift"
const isAllBatchIdentifier = (item) => {
  if (!item) return false;
  if (typeof item === "object") {
    if (item.slotKey === "all" || item.isAllBatch || item.isAllShift) return true;
    const name = String(item.name || "").toLowerCase().trim();
    return name === "all batch" || name === "all batches" || name === "all shift" || name === "all shifts" || name === "all";
  }
  const str = String(item).toLowerCase().trim();
  return str === "all batch" || str === "all batches" || str === "all shift" || str === "all shifts" || str === "all";
};

// Helper: Checks if a student is enrolled in "All Batch" / "All Shift"
const isStudentInAllBatch = (student) => {
  if (!student) return false;
  const bArr = Array.isArray(student.batch)
    ? student.batch
    : student.batch
    ? [student.batch]
    : [];

  if (bArr.some((b) => isAllBatchIdentifier(b))) return true;

  const assigned = Array.isArray(student.assignedBatches)
    ? student.assignedBatches
    : student.assignedBatches
    ? [student.assignedBatches]
    : [];

  if (assigned.some((b) => isAllBatchIdentifier(b))) return true;
  if (assigned.length >= 4) return true;

  return false;
};

// Helper: Checks if a student matches a specific batch filter
const isStudentMatchingBatch = (student, targetBatchId, targetBatchName) => {
  if (!student) return false;

  const key = String(targetBatchId || targetBatchName || "").toLowerCase().trim();

  // 1. "All Batches" / "All" matches every student in the library
  if (
    key === "all" ||
    key === "all batches" ||
    key === "all students" ||
    key === ""
  ) {
    return true;
  }

  const isAllStudent = isStudentInAllBatch(student);

  // 2. Dedicated "All Shift Students" filter button
  if (
    key === "all_shift_only" ||
    key === "all shift students" ||
    key === "all batch students" ||
    key === "all shift" ||
    key === "all batch"
  ) {
    return isAllStudent;
  }

  // 3. For an individual shift (e.g. A Shift, B Shift, C Shift, D Shift):
  // If the student has All Shift membership, they automatically have access to all shifts!
  if (isAllStudent) {
    return true;
  }

  // Check student's assigned individual batches
  const bArr = Array.isArray(student.batch)
    ? student.batch
    : student.batch
    ? [student.batch]
    : [];

  const assigned = Array.isArray(student.assignedBatches)
    ? student.assignedBatches
    : student.assignedBatches
    ? [student.assignedBatches]
    : [];

  const allBatches = [...bArr, ...assigned].map((b) => String(b).toLowerCase().trim());
  const normalizedTarget = String(targetBatchName || targetBatchId).toLowerCase().trim();

  return allBatches.some((sBatch) => {
    if (!sBatch) return false;
    return (
      sBatch === normalizedTarget ||
      sBatch.includes(normalizedTarget) ||
      normalizedTarget.includes(sBatch) ||
      (normalizedTarget.startsWith("a ") && (sBatch === "a" || sBatch.startsWith("a "))) ||
      (normalizedTarget.startsWith("b ") && (sBatch === "b" || sBatch.startsWith("b "))) ||
      (normalizedTarget.startsWith("c ") && (sBatch === "c" || sBatch.startsWith("c "))) ||
      (normalizedTarget.startsWith("d ") && (sBatch === "d" || sBatch.startsWith("d ")))
    );
  });
};

export const StudentList = () => {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBatch, setFilterBatch] = useState("all");
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
    const unsubStudents = subscribeStudents((data) => {
      setStudents(data);
      setLoading(false);
    });

    const unsubBatches = subscribeBatches((bData) => {
      setBatches(bData);
    });

    return () => {
      unsubStudents();
      unsubBatches();
    };
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

  // Dynamic filter buttons: "All Batches" + ABCD Shifts from Batches module + "All Shift Students"
  const dynamicFilterButtons = useMemo(() => {
    const individualBatches = batches.filter(
      (b) => !isAllBatchIdentifier(b) && b.status !== "Inactive"
    );

    const allShiftDoc = batches.find((b) => isAllBatchIdentifier(b) && b.status !== "Inactive");
    const allShiftLabel = allShiftDoc ? `${allShiftDoc.name} Students` : "All Shift Students";

    return [
      { id: "all", name: "All Batches", label: "All Batches" },
      ...individualBatches.map((b) => ({
        id: b.id || b.name,
        name: b.name || b.time,
        label: b.name || b.time,
      })),
      { id: "all_shift_only", name: "All Shift Students", label: allShiftLabel },
    ];
  }, [batches]);

  // Compute student counts per batch
  const batchCounts = useMemo(() => {
    const counts = { all: students.length, "All Batches": students.length };

    dynamicFilterButtons.forEach((btn) => {
      if (btn.id === "all") return;
      const count = students.filter((s) => isStudentMatchingBatch(s, btn.id, btn.name)).length;
      counts[btn.id] = count;
      counts[btn.name] = count;
    });

    return counts;
  }, [students, dynamicFilterButtons]);

  // Filtered Students matching active search, batch filter, and payment status
  const filteredStudents = useMemo(() => {
    return students
      .filter((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.phone.includes(searchTerm) ||
          (s.seatNumber && String(s.seatNumber).includes(searchTerm));

        const matchesBatch = isStudentMatchingBatch(s, filterBatch, filterBatch);

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
    return <SkeletonLoader type="table" rows={6} />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            Student Directory <span className="jewel-dot cyan" />
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage registrations, shift allocations, and memberships (
            <span className="text-blue-600 dark:text-cyan-400 font-bold">{filteredStudents.length}</span> / {students.length} Total)
          </p>
        </div>

        <button
          onClick={() => {
            setEditingStudent(null);
            setIsFormOpen(true);
          }}
          className="skeuo-btn skeuo-btn-primary px-4 py-2.5 text-xs font-bold flex items-center gap-2 shadow-lg self-start md:self-auto"
        >
          <Plus size={16} /> Add New Student
        </button>
      </div>

      {/* Controls: Recessed Search & Dynamic Batch Filter Pills */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by student name, phone, or seat #..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="skeuo-input w-full pl-10 pr-4 py-2.5 text-xs font-medium placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1 shrink-0 uppercase tracking-wider">
            <Filter size={13} /> Filter:
          </span>
          {dynamicFilterButtons.map((btn) => {
            const count = batchCounts[btn.id] ?? batchCounts[btn.name] ?? (btn.id === "all" ? students.length : 0);
            const isSelected =
              filterBatch === btn.id ||
              filterBatch === btn.name ||
              (btn.id === "all" && (filterBatch === "all" || filterBatch === "All Batches"));

            return (
              <button
                key={btn.id}
                onClick={() => {
                  setFilterBatch(btn.id);
                  setCurrentPage(1);
                }}
                className={clsx(
                  "skeuo-badge px-3.5 py-1.5 text-xs font-bold cursor-pointer transition-all flex items-center gap-2 rounded-xl",
                  isSelected
                    ? "bg-blue-600 dark:bg-cyan-500/20 text-blue-700 dark:text-cyan-300 border border-blue-400/40 font-extrabold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                )}
              >
                <span>{btn.label || btn.name}</span>
                <span
                  className={clsx(
                    "px-1.5 py-0.5 rounded-md text-[10px] font-bold skeuo-dial w-5 h-5",
                    isSelected ? "text-blue-700 dark:text-cyan-300" : "text-slate-500 dark:text-slate-400"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DESKTOP SKEUOMORPHIC TABLE VIEW */}
      <div className="hidden lg:block">
        <SaaSCard className="overflow-hidden p-0" withGrip>
          <div className="overflow-x-auto custom-scrollbar p-2">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Phone</th>
                  <th className="px-5 py-3.5">Seat #</th>
                  <th className="px-5 py-3.5">Batch / Shift</th>
                  <th className="px-5 py-3.5">Admission</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                {paginatedStudents.map((student) => {
                  const status =
                    student.status ||
                    (student.paidAmount >= student.totalAmount &&
                    student.totalAmount > 0
                      ? "Paid"
                      : student.paidAmount > 0
                      ? "Partial"
                      : "Unpaid");

                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-slate-100/50 dark:hover:bg-slate-800/30 transition-colors group"
                    >
                      <td className="px-5 py-3.5">
                        <div
                          onClick={() => setViewingStudent(student)}
                          className="flex items-center gap-3 cursor-pointer"
                        >
                          <div className="skeuo-dial w-9 h-9 overflow-hidden flex-shrink-0">
                            {student.photo ? (
                              <img
                                src={student.photo}
                                alt={student.name}
                                className="w-full h-full object-cover rounded-full"
                              />
                            ) : (
                              <span className="font-extrabold text-xs text-slate-700 dark:text-slate-300">
                                {(student.name || "S").charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors">
                              {student.name}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{student.address || "No address specified"}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-medium">
                        {student.phone}
                      </td>

                      <td className="px-5 py-3.5">
                        {student.seatNumber > 0 ? (
                          <Badge variant="primary" className="text-[11px]">
                            <Armchair size={11} className="mr-1 text-blue-500" /> Seat #{student.seatNumber}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-medium max-w-[180px] truncate">
                        {Array.isArray(student.batch)
                          ? student.batch.join(", ")
                          : student.batch || "A Shift"}
                      </td>

                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                        {student.admissionDate || "-"}
                      </td>

                      <td className="px-5 py-3.5">
                        <Badge
                          dot
                          variant={
                            status === "Paid"
                              ? "success"
                              : status === "Partial"
                              ? "warning"
                              : "danger"
                          }
                        >
                          {status}
                        </Badge>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewingStudent(student)}
                            className="skeuo-dial w-7 h-7 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-cyan-400"
                            title="View Profile"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingStudent(student);
                              setIsFormOpen(true);
                            }}
                            className="skeuo-dial w-7 h-7 text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400"
                            title="Edit Student"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setStudentToDelete(student.id)}
                            className="skeuo-dial w-7 h-7 text-slate-500 dark:text-slate-400 hover:text-rose-500"
                            title="Delete Student"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={7}>
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
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={setItemsPerPage}
              totalItems={filteredStudents.length}
            />
          </div>
        </SaaSCard>
      </div>

      {/* MOBILE CARDS LIST (< 1024px) */}
      <div className="block lg:hidden space-y-3">
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
      </div>

      {/* Form Modal */}
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
