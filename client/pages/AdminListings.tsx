import * as React from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Search, Plus, ArrowRight, Calendar, User, Home, Building2,
  X, Check, Upload, Filter, ChevronDown, ChevronUp, RotateCcw,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, onSnapshot, addDoc, serverTimestamp, getDocs, query, orderBy,
} from "firebase/firestore";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type ProjectType = "real_estate" | "business";

interface Project {
  id: string;
  projectType?: ProjectType;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  address?: string;
  shootLocation?: string;
  apptDate?: any;
  apptTime?: string;
  services?: string[];
  serviceIds?: string[];
  status?: string;
  images?: { url: string; name: string }[];
  createdAt?: any;
  deliveredAt?: any;
  paidAt?: any;
  total?: number;
  photographerIds?: string[];
  photographerNames?: string[];
}

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface StaffMember {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: string;
}

interface ServiceItem {
  id: string;
  name: string;
  category?: string;
  price?: number;
  type?: string; // "real_estate" | "business" | "both"
}

// ─── Status configs ───────────────────────────────────────────────────────────
const RE_STATUSES = [
  { value: "unscheduled", label: "Unscheduled", badge: "bg-red-100 text-red-700" },
  { value: "scheduled", label: "Scheduled", badge: "bg-green-100 text-green-700" },
  { value: "in_progress", label: "In Progress", badge: "bg-blue-100 text-blue-700" },
  { value: "delivered", label: "Delivered", badge: "bg-sky-100 text-sky-700" },
  { value: "paid", label: "Paid", badge: "bg-teal-100 text-teal-700" },
  { value: "archived", label: "Archived", badge: "bg-gray-100 text-gray-400" },
];

const BIZ_STATUSES = [
  { value: "unscheduled", label: "Unscheduled", badge: "bg-red-100 text-red-700" },
  { value: "consult_scheduled", label: "Consult Scheduled", badge: "bg-orange-100 text-orange-700" },
  { value: "appt_scheduled", label: "Appt Scheduled", badge: "bg-green-100 text-green-700" },
  { value: "in_progress", label: "In Progress", badge: "bg-blue-100 text-blue-700" },
  { value: "delivered", label: "Delivered", badge: "bg-sky-100 text-sky-700" },
  { value: "paid", label: "Paid", badge: "bg-teal-100 text-teal-700" },
  { value: "archived", label: "Archived", badge: "bg-gray-100 text-gray-400" },
];

function getBadge(status: string, projectType?: string) {
  const list = projectType === "business" ? BIZ_STATUSES : RE_STATUSES;
  return list.find(s => s.value === status) ?? { label: status ?? "Unknown", badge: "bg-gray-100 text-gray-500" };
}

// ─── Blank forms ──────────────────────────────────────────────────────────────
const BLANK_RE = {
  isNewCustomer: false,
  clientSearch: "",
  clientId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  apptDate: "",
  apptTime: "",
  photographerIds: [] as string[],
  serviceIds: [] as string[],
  notes: "",
  accessInfo: "",
  status: "unscheduled",
};

const BLANK_BIZ = {
  isNewCustomer: false,
  clientSearch: "",
  clientId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  shootLocation: "",
  apptDate: "",
  apptTime: "",
  photographerIds: [] as string[],
  serviceIds: [] as string[],
  notes: "",
  status: "unscheduled",
};

