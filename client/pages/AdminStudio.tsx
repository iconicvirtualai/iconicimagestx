import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp,
  getDoc,
  orderBy,
  limit
} from "firebase/firestore";
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from "firebase/storage";
import { 
  Upload, 
  Camera, 
  Zap, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  FolderOpen, 
  ChevronRight, 
  Image as ImageIcon,
  LayoutGrid,
  FileVideo,
  Layers,
  Trash2,
  RefreshCw,
  Eye,
  Download,
  Search,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, subDays, startOfDay } from "date-fns";

// --- Types & Constants ---
type ServiceType = 'Photos' | 'Twilight' | 'Virtual Staging' | 'Floorplans' | '3D Tour';
type WorkflowStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed';

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";

// --- Components ---

function StatusBadge({ status }: { status: WorkflowStatus }) {
  const colors = {
    Pending: "bg-gray-100 text-gray-500",
    Processing: "bg-blue-100 text-blue-700",
    Completed: "bg-teal-100 text-teal-700",
    Failed: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${colors[status]}`}>
      {status === 'Processing' && <RefreshCw className="w-2 h-2 mr-1 inline animate-spin" />}
      {status}
    </span>
  );
}

export default function AdminStudio() {
  const { user, staffProfile } = useAuth();
  const [activeTab, setActiveTab] = React.useState<"upload" | "studio">("upload");
  const [listings, setListings] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  
  // Settings for Autoenhance
  const [apiKey, setApiKey] = React.useState("");

  const isAdmin = staffProfile?.role === 'admin';
  const isEditor = staffProfile?.role === 'editor';
  const isPhotographer = staffProfile?.role === 'photographer';

  // Auto-switch tab based on role
  React.useEffect(() => {
    if (isPhotographer && !isAdmin && !isEditor) {
      setActiveTab("upload");
    } else if (isEditor || isAdmin) {
      setActiveTab("studio");
    }
  }, [staffProfile]);

  // Load Settings
  React.useEffect(() => {
    getDoc(doc(db, "settings", "global")).then(snap => {
      let key = import.meta.env.VITE_AUTOENHANCE_API_KEY || "";
      if (snap.exists() && snap.data().autoEnhanceApiKey) {
        key = snap.data().autoEnhanceApiKey;
      }
      setApiKey(key);
    });
  }, []);

  // Load Data
  React.useEffect(() => {
    if (!user?.uid) return;

    let q = query(collection(db, "listings"), orderBy("updatedAt", "desc"), limit(50));
    
    // Photographers only see their own jobs
    if (isPhotographer && !isAdmin && !isEditor) {
      // Since we can't easily filter by array containment and order at the same time without an index
      // we'll filter client-side or use a simpler query.
      // But for this requirement, we need "Today + Prev 2 days".
      const twoDaysAgo = startOfDay(subDays(new Date(), 2));
      q = query(
        collection(db, "listings"),
        where("photographerIds", "array-contains", user.uid),
        where("apptDate", ">=", twoDaysAgo),
        orderBy("apptDate", "desc")
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setListings(data);
      setLoading(false);
    }, (err) => {
      console.error("Studio data error:", err);
      // Fallback query if index is missing
      onSnapshot(collection(db, "listings"), (snap) => {
        setListings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    });

    return () => unsub();
  }, [user?.uid, staffProfile]);

  return (
    <AdminLayout title="Operations Studio">
      <div className="mb-8">
        <p className="text-xs text-gray-400">Centralized media processing and upload hub.</p>
      </div>

      {/* Role-based Tab Switcher */}
      <div className="flex gap-2 mb-8 bg-gray-100 p-1 rounded-2xl w-fit">
        {(isAdmin || isEditor || isPhotographer) && (
          <button 
            onClick={() => setActiveTab("upload")}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "upload" ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
          >
            Upload Portal
          </button>
        )}
        {(isAdmin || isEditor) && (
          <button 
            onClick={() => setActiveTab("studio")}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "studio" ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
          >
            Editing Studio
          </button>
        )}
      </div>

      {activeTab === "upload" ? (
        <UploadPortal listings={listings} user={user} isAdmin={isAdmin} isEditor={isEditor} />
      ) : (
        <EditingStudio listings={listings} apiKey={apiKey} />
      )}
    </AdminLayout>
  );
}

// --- Upload Portal Section ---

function UploadPortal({ listings, user, isAdmin, isEditor }: any) {
  const [selectedListing, setSelectedListing] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState<Record<string, number>>({});
  const fileRef = React.useRef<HTMLInputElement>(null);

  const filtered = listings.filter((l: any) => {
    if (isAdmin || isEditor) return true;
    // Photographers restricted to Today + Prev 2 Days
    const date = l.apptDate?.toDate ? l.apptDate.toDate() : new Date(l.apptDate);
    const twoDaysAgo = startOfDay(subDays(new Date(), 2));
    return date >= twoDaysAgo;
  });

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const startUpload = async () => {
    if (!selectedListing || files.length === 0) return;
    setUploading(true);
    
    const listing = listings.find((l: any) => l.id === selectedListing);
    const now = new Date();

    const clientName = (listing.clientName || listing.customerName || listing.name || ((listing.firstName || "") + " " + (listing.lastName || "")).trim() || 'Agent');

    // Folder structure: Uploads > Year > Month > Day > Order# - Agent - Address
    const datePath = `${format(now, "yyyy")}/${format(now, "MM")}/${format(now, "dd")}`;
    const orderLabel = `${listing.id.substring(0,6)} - ${clientName} - ${listing.propertyAddress || 'Address'}`;
    const basePath = `Uploads/${datePath}/${orderLabel}`;

    const uploadPromises = files.map(file => {
      const typePath = file.type.startsWith('video/') ? 'Video' : 'Photos';
      const path = `${basePath}/${typePath}/${Date.now()}_${file.name}`;
      const sRef = ref(storage, path);
      const task = uploadBytesResumable(sRef, file);

      return new Promise((resolve, reject) => {
        task.on('state_changed', 
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setProgress(prev => ({ ...prev, [file.name]: pct }));
          },
          reject,
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            // Append to Firestore
            const listingRef = doc(db, "listings", selectedListing);
            const currentImages = listing.images || [];
            const currentVideos = listing.videos || [];
            
            if (typePath === 'Photos') {
              await updateDoc(listingRef, {
                images: [...currentImages, { url, name: file.name, path, uploadedAt: new Date().toISOString() }],
                updatedAt: serverTimestamp()
              });
            } else {
              await updateDoc(listingRef, {
                videos: [...currentVideos, { url, name: file.name, path, uploadedAt: new Date().toISOString() }],
                updatedAt: serverTimestamp()
              });
            }
            resolve(url);
          }
        );
      });
    });

    try {
      await Promise.all(uploadPromises);
      toast.success("All files uploaded successfully!");
      setFiles([]);
      setProgress({});
    } catch (err) {
      console.error(err);
      toast.error("Some uploads failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Job List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className={labelCls}>Active Jobs (Recent)</h3>
          {filtered.map((l: any) => (
            <button 
              key={l.id}
              onClick={() => setSelectedListing(l.id)}
              className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedListing === l.id ? 'border-[#0d9488] bg-[#0d9488]/5' : 'border-gray-100 bg-white'}`}
            >
              <p className="text-xs font-black truncate">{l.propertyAddress || 'Unnamed'}</p>
              <p className="text-[10px] text-gray-400 font-bold">{l.clientName || 'Agent'}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-gray-100 rounded-full">
                  ID: {l.id.substring(0, 6)}
                </span>
                <span className="text-[9px] font-bold text-gray-400">
                  {l.apptDate?.toDate ? format(l.apptDate.toDate(), "MMM d") : format(new Date(l.apptDate), "MMM d")}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Right: Upload Zone */}
        <div className="lg:col-span-2">
          {!selectedListing ? (
            <div className="h-64 rounded-[2rem] border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center">
              <FolderOpen className="w-10 h-10 text-gray-200 mb-4" />
              <p className="text-sm font-bold text-gray-300 uppercase tracking-widest">Select a job to start uploading</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div 
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
                onClick={() => fileRef.current?.click()}
                className="h-64 rounded-[2rem] border-2 border-dashed border-gray-200 bg-white flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-all"
              >
                <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFiles} />
                <Upload className="w-10 h-10 text-gray-300 mb-4" />
                <p className="text-sm font-black text-gray-500 uppercase tracking-widest">Drag & Drop Media</p>
                <p className="text-[10px] text-gray-400 font-bold mt-1">Photos & Videos supported</p>
              </div>

              {files.length > 0 && (
                <div className="bg-white rounded-[2rem] border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <p className={labelCls}>{files.length} Files Selected</p>
                    <button onClick={() => setFiles([])} className="text-[10px] font-black text-red-400 hover:text-red-600">CLEAR ALL</button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        {f.type.startsWith('video/') ? <FileVideo className="w-4 h-4 text-purple-400" /> : <ImageIcon className="w-4 h-4 text-blue-400" />}
                        <p className="text-xs font-bold truncate flex-1">{f.name}</p>
                        {progress[f.name] !== undefined ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-[#0d9488]">{progress[f.name]}%</span>
                            {progress[f.name] === 100 && <CheckCircle2 className="w-3 h-3 text-teal-500" />}
                          </div>
                        ) : (
                          <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}><Trash2 className="w-3.5 h-3.5 text-gray-300 hover:text-red-400" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button 
                    onClick={startUpload} 
                    disabled={uploading} 
                    className="w-full mt-6 bg-black hover:bg-gray-900 text-white rounded-xl py-6 font-black uppercase tracking-widest"
                  >
                    {uploading ? "Uploading..." : "Start Batch Upload"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Editing Studio Section ---

function EditingStudio({ listings, apiKey }: { listings: any[], apiKey: string }) {
  const [filter, setFilter] = React.useState<WorkflowStatus | 'All'>('All');
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  const filtered = listings.filter(l => {
    // Only show jobs with uploads
    const hasMedia = (l.images || []).length > 0 || (l.videos || []).length > 0;
    if (!hasMedia) return false;

    if (filter === 'All') return true;
    return (l.workflowStatus || 'Pending') === filter;
  });

  const getProcessingTypes = (services: string[]) => {
    const types: { label: string; action: string; color: string }[] = [];
    const s = services.map(v => v.toLowerCase());

    if (s.some(v => v.includes('photo') || v.includes('standard'))) {
      types.push({ label: 'Standard Enhancement', action: 'Autoenhance', color: 'bg-blue-50 text-blue-600 border-blue-100' });
    }
    if (s.some(v => v.includes('twilight'))) {
      types.push({ label: 'Day-to-Twilight', action: 'Twilight AI', color: 'bg-indigo-50 text-indigo-600 border-indigo-100' });
    }
    if (s.some(v => v.includes('staging'))) {
      types.push({ label: 'Virtual Staging', action: 'Staging Tool', color: 'bg-purple-50 text-purple-600 border-purple-100' });
    }
    if (s.some(v => v.includes('floorplan') || v.includes('3d') || v.includes('matterport'))) {
      types.push({ label: '3D/Floorplan', action: 'External/Manual', color: 'bg-orange-50 text-orange-600 border-orange-100' });
    }
    return types;
  };

  const runAutoenhance = async (listing: any) => {
    if (!apiKey) {
      toast.error("Autoenhance API Key missing in Settings");
      return;
    }
    setProcessingId(listing.id);

    try {
      // 1. Mark as Processing in Firestore
      await updateDoc(doc(db, "listings", listing.id), {
        workflowStatus: 'Processing',
        updatedAt: serverTimestamp()
      });

      const photos = listing.images || [];
      if (photos.length === 0) {
        toast.error("No photos found to enhance.");
        setProcessingId(null);
        return;
      }

      toast.info(`Processing ${photos.length} photos with Autoenhance AI...`);

      // 2. Process each photo
      const processedImages: any[] = [];

      for (const photo of photos) {
        try {
          // a. Register Image
          const regRes = await fetch("https://api.autoenhance.ai/v3/images/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey
            },
            body: JSON.stringify({
              image_name: photo.name || `image_${Date.now()}.jpg`,
              order_id: listing.id.substring(0, 8) // Optional: link to a virtual order
            })
          });

          if (!regRes.ok) throw new Error("Registration failed");
          const { upload_url, s3_put_url, id: imageId } = await regRes.json();
          const targetUrl = upload_url || s3_put_url;

          // b. Fetch photo blob from Firebase
          const photoBlobRes = await fetch(photo.url);
          const blob = await photoBlobRes.blob();

          // c. Upload to Autoenhance S3
          const uploadRes = await fetch(targetUrl, {
            method: "PUT",
            headers: {
              "Content-Type": blob.type
            },
            body: blob
          });

          if (!uploadRes.ok) throw new Error("S3 Upload failed");

          processedImages.push({
            originalId: photo.id || photo.name,
            autoenhanceId: imageId,
            status: 'processing'
          });
        } catch (err) {
          console.error(`Failed to process photo: ${photo.name}`, err);
        }
      }

      // Store processed info
      await updateDoc(doc(db, "listings", listing.id), {
        autoenhanceBatch: processedImages,
        updatedAt: serverTimestamp()
      });

      toast.success("All photos submitted! Monitoring enhancement progress...");

      // 3. Start Polling for the batch
      const poll = setInterval(async () => {
        try {
          const lDoc = await getDoc(doc(db, "listings", listing.id));
          const batch = lDoc.data()?.autoenhanceBatch || [];

          const updatedBatch = await Promise.all(batch.map(async (img: any) => {
            if (img.status === 'completed' || img.status === 'failed') return img;

            const statusRes = await fetch(`https://api.autoenhance.ai/v3/images/${img.autoenhanceId}/`, {
              headers: { "x-api-key": apiKey }
            });
            if (!statusRes.ok) return img;
            const statusData = await statusRes.json();

            if (statusData.status === 'processed') {
              return { ...img, status: 'completed', enhancedUrl: statusData.enhanced_url };
            } else if (statusData.status === 'failed') {
              return { ...img, status: 'failed' };
            }
            return img;
          }));

          const allDone = updatedBatch.every(img => img.status === 'completed' || img.status === 'failed');

          // Update Firestore with new statuses
          await updateDoc(doc(db, "listings", listing.id), {
            autoenhanceBatch: updatedBatch,
            updatedAt: serverTimestamp()
          });

          if (allDone) {
            clearInterval(poll);
            const enhanced = updatedBatch.filter(img => img.status === 'completed').map(img => img.enhancedUrl);

            await updateDoc(doc(db, "listings", listing.id), {
              workflowStatus: 'Completed',
              aiProcessedAt: serverTimestamp(),
              enhancedImages: enhanced,
              updatedAt: serverTimestamp()
            });

            toast.success(`Enhancement complete for ${listing.propertyAddress}`);
            setProcessingId(null);
          }
        } catch (e) {
          console.error("Batch polling error:", e);
        }
      }, 10000); // Poll every 10s

      // Timeout safety
      setTimeout(() => { clearInterval(poll); setProcessingId(null); }, 600000); // 10 mins

    } catch (err) {
      console.error(err);
      toast.error("Autoenhance integration failed.");
      await updateDoc(doc(db, "listings", listing.id), {
        workflowStatus: 'Failed',
        updatedAt: serverTimestamp()
      });
      setProcessingId(null);
    }
  };

  const markDelivered = async (id: string) => {
    await updateDoc(doc(db, "listings", id), {
      status: 'delivered_unpaid',
      workflowStatus: 'Completed',
      updatedAt: serverTimestamp()
    });
    toast.success("Job marked as delivered");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {['All', 'Pending', 'Processing', 'Completed'].map(s => (
            <button 
              key={s} 
              onClick={() => setFilter(s as any)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${filter === s ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input placeholder="Search Job Queue..." className="bg-white border border-gray-100 rounded-xl pl-9 pr-4 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30 w-64" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-[2rem] border border-gray-100 p-12 text-center">
            <LayoutGrid className="w-10 h-10 text-gray-100 mx-auto mb-4" />
            <p className="text-sm font-bold text-gray-300 uppercase tracking-widest">No jobs in queue</p>
          </div>
        ) : filtered.map((l: any) => {
          const status = (l.workflowStatus || 'Pending') as WorkflowStatus;
          const photos = l.images || [];
          const videos = l.videos || [];
          const services = (l.services || []).map((s: any) => typeof s === 'string' ? s : s.name);
          
          // Detect Missing Assets
          const needsPhotos = services.some((s: string) => s.toLowerCase().includes('photo') || s.toLowerCase().includes('twilight'));
          const needsVideo = services.some((s: string) => s.toLowerCase().includes('video') || s.toLowerCase().includes('cinematic'));
          const isIncomplete = (needsPhotos && photos.length === 0) || (needsVideo && videos.length === 0);

          return (
            <div key={l.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-sm font-black text-black truncate">{l.propertyAddress || 'Unnamed Listing'}</h4>
                    <StatusBadge status={status} />
                    {isIncomplete && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-50 text-red-500 border border-red-100">
                        <AlertCircle className="w-2.5 h-2.5" /> Incomplete
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-4">
                    Order #{l.id.substring(0, 6)} • {l.clientName || 'Agent'}
                  </p>

                  <div className="flex items-center gap-6 mb-6">
                    <div className="space-y-1">
                      <p className={labelCls}>Workflow Detection</p>
                      <div className="flex gap-2 flex-wrap">
                        {getProcessingTypes(services).map((t, i) => (
                          <div key={i} className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[10px] font-bold ${t.color}`}>
                            <Zap className="w-3 h-3" />
                            {t.label} → {t.action}
                          </div>
                        ))}
                        {services.length === 0 && <span className="text-[10px] text-gray-300 italic">No services detected</span>}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>Assets</p>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500">
                          <ImageIcon className="w-3 h-3 text-blue-400" /> {photos.length}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500">
                          <FileVideo className="w-3 h-3 text-purple-400" /> {videos.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!l.aiProcessedAt && status === 'Pending' && !isIncomplete && (
                      <Button 
                        onClick={() => runAutoenhance(l)} 
                        disabled={processingId === l.id}
                        className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl text-[10px] font-black uppercase tracking-widest h-9 px-4"
                      >
                        <Zap className="w-3.5 h-3.5 mr-2" /> Send to Autoenhance
                      </Button>
                    )}
                    {l.aiProcessedAt && status === 'Completed' && (
                      <Button 
                        onClick={() => markDelivered(l.id)}
                        className="bg-black hover:bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest h-9 px-4"
                      >
                        <ArrowRight className="w-3.5 h-3.5 mr-2" /> Mark Delivered
                      </Button>
                    )}
                    <Button variant="outline" className="rounded-xl text-[10px] font-black uppercase tracking-widest h-9 px-4">
                      <Eye className="w-3.5 h-3.5 mr-2" /> Review Gallery
                    </Button>
                  </div>
                </div>

                <div className="hidden sm:block text-right">
                  <p className={labelCls}>Uploaded At</p>
                  <p className="text-[10px] font-black text-black mt-1">
                    {l.updatedAt?.toDate ? format(l.updatedAt.toDate(), "MMM d, h:mm a") : '—'}
                  </p>
                  <div className="mt-4 flex flex-col items-end gap-1">
                    <p className={labelCls}>Processing Log</p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                      <p className="text-[9px] font-bold text-gray-400">RAW Received</p>
                    </div>
                    {l.aiProcessedAt && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                        <p className="text-[9px] font-bold text-gray-400">AI Enhancement Done</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
