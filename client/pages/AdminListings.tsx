import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Search,
  Plus,
  MoreVertical,
  ArrowRight,
  Calendar,
  MapPin,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { toast } from "sonner";

interface Listing {
  id: string;
  address: string;
  city: string;
  agentName: string;
  agentEmail: string;
  agentPhone: string;
  teamName: string;
  status: "scheduled" | "in_progress" | "delivered" | "archived";
  apptDate?: Timestamp;
  images: Array<{ url: string; name: string }>;
  createdAt: Timestamp;
  studioEnabled: boolean;
  studioToken: string;
}

interface FormData {
  address: string;
  city: string;
  agentName: string;
  agentEmail: string;
  agentPhone: string;
  teamName: string;
  apptDate: string;
}

const emptyFormData: FormData = {
  address: "",
  city: "",
  agentName: "",
  agentEmail: "",
  agentPhone: "",
  teamName: "",
  apptDate: "",
};

export default function AdminListings() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "scheduled" | "in_progress" | "delivered" | "archived"
  >("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real-time Firestore listener
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "listings"),
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Listing[];
        setListings(docs);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore Error:", error);
        toast.error("Failed to load listings");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredListings = listings.filter((listing) => {
    const matchesSearch =
      listing.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || listing.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateListing = async () => {
    if (
      !formData.address ||
      !formData.city ||
      !formData.agentName ||
      !formData.apptDate
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const newListingRef = await addDoc(collection(db, "listings"), {
        address: formData.address,
        city: formData.city,
        agentName: formData.agentName,
        agentEmail: formData.agentEmail,
        agentPhone: formData.agentPhone,
        teamName: formData.teamName,
        apptDate: new Date(formData.apptDate),
        status: "scheduled",
        images: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        studioEnabled: true,
        studioToken: crypto.randomUUID(),
      });

      toast.success("Listing created! Redirecting...");
      setFormData(emptyFormData);
      setIsModalOpen(false);

      // Navigate to the listing file page
      setTimeout(() => {
        navigate(`/admin/listing/${newListingRef.id}`);
      }, 500);
    } catch (error) {
      console.error("Error creating listing:", error);
      toast.error("Failed to create listing");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-100 text-blue-700";
      case "in_progress":
        return "bg-amber-100 text-amber-700";
      case "delivered":
        return "bg-teal-100 text-[#0d9488]";
      case "archived":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatDate = (date: Timestamp | undefined) => {
    if (!date) return "N/A";
    return date.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <AdminLayout title="Listings">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by address or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 w-full pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
          />
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl px-6 whitespace-nowrap"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Listing
        </Button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {["all", "scheduled", "in_progress", "delivered", "archived"].map(
          (status) => (
            <button
              key={status}
              onClick={() =>
                setStatusFilter(
                  status as
                    | "all"
                    | "scheduled"
                    | "in_progress"
                    | "delivered"
                    | "archived"
                )
              }
              className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest whitespace-nowrap transition-all ${
                statusFilter === status
                  ? "bg-[#0d9488] text-white"
                  : "bg-white border border-slate-200 text-gray-600 hover:border-[#0d9488]"
              }`}
            >
              {getStatusLabel(status)}
            </button>
          )
        )}
      </div>

      {/* Listings Grid */}
      {loading ? (
        <div className="text-center py-16">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
            Loading listings...
          </p>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
            No listings found
          </p>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl"
          >
            Create your first listing
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map((listing) => (
            <div
              key={listing.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all overflow-hidden"
            >
              {/* Image */}
              <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
                {listing.images && listing.images.length > 0 ? (
                  <img
                    src={listing.images[0].url}
                    alt={listing.address}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-gray-400 font-bold text-xs uppercase tracking-widest">
                      No Image
                    </span>
                  </div>
                )}
                <div className="absolute top-3 right-3">
                  <span
                    className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${getStatusColor(listing.status)}`}
                  >
                    {getStatusLabel(listing.status)}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="font-bold text-sm text-black mb-2 line-clamp-1">
                  {listing.address}
                </h3>
                <p className="text-xs text-gray-500 mb-3">{listing.city}</p>

                {/* Info */}
                <div className="space-y-2 mb-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="font-bold text-black">Agent:</span>
                    <span>{listing.agentName}</span>
                  </div>
                  {listing.teamName && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="font-bold text-black">Team:</span>
                      <span>{listing.teamName}</span>
                    </div>
                  )}
                  {listing.apptDate && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(listing.apptDate)}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/admin/listing/${listing.id}`)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#0d9488]/10 hover:bg-[#0d9488]/20 text-[#0d9488] rounded-lg font-bold text-xs uppercase tracking-widest transition-colors"
                  >
                    Open
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <MoreVertical className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Listing Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-black uppercase tracking-tight">
              Create New Listing
            </DialogTitle>
            <DialogDescription className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Add a new property listing to your portfolio
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                Property Address *
              </label>
              <input
                type="text"
                placeholder="123 Main Street"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                className="h-11 w-full px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                City / State *
              </label>
              <input
                type="text"
                placeholder="Austin, TX"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                className="h-11 w-full px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                Agent Name *
              </label>
              <input
                type="text"
                placeholder="John Smith"
                value={formData.agentName}
                onChange={(e) =>
                  setFormData({ ...formData, agentName: e.target.value })
                }
                className="h-11 w-full px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                Agent Email
              </label>
              <input
                type="email"
                placeholder="john@example.com"
                value={formData.agentEmail}
                onChange={(e) =>
                  setFormData({ ...formData, agentEmail: e.target.value })
                }
                className="h-11 w-full px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                Agent Phone
              </label>
              <input
                type="tel"
                placeholder="(512) 555-1234"
                value={formData.agentPhone}
                onChange={(e) =>
                  setFormData({ ...formData, agentPhone: e.target.value })
                }
                className="h-11 w-full px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                Team Name
              </label>
              <input
                type="text"
                placeholder="Realty Team A"
                value={formData.teamName}
                onChange={(e) =>
                  setFormData({ ...formData, teamName: e.target.value })
                }
                className="h-11 w-full px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">
                Appointment Date *
              </label>
              <input
                type="date"
                value={formData.apptDate}
                onChange={(e) =>
                  setFormData({ ...formData, apptDate: e.target.value })
                }
                className="h-11 w-full px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setIsModalOpen(false)}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-gray-700 font-bold text-xs uppercase tracking-widest hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateListing}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold text-xs uppercase tracking-widest disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "Creating..." : "Create"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