const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";
const labelCls = "block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1";
// ─── Google Places hook ───────────────────────────────────────────────────────
function useGooglePlaces(inputRef: React.RefObject<HTMLInputElement>, onSelect: (address: string) => void) {
  React.useEffect(() => {
    if (!inputRef.current) return;
    if (!(window as any).google?.maps?.places) return;
    const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.formatted_address) {
        onSelect(place.formatted_address);
      }
    });
  }, [inputRef, onSelect]);
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function AdminListings() {
  const navigate = useNavigate();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState<"all" | "real_estate" | "business">("all");

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [dateField, setDateField] = React.useState<"apptDate" | "createdAt" | "deliveredAt" | "paidAt">("apptDate");
  const [clientFilter, setClientFilter] = React.useState("");
  const [photographerFilter, setPhotographerFilter] = React.useState("");
  const [serviceFilter, setServiceFilter] = React.useState("");
  const [sortBy, setSortBy] = React.useState<"createdAt" | "apptDate" | "total" | "clientName">("createdAt");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  // Modal state
  const [showModal, setShowModal] = React.useState(false);
  const [projectType, setProjectType] = React.useState<ProjectType>("real_estate");
  const [reForm, setReForm] = React.useState({ ...BLANK_RE });
  const [bizForm, setBizForm] = React.useState({ ...BLANK_BIZ });
  const [saving, setSaving] = React.useState(false);

  // Client lookup
  const [clients, setClients] = React.useState<Client[]>([]);
  const [clientSuggestions, setClientSuggestions] = React.useState<Client[]>([]);
  const [showClientDropdown, setShowClientDropdown] = React.useState(false);

  // Staff + Services
  const [photographers, setPhotographers] = React.useState<StaffMember[]>([]);
  const [services, setServices] = React.useState<ServiceItem[]>([]);

  // Address autocomplete ref
  const addressRef = React.useRef<HTMLInputElement>(null);
  const locationRef = React.useRef<HTMLInputElement>(null);

  useGooglePlaces(addressRef, (addr) => setReForm(f => ({ ...f, address: addr })));
  useGooglePlaces(locationRef, (addr) => setBizForm(f => ({ ...f, shootLocation: addr })));

  // Live projects
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "listings"), snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Project[];
      setProjects(docs);
      setLoading(false);
    }, err => {
      console.error(err);
      toast.error("Failed to load projects");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Load clients + staff + services when modal opens
  React.useEffect(() => {
    if (!showModal) return;
    getDocs(collection(db, "clients"))
      .then(snap => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Client[]))
      .catch(console.error);

    getDocs(collection(db, "staff"))
      .then(snap => {
        const all = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || d.id,
            firstName: data.firstName,
            lastName: data.lastName,
            role: data.role,
          };
        }) as StaffMember[];
        setPhotographers(all.filter(s => ["photographer", "admin", "coordinator"].includes(s.role)));
      })
      .catch(console.error);

    getDocs(collection(db, "services"))
      .then(snap => {
        const svcList = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ServiceItem[];
        setServices(svcList);
      })
      .catch(console.error);
  }, [showModal]);

  // Also load staff + services for filter dropdowns
  React.useEffect(() => {
    getDocs(collection(db, "staff"))
      .then(snap => {
        const all = snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(), role: data.role };
        }) as StaffMember[];
        setPhotographers(all.filter(s => ["photographer", "admin", "coordinator"].includes(s.role)));
      })
      .catch(console.error);

    getDocs(collection(db, "services"))
      .then(snap => setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })) as ServiceItem[]))
      .catch(console.error);
  }, []);

  const form = projectType === "real_estate" ? reForm : bizForm;

  const handleClientSearch = (val: string) => {
    if (projectType === "real_estate") {
      setReForm(f => ({ ...f, clientSearch: val, clientId: "", email: "", phone: "" }));
    } else {
      setBizForm(f => ({ ...f, clientSearch: val, clientId: "", email: "", phone: "" }));
    }

    if (val.length > 1) {
      const lower = val.toLowerCase();
      const matches = clients.filter(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(lower) ||
        c.email?.toLowerCase().includes(lower) ||
        c.phone?.includes(val)
      ).slice(0, 6);
      setClientSuggestions(matches);
      setShowClientDropdown(matches.length > 0);
    } else {
      setClientSuggestions([]);
      setShowClientDropdown(false);
    }
  };

  const selectClient = (c: Client) => {
    const patch = {
      clientId: c.id,
      clientSearch: `${c.firstName} ${c.lastName}`,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
    };
    if (projectType === "real_estate") setReForm(f => ({ ...f, ...patch }));
    else setBizForm(f => ({ ...f, ...patch }));
    setShowClientDropdown(false);
  };

  const toggleService = (svcId: string) => {
    const setter = projectType === "real_estate" ? setReForm : setBizForm;
    setter((f: any) => ({
      ...f,
      serviceIds: f.serviceIds.includes(svcId)
        ? f.serviceIds.filter((id: string) => id !== svcId)
        : [...f.serviceIds, svcId],
    }));
  };

  const closeModal = () => {
    setShowModal(false);
    setReForm({ ...BLANK_RE });
    setBizForm({ ...BLANK_BIZ });
    setShowClientDropdown(false);
  };

  const handleCreate = async () => {
    if (!form.firstName || !form.email) {
      toast.error("Client name and email are required.");
      return;
    }
    if (projectType === "real_estate" && !reForm.address) {
      toast.error("Service address is required.");
      return;
    }
    if (projectType === "business" && !bizForm.shootLocation) {
      toast.error("Shoot location is required.");
      return;
    }

    setSaving(true);
    try {
      const clientName = `${form.firstName} ${form.lastName}`.trim();
      const selectedServices = services.filter(s => form.serviceIds.includes(s.id));
      const serviceNames = selectedServices.map(s => s.name);
      const photographerNames = photographers.filter(p => form.photographerIds.includes(p.id)).map(p => p.name);

      const docData: any = {
        projectType,
        clientId: form.clientId || null,
        clientName,
        clientEmail: form.email.toLowerCase().trim(),
        clientPhone: form.phone || null,
        apptDate: form.apptDate ? new Date(form.apptDate) : null,
        apptTime: form.apptTime || null,
        serviceIds: form.serviceIds,
        services: serviceNames,
        photographerIds: form.photographerIds,
        photographerNames,
        notes: form.notes || null,
        status: form.apptDate ? "scheduled" : "unscheduled",
        images: [],
        studioEnabled: true,
        studioToken: crypto.randomUUID(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (projectType === "real_estate") {
        docData.address = reForm.address;
        docData.accessInfo = reForm.accessInfo || null;
      } else {
        docData.shootLocation = bizForm.shootLocation;
      }

      // Fetch default security settings
      try {
        const settingsSnap = await getDocs(collection(db, "settings"));
        const settingsDoc = settingsSnap.docs.find(d => d.id === "defaults");
        if (settingsDoc) {
          const defaults = settingsDoc.data();
          docData.lockDownloads = defaults.lockDownloads ?? true;
          docData.lockStudio = defaults.lockStudio ?? false;
          docData.requirePayment = defaults.requirePayment ?? true;
          docData.socialPermission = defaults.socialPermission ?? false;
        } else {
          docData.lockDownloads = true;
          docData.lockStudio = false;
          docData.requirePayment = true;
          docData.socialPermission = false;
        }
      } catch {
        docData.lockDownloads = true;
        docData.lockStudio = false;
        docData.requirePayment = true;
        docData.socialPermission = false;
      }

      const ref = await addDoc(collection(db, "listings"), docData);

      // Create client record if new customer
      if (form.isNewCustomer && !form.clientId) {
        await addDoc(collection(db, "clients"), {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email.toLowerCase().trim(),
          phone: form.phone || null,
          status: "active",
          totalOrders: 1,
          totalSpend: 0,
          portalAccess: false,
          tags: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      toast.success("Project created!");
      closeModal();
      navigate(`/admin/listing/${ref.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create project.");
    } finally {
      setSaving(false);
    }
  };

  // Reset advanced filters
  const resetFilters = () => {
    setDateFrom("");
    setDateTo("");
    setDateField("apptDate");
    setClientFilter("");
    setPhotographerFilter("");
    setServiceFilter("");
    setSortBy("createdAt");
    setSortDir("desc");
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
  };

  // ─── Filtered + sorted list ─────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    let result = projects.filter(p => {
      const loc = p.address || p.shootLocation || "";
      const matchSearch = !search.trim() ||
        loc.toLowerCase().includes(search.toLowerCase()) ||
        (p.clientName || "").toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      const matchType = typeFilter === "all" || p.projectType === typeFilter;

      // Advanced: client name filter
      const matchClient = !clientFilter.trim() ||
        (p.clientName || "").toLowerCase().includes(clientFilter.toLowerCase());

      // Advanced: photographer filter
      const matchPhotographer = !photographerFilter ||
        (p.photographerIds || []).includes(photographerFilter) ||
        (p.photographerNames || []).some((n: string) => n.toLowerCase().includes(photographerFilter.toLowerCase()));

      // Advanced: service filter
      const matchService = !serviceFilter ||
        (p.serviceIds || []).includes(serviceFilter) ||
        (p.services || []).some((s: any) => typeof s === "string" && s.toLowerCase().includes(serviceFilter.toLowerCase()));

      // Advanced: date range
      let matchDate = true;
      if (dateFrom || dateTo) {
        const getTs = (val: any) => {
          if (!val) return null;
          if (val.toDate) return val.toDate().getTime();
          if (val instanceof Date) return val.getTime();
          return new Date(val).getTime();
        };
        const fieldVal = getTs((p as any)[dateField]);
        if (fieldVal) {
          if (dateFrom) matchDate = matchDate && fieldVal >= new Date(dateFrom).getTime();
          if (dateTo) matchDate = matchDate && fieldVal <= new Date(dateTo + "T23:59:59").getTime();
        } else {
          matchDate = false;
        }
      }

      return matchSearch && matchStatus && matchType && matchClient && matchPhotographer && matchService && matchDate;
    });

    // Sort
    result.sort((a, b) => {
      const getVal = (p: any) => {
        const raw = p[sortBy];
        if (!raw) return 0;
        if (raw.toDate) return raw.toDate().getTime();
        if (raw instanceof Date) return raw.getTime();
        if (typeof raw === "string") return raw.toLowerCase();
        return raw;
      };
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [projects, search, statusFilter, typeFilter, dateFrom, dateTo, dateField, clientFilter, photographerFilter, serviceFilter, sortBy, sortDir]);

  // ─── Stats summary ─────────────────────────────────────────────────────────
  const stats = React.useMemo(() => {
    const total = filtered.length;
    const totalRevenue = filtered.reduce((sum, p) => sum + (p.total || 0), 0);
    const paid = filtered.filter(p => p.status === "paid").length;
    const scheduled = filtered.filter(p => p.status === "scheduled" || p.status === "appt_scheduled" || p.status === "consult_scheduled").length;
    return { total, totalRevenue, paid, scheduled };
  }, [filtered]);

  const fmtDate = (ts: any) => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const currentStatuses = projectType === "real_estate" ? RE_STATUSES : BIZ_STATUSES;
  const filteredServices = services.filter(s => !s.type || s.type === "both" || s.type === projectType);

  return (
    <AdminLayout title="Projects">
      {/* Top bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-6">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by address, client, or project ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-11 w-full pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`rounded-xl font-bold text-xs ${showAdvanced ? "border-[#0d9488] text-[#0d9488]" : ""}`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {showAdvanced ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </Button>
          <Button
            onClick={() => setShowModal(true)}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl px-6 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" /> New Project
          </Button>
        </div>
      </div>

      {/* Type + Status filter row */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mr-4">
          {[["all", "All"], ["real_estate", "Real Estate"], ["business", "Business"]]
            .map(([v, l]) => (
              <button key={v} onClick={() => setTypeFilter(v as any)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${typeFilter === v ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"}`}
              >{l}</button>
            ))}
        </div>
        {["all", "unscheduled", "scheduled", "in_progress", "delivered", "paid", "archived"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${statusFilter === s ? "bg-[#0d9488] text-white" : "bg-white border border-slate-200 text-gray-600 hover:border-[#0d9488]"}`}
          >{s.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* ─── Advanced Filters Panel ─── */}
      {showAdvanced && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Advanced Filters</h3>
            <button onClick={resetFilters} className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-[#0d9488] uppercase tracking-widest">
              <RotateCcw className="w-3 h-3" /> Reset All
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date range */}
            <div>
              <label className={labelCls}>Date Field</label>
              <select value={dateField} onChange={e => setDateField(e.target.value as any)} className={inputCls}>
                <option value="apptDate">Appointment Date</option>
                <option value="createdAt">Order Date</option>
                <option value="deliveredAt">Delivery Date</option>
                <option value="paidAt">Payment Date</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
            </div>

            {/* Client name */}
            <div>
              <label className={labelCls}>Client Name</label>
              <input value={clientFilter} onChange={e => setClientFilter(e.target.value)} placeholder="Filter by client..." className={inputCls} />
            </div>

            {/* Photographer */}
            <div>
              <label className={labelCls}>Photographer</label>
              <select value={photographerFilter} onChange={e => setPhotographerFilter(e.target.value)} className={inputCls}>
                <option value="">All Photographers</option>
                {photographers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Service */}
            <div>
              <label className={labelCls}>Service</label>
              <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} className={inputCls}>
                <option value="">All Services</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className={labelCls}>Sort By</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className={inputCls}>
                <option value="createdAt">Order Date</option>
                <option value="apptDate">Appointment Date</option>
                <option value="total">Amount</option>
                <option value="clientName">Client Name</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Direction</label>
              <select value={sortDir} onChange={e => setSortDir(e.target.value as any)} className={inputCls}>
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      {(showAdvanced || dateFrom || dateTo) && (
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Projects</p>
            <p className="text-lg font-black text-black">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Revenue</p>
            <p className="text-lg font-black text-[#0d9488]">${stats.totalRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Paid</p>
            <p className="text-lg font-black text-black">{stats.paid}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scheduled</p>
            <p className="text-lg font-black text-black">{stats.scheduled}</p>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">No projects found</p>
          <Button onClick={() => setShowModal(true)} className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl">
            Create your first project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(p => {
            const badge = getBadge(p.status || "unscheduled", p.projectType);
            const loc = p.address || p.shootLocation || "—";
            const isRE = p.projectType !== "business";
            return (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
                  {p.images && p.images.length > 0 ? (
                    <img src={p.images[0].url} alt={loc} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {isRE ? <Home className="w-8 h-8 text-gray-300" /> : <Building2 className="w-8 h-8 text-gray-300" />}
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${isRE ? "bg-[#0d9488]/90 text-white" : "bg-black/80 text-white"}`}>
                      {isRE ? "Real Estate" : "Business"}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${badge.badge}`}>{badge.label}</span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-sm text-black mb-1 line-clamp-1">{loc}</h3>
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
                    <User className="w-3 h-3" /> {p.clientName || "—"}
                  </p>
                  {p.apptDate && (
                    <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> {fmtDate(p.apptDate)}
                    </p>
                  )}
                  <button onClick={() => navigate(`/admin/listing/${p.id}`)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#0d9488]/10 hover:bg-[#0d9488]/20 text-[#0d9488] rounded-lg font-bold text-xs uppercase tracking-widest transition-colors"
                  >
                    Open Project <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── New Project Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl my-8">
            {/* Header */}
            <div className="p-8 pb-0">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-black uppercase tracking-widest">New Project</h3>
                <button onClick={closeModal}><X className="w-5 h-5 text-gray-400 hover:text-black" /></button>
              </div>
              <div className="flex bg-gray-100 rounded-2xl p-1 mb-6">
                <button onClick={() => setProjectType("real_estate")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${projectType === "real_estate" ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-700"}`}
                >
                  <Home className="w-4 h-4" /> Real Estate
                </button>
                <button onClick={() => setProjectType("business")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${projectType === "business" ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-700"}`}
                >
                  <Building2 className="w-4 h-4" /> Business
                </button>
              </div>
            </div>

            <div className="px-8 pb-8 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* New customer checkbox */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => projectType === "real_estate"
                  ? setReForm(f => ({ ...f, isNewCustomer: !f.isNewCustomer }))
                  : setBizForm(f => ({ ...f, isNewCustomer: !f.isNewCustomer }))}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer ${form.isNewCustomer ? "bg-[#0d9488] border-[#0d9488]" : "border-gray-300"}`}
                >
                  {form.isNewCustomer && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-xs font-black text-gray-700 uppercase tracking-widest">New Customer</span>
              </label>

              {/* Client fields */}
              {!form.isNewCustomer ? (
                <div className="relative">
                  <label className={labelCls}>Search Existing Client</label>
                  <input
                    value={form.clientSearch}
                    onChange={e => handleClientSearch(e.target.value)}
                    onFocus={() => { if (form.clientSearch.length > 1) setShowClientDropdown(clientSuggestions.length > 0); }}
                    placeholder="Start typing a name, email, or phone..."
                    className={inputCls}
                  />
                  {showClientDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                      {clientSuggestions.map(c => (
                        <button key={c.id} onClick={() => selectClient(c)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-bold border-b border-gray-100 last:border-0"
                        >
                          {c.firstName} {c.lastName}
                          <span className="text-gray-400 font-normal ml-2 text-xs">{c.email}</span>
                          {c.phone && <span className="text-gray-300 font-normal ml-2 text-xs">{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {form.clientId && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className={labelCls}>Email</label>
                        <input value={form.email} readOnly className={`${inputCls} bg-gray-100 text-gray-500 cursor-not-allowed`} />
                      </div>
                      <div>
                        <label className={labelCls}>Phone</label>
                        <input value={form.phone} readOnly className={`${inputCls} bg-gray-100 text-gray-500 cursor-not-allowed`} />
                      </div>
                    </div>
                  )}
                  {!form.clientId && form.clientSearch.length > 2 && clientSuggestions.length === 0 && (
                    <p className="text-xs text-gray-400 mt-2">No matching clients found. Check the "New Customer" box to create one.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>First Name *</label>
                      <input value={form.firstName} onChange={e => projectType === "real_estate"
                        ? setReForm(f => ({ ...f, firstName: e.target.value }))
                        : setBizForm(f => ({ ...f, firstName: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Last Name</label>
                      <input value={form.lastName} onChange={e => projectType === "real_estate"
                        ? setReForm(f => ({ ...f, lastName: e.target.value }))
                        : setBizForm(f => ({ ...f, lastName: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Email *</label>
                      <input type="email" value={form.email} onChange={e => projectType === "real_estate"
                        ? setReForm(f => ({ ...f, email: e.target.value }))
                        : setBizForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input type="tel" value={form.phone} onChange={e => projectType === "real_estate"
                        ? setReForm(f => ({ ...f, phone: e.target.value }))
                        : setBizForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                </div>
              )}

              {/* Location with autocomplete */}
              {projectType === "real_estate" ? (
                <div>
                  <label className={labelCls}>Service Address *</label>
                  <input
                    ref={addressRef}
                    value={reForm.address}
                    onChange={e => setReForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Start typing an address..."
                    className={inputCls}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Google Places autocomplete enabled</p>
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Shoot Location *</label>
                  <input
                    ref={locationRef}
                    value={bizForm.shootLocation}
                    onChange={e => setBizForm(f => ({ ...f, shootLocation: e.target.value }))}
                    placeholder="Business name or address"
                    className={inputCls}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Google Places autocomplete enabled</p>
                </div>
              )}

              {/* Appointment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Appointment Date</label>
                  <input type="date" value={form.apptDate}
                    onChange={e => projectType === "real_estate"
                      ? setReForm(f => ({ ...f, apptDate: e.target.value }))
                      : setBizForm(f => ({ ...f, apptDate: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Appointment Time</label>
                  <input type="time" value={form.apptTime}
                    onChange={e => projectType === "real_estate"
                      ? setReForm(f => ({ ...f, apptTime: e.target.value }))
                      : setBizForm(f => ({ ...f, apptTime: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>

              {/* Photographers dropdown */}
              <div>
                <label className={labelCls}>Photographer(s)</label>
                {photographers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {photographers.map(p => {
                      const sel = form.photographerIds.includes(p.id);
                      return (
                        <button key={p.id} type="button"
                          onClick={() => {
                            const next = sel
                              ? form.photographerIds.filter(x => x !== p.id)
                              : [...form.photographerIds, p.id];
                            projectType === "real_estate"
                              ? setReForm(f => ({ ...f, photographerIds: next }))
                              : setBizForm(f => ({ ...f, photographerIds: next }));
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sel ? "bg-[#0d9488] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                        >{p.name}</button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No photographers found. Add team members in Settings &rarr; Team.</p>
                )}
              </div>

              {/* Services multi-select */}
              <div>
                <label className={labelCls}>Services</label>
                {filteredServices.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {filteredServices.map(s => {
                      const sel = form.serviceIds.includes(s.id);
                      return (
                        <button key={s.id} type="button" onClick={() => toggleService(s.id)}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sel ? "bg-[#0d9488] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                        >
                          {s.name}{s.price ? ` · $${s.price}` : ""}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No services configured. Add services in Settings &rarr; Pricing.</p>
                )}
              </div>

              {/* Access Info (RE only) */}
              {projectType === "real_estate" && (
                <div>
                  <label className={labelCls}>Access Information</label>
                  <input value={reForm.accessInfo}
                    onChange={e => setReForm(f => ({ ...f, accessInfo: e.target.value }))}
                    placeholder="Lockbox code, key pickup, agent on site..."
                    className={inputCls} />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={form.notes}
                  onChange={e => projectType === "real_estate"
                    ? setReForm(f => ({ ...f, notes: e.target.value }))
                    : setBizForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className={`${inputCls} resize-none`} />
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 pb-8 flex gap-3 pt-2">
              <Button onClick={handleCreate} disabled={saving}
                className="flex-1 bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl">
                <Check className="w-4 h-4 mr-2" />
                {saving ? "Creating…" : "Create Project"}
              </Button>
              <Button variant="outline" onClick={closeModal} className="rounded-xl font-bold">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}