import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Upload, CheckCircle2, XCircle, Image as ImageIcon, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AdminUpload() {
  const { user } = useAuth();
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [selectedJob, setSelectedJob] = React.useState<string>("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploads, setUploads] = React.useState<Record<string, number>>({});
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "listings"),
      where("photographerUid", "==", user.uid),
      where("status", "in", ["scheduled", "pending"]),
      orderBy("shootDate", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setJobs(list);
      if (list.length > 0 && !selectedJob) setSelectedJob(list[0].id);
    });
    return () => unsub();
  }, [user?.uid]);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const arr = Array.from(e.target.files).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...arr]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const arr = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...arr]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (!selectedJob || files.length === 0) return;
    setUploading(true);

    const promises = files.map((file) => {
      return new Promise<void>((resolve, reject) => {
        const path = `listings/${selectedJob}/photos/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        const task = uploadBytesResumable(storageRef, file);

        task.on(
          "state_changed",
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setUploads((prev) => ({ ...prev, [file.name]: pct }));
          },
          (err) => { console.error(err); reject(err); },
          async () => {
            await getDownloadURL(task.snapshot.ref);
            resolve();
          }
        );
      });
    });

    try {
      await Promise.all(promises);
      toast.success(`${files.length} photo${files.length > 1 ? "s" : ""} uploaded successfully!`);
      setFiles([]);
      setUploads({});
    } catch {
      toast.error("Some uploads failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const selectedJobData = jobs.find((j) => j.id === selectedJob);

  return (
    <AdminLayout title="Upload Photos">
      <div className="max-w-3xl mx-auto">
        {/* Job selector */}
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 mb-6">
          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">
            Select Job
          </label>
          {jobs.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
              <FolderOpen className="w-5 h-5 text-gray-300" />
              <p className="text-sm text-gray-400 font-bold">No active jobs assigned to you.</p>
            </div>
          ) : (
            <select
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.propertyAddress || "Unnamed listing"} — {j.status}
                </option>
              ))}
            </select>
          )}
          {selectedJobData && (
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">
              Listing ID: {selectedJob}
            </p>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-[2rem] p-12 text-center cursor-pointer hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-all mb-6"
        >
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
          <Upload className="w-10 h-10 text-gray-300 mx-auto mb-4" />
          <p className="font-black text-sm text-gray-500 uppercase tracking-widest mb-1">
            Drop photos here or click to browse
          </p>
          <p className="text-xs text-gray-400">JPEG, PNG, WEBP supported</p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                {files.length} photo{files.length > 1 ? "s" : ""} selected
              </p>
              <button onClick={() => setFiles([])} className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest">
                Clear all
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <ImageIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <p className="text-xs font-bold text-gray-700 flex-1 truncate">{f.name}</p>
                  <span className="text-[10px] text-gray-400 font-bold">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  {uploads[f.name] !== undefined ? (
                    uploads[f.name] === 100 ? (
                      <CheckCircle2 className="w-4 h-4 text-teal-500" />
                    ) : (
                      <span className="text-[10px] font-black text-[#0d9488]">{uploads[f.name]}%</span>
                    )
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                      <XCircle className="w-4 h-4 text-gray-300 hover:text-red-400 transition-colors" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload button */}
        <Button
          onClick={handleUpload}
          disabled={uploading || files.length === 0 || !selectedJob}
          className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white font-black rounded-xl py-4 text-sm uppercase tracking-widest disabled:opacity-40"
        >
          {uploading ? "Uploading..." : `Upload ${files.length > 0 ? files.length + " " : ""}Photo${files.length !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </AdminLayout>
  );
}
