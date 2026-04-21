import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  UserCircle,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Role = "admin" | "coordinator" | "photographer" | "editor";

interface StaffMember {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
}

const ROLE_OPTIONS: Role[] = ["admin", "coordinator", "photographer", "editor"];

const ROLE_BADGE: Record<Role, string> = {
  admin:        "bg-teal-500/10 text-teal-600",
  coordinator:  "bg-blue-500/10 text-blue-600",
  photographer: "bg-purple-500/10 text-purple-600",
  editor:       "bg-orange-500/10 text-orange-600",
};

const ROLE_LABEL: Record<Role, string> = {
  admin:        "Owner",
  coordinator:  "Coordinator",
  photographer: "Photographer",
  editor:       "Editor",
};

const BLANK: Omit<StaffMember, "uid"> = {
  email: "",
  firstName: "",
  lastName: "",
  role: "photographer",
  isActive: true,
};

export default function AdminTeam() {
  const [staff, setStaff] = React.useState<StaffMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState<StaffMember | null>(null);
  const [form, setForm] = React.useState(BLANK);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "staff"), (snap) => {
      setStaff(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as StaffMember)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openAdd = () => { setEditing(null); setForm(BLANK); setShowForm(true); };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setForm({ email: member.email, firstName: member.firstName, lastName: member.lastName, role: member.role, isActive: member.isActive });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.email || !form.firstName) { toast.error("Email and first name are required."); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "staff", editing.uid), { ...form });
        toast.success("Team member updated.");
      } else {
        const uid = `manual_${Date.now()}`;
        await setDoc(doc(db, "staff", uid), { ...form });
        toast.success("Team member added. They'll need to sign in to activate their account.");
      }
      setShowForm(false);
    } catch {
      toast.error("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (member: StaffMember) => {
    try {
      await updateDoc(doc(db, "staff", member.uid), { isActive: !member.isActive });
      toast.success(member.isActive ? "Member deactivated." : "Member reactivated.");
    } catch {
      toast.error("Update failed.");
    }
  };

  const handleDelete = async (member: StaffMember) => {
    if (!confirm(`Remove ${member.firstName} ${member.lastName} from the team? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "staff", member.uid));
      toast.success("Team member removed.");
    } catch {
      toast.error("Delete failed.");
    }
  };

  const roleGroups = ROLE_OPTIONS.map((role) => ({
    role,
    members: staff.filter((s) => s.role === role),
  })).filter((g) => g.members.length > 0);

  return (
    <AdminLayout title="Team">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">
          {staff.length} member{staff.length !== 1 ? "s" : ""} · {staff.filter((s) => s.isActive).length} active
        </p>
        <Button onClick={openAdd} className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl">
          <Plus className="w-4 h-4 mr-2" /> Add Member
        </Button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white rounded-[2rem] border border-[#0d9488]/20 shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-black text-black uppercase tracking-widest">
              {editing ? "Edit Member" : "Add Member"}
            </h3>
            <button onClick={() => setShowForm(false)}>
              <X className="w-5 h-5 text-gray-400 hover:text-black" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {[
              { label: "First Name *", key: "firstName", type: "text" },
              { label: "Last Name", key: "lastName", type: "text" },
              { label: "Email *", key: "email", type: "email" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
                />
              </div>
            ))}

            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Role }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
              >
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving} className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl">
              <Check className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : editing ? "Save Changes" : "Add to Team"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-xl font-bold">Cancel</Button>
          </div>
        </div>
      )}

      {/* Team list */}
      {loading ? (
        <div className="bg-white rounded-[2rem] border border-gray-100 p-12 text-center">
          <div className="w-8 h-8 rounded-full bg-[#0d9488]/20 mx-auto mb-3 animate-pulse" />
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Loading...</p>
        </div>
      ) : staff.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-gray-100 p-12 text-center">
          <UserCircle className="w-10 h-10 text-gray-200 mx-auto mb-4" />
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No team members yet</p>
          <p className="text-xs text-gray-300 mt-1">Add your first team member above.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {roleGroups.map(({ role, members }) => (
            <div key={role}>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-3">
                {ROLE_LABEL[role]} · {members.length}
              </p>
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.uid}
                    className={`bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 flex items-center gap-4 ${!member.isActive ? "opacity-50" : ""}`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <UserCircle className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-0.5">
                        <p className="font-black text-sm text-black">{member.firstName} {member.lastName}</p>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${ROLE_BADGE[member.role]}`}>
                          {ROLE_LABEL[member.role]}
                        </span>
                        {!member.isActive && (
                          <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-gray-100 text-gray-400">Inactive</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-bold">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => openEdit(member)} className="p-2 rounded-lg text-gray-400 hover:text-[#0d9488] hover:bg-[#0d9488]/5 transition-colors" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeactivate(member)}
                        className={`p-2 rounded-lg transition-colors ${member.isActive ? "text-gray-400 hover:text-yellow-500 hover:bg-yellow-50" : "text-teal-500 hover:bg-teal-50"}`}
                        title={member.isActive ? "Deactivate" : "Reactivate"}
                      >
                        {member.isActive ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDelete(member)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
