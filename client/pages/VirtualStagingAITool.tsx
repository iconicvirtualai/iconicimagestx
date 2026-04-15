import { useState, useRef, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Upload, Camera, RefreshCw, ShoppingCart, Sparkles, AlertCircle,
} from "lucide-react";
import { auth, storage } from "@/lib/firebase";
import { signInAnonymously } from "firebase/auth";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

interface Variation {
  id: string;
  url: string;
  style: string;
  roomType: string;
}

// Map display labels → API values
const ROOM_TYPE_MAP: Record<string, string> = {
  "Living Room": "living",
  "Bedroom": "bedroom",
  "Dining Room": "dining",
  "Office": "office",
  "Kitchen": "kitchen",
  "Patio": "outdoor",
};

const STYLE_MAP: Record<string, string> = {
  "Modern": "modern",
  "Contemporary": "contemporary",
  "Traditional": "transitional",
  "Industrial": "industrial",
  "Luxury": "luxury",
  "Minimalist": "scandinavian",
};

export default function VirtualStagingAITool() {
  const [file, setFile] = useState<File | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [style, setStyle] = useState("Modern");
  const [roomType, setRoomType] = useState("Living Room");
  const [sliderPos, setSliderPos] = useState(50);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Polling state
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const styles = ["Modern", "Contemporary", "Traditional", "Industrial", "Luxury", "Minimalist"];
  const roomTypes = ["Living Room", "Bedroom", "Dining Room", "Office", "Kitchen", "Patio"];

  // ─── Poll for render result ──────────────────────────────────────────────────
  useEffect(() => {
    if (!currentJobId || !currentToken) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/vsai/result/${currentJobId}`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "completed" && data.resultUrl) {
          setIsRendering(false);
          setIsDone(true);
          setStatusMessage("");
          const newVariation: Variation = {
            id: currentJobId,
            url: data.resultUrl,
            style,
            roomType,
          };
          setVariations((prev) => {
            const updated = [...prev, newVariation];
            setSelectedVariationIndex(updated.length - 1);
            return updated;
          });
          setCurrentJobId(null);
          setCurrentToken(null);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === "failed") {
          setRenderError("Render failed. Please try again.");
          setIsRendering(false);
          setStatusMessage("");
          setCurrentJobId(null);
          if (pollRef.current) clearInterval(pollRef.current);
        } else {
          setStatusMessage("Still rendering… this usually takes 20–40 seconds.");
        }
      } catch {
        // network hiccup — keep polling
      }
    };

    poll(); // immediate check
    pollRef.current = setInterval(poll, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [currentJobId, currentToken, style, roomType]);

  // ─── Handle file selection ───────────────────────────────────────────────────
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setVariations([]);
      setIsDone(false);
      setRenderError(null);
    }
  };

  // ─── Main render trigger ─────────────────────────────────────────────────────
  const startRender = async () => {
    if (!file) return;
    setIsRendering(true);
    setRenderError(null);
    setStatusMessage("Uploading your photo…");

    try {
      // 1. Get (or create) anonymous Firebase user — silent, no login UI
      let user = auth.currentUser;
      if (!user) {
        const result = await signInAnonymously(auth);
        user = result.user;
      }

      // 2. Upload image to Firebase Storage
      const ext = file.name.split(".").pop() || "jpg";
      const path = `vsai-uploads/${user.uid}/${Date.now()}.${ext}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file);
      const imageUrl = await getDownloadURL(fileRef);

      // 3. Get auth token
      const token = await user.getIdToken();

      setStatusMessage("Starting render…");

      // 4. Create VSAI job via backend
      const response = await fetch("/api/vsai/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageUrl,
          roomType: ROOM_TYPE_MAP[roomType] || "living",
          style: STYLE_MAP[style] || "modern",
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start render.");
      }

      const { jobId } = await response.json();

      setStatusMessage("Rendering your space…");
      setCurrentJobId(jobId);
      setCurrentToken(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setRenderError(message);
      setIsRendering(false);
      setStatusMessage("");
    }
  };

  // ─── Regenerate variation ────────────────────────────────────────────────────
  const generateVariation = async () => {
    if (!variations.length || !currentToken && !auth.currentUser) return;
    setIsRendering(true);
    setRenderError(null);
    setStatusMessage("Creating variation…");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated.");
      const token = await user.getIdToken();
      const baseJobId = variations[selectedVariationIndex].id;

      const res = await fetch("/api/vsai/variation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId: baseJobId,
          style: STYLE_MAP[style] || "modern",
        }),
      });

      if (!res.ok) throw new Error("Failed to create variation.");
      const { jobId } = await res.json();
      setCurrentJobId(jobId);
      setCurrentToken(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Variation failed.";
      setRenderError(message);
      setIsRendering(false);
      setStatusMessage("");
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setFile(null);
    setIsDone(false);
    setIsRendering(false);
    setVariations([]);
    setRenderError(null);
    setStatusMessage("");
    setCurrentJobId(null);
    setCurrentToken(null);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />

      <main className="flex-1 pt-32 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">

            {/* Tool Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
              <div>
                <div className="flex items-center gap-2 text-[#0d9488] font-bold text-sm uppercase tracking-widest mb-2">
                  <Sparkles className="w-4 h-4" />
                  AI Staging Tool
                </div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Try AI Staging <span className="text-[#0d9488]">for Free</span>
                </h1>
              </div>
              <div className="flex gap-4">
                <Button variant="ghost" onClick={reset} className="text-gray-500 hover:text-black">
                  Reset
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

              {/* Left Column: Controls */}
              <div className="lg:col-span-4 space-y-8">

                {/* Step 1: Upload */}
                <div className="p-6 rounded-3xl bg-gray-50 border border-gray-100">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-black text-white text-[12px] flex items-center justify-center">1</span>
                    Upload Photo
                  </h3>

                  {!file ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-[#0d9488] transition-colors bg-white group"
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleUpload}
                        accept="image/*"
                      />
                      <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-[#f0fdfa] transition-colors">
                        <Upload className="w-6 h-6 text-gray-400 group-hover:text-[#0d9488]" />
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">Click to upload</p>
                      <p className="text-[11px] text-gray-500">JPG, PNG up to 10MB</p>
                    </div>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden aspect-video bg-white border border-gray-200">
                      <img
                        src={URL.createObjectURL(file)}
                        className="w-full h-full object-cover"
                        alt="Preview"
                      />
                      <button
                        onClick={() => setFile(null)}
                        className="absolute top-2 right-2 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                {/* Step 2: Preferences */}
                <div className={`p-6 rounded-3xl bg-gray-50 border border-gray-100 transition-opacity ${!file ? "opacity-50 pointer-events-none" : ""}`}>
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-black text-white text-[12px] flex items-center justify-center">2</span>
                    Set Preferences
                  </h3>

                  <div className="space-y-6">
                    <div>
                      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Room Type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {roomTypes.map((r) => (
                          <button
                            key={r}
                            onClick={() => setRoomType(r)}
                            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
                              roomType === r
                                ? "bg-black text-white border-black shadow-lg"
                                : "bg-white border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Style Preference</label>
                      <div className="grid grid-cols-2 gap-2">
                        {styles.map((s) => (
                          <button
                            key={s}
                            onClick={() => setStyle(s)}
                            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
                              style === s
                                ? "bg-[#0d9488] text-white border-[#0d9488] shadow-lg shadow-teal-100"
                                : "bg-white border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error message */}
                {renderError && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    {renderError}
                  </div>
                )}

                <Button
                  onClick={startRender}
                  disabled={!file || isRendering}
                  className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white py-8 rounded-2xl font-bold text-lg shadow-xl shadow-teal-100 disabled:bg-gray-200 disabled:shadow-none transition-all"
                >
                  {isRendering ? (
                    <div className="flex items-center gap-3">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      Rendering…
                    </div>
                  ) : variations.length > 0 ? (
                    "New Variation"
                  ) : (
                    "Render Photo"
                  )}
                </Button>
              </div>

              {/* Right Column: Canvas */}
              <div className="lg:col-span-8 flex flex-col h-full">
                <div className="relative flex-1 rounded-[2.5rem] overflow-hidden bg-gray-100 border-[10px] border-gray-50 shadow-2xl min-h-[400px]">

                  {/* Empty State */}
                  {!file && !isRendering && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 shadow-sm border border-gray-100 text-gray-300">
                        <Camera className="w-10 h-10" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Ready to stage?</h3>
                      <p className="text-gray-500 max-w-sm">Upload a photo to see the magic happen. High quality, wide-angle shots work best.</p>
                    </div>
                  )}

                  {/* File selected, not yet rendered */}
                  {file && !isRendering && !isDone && (
                    <div className="absolute inset-0">
                      <img
                        src={URL.createObjectURL(file)}
                        className="w-full h-full object-cover"
                        alt="Original"
                      />
                      <div className="absolute inset-0 flex items-end p-6">
                        <div className="bg-black/60 backdrop-blur-md text-white text-sm px-4 py-2 rounded-xl">
                          Set your preferences and click Render Photo →
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rendering State */}
                  {isRendering && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-12 text-center bg-black/40 backdrop-blur-sm">
                      {file && (
                        <img
                          src={URL.createObjectURL(file)}
                          className="absolute inset-0 w-full h-full object-cover opacity-30"
                          alt="Original"
                        />
                      )}
                      <div className="relative z-10 flex flex-col items-center">
                        <div className="relative w-32 h-32 mb-8">
                          <div className="absolute inset-0 rounded-full border-4 border-[#0d9488]/20 border-t-[#0d9488] animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles className="w-12 h-12 text-[#0d9488]" />
                          </div>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Staging your space…</h3>
                        <p className="text-gray-300 text-sm max-w-xs">
                          {statusMessage || `Applying ${style} style to your ${roomType}.`}
                        </p>
                        <p className="text-gray-400 text-xs mt-2">This usually takes 20–40 seconds</p>
                      </div>
                    </div>
                  )}

                  {/* Result: Before/After Slider */}
                  {isDone && variations.length > 0 && (
                    <div className="absolute inset-0 z-10 select-none">
                      {/* Before */}
                      <img
                        src={URL.createObjectURL(file!)}
                        className="absolute inset-0 w-full h-full object-cover"
                        alt="Original"
                      />
                      {/* After */}
                      <div
                        className="absolute inset-0 overflow-hidden"
                        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                      >
                        <img
                          src={variations[selectedVariationIndex].url}
                          className="absolute inset-0 w-full h-full object-cover"
                          alt="Staged"
                        />
                      </div>

                      {/* Slider Handle */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-white z-20 cursor-ew-resize group"
                        style={{ left: `${sliderPos}%` }}
                      >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-2xl border border-gray-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <div className="flex gap-1">
                            <div className="w-[1px] h-4 bg-gray-300"></div>
                            <div className="w-[1px] h-4 bg-gray-300"></div>
                          </div>
                        </div>
                      </div>

                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sliderPos}
                        onChange={(e) => setSliderPos(parseInt(e.target.value))}
                        className="absolute inset-0 opacity-0 cursor-ew-resize z-30"
                      />

                      <div className="absolute top-6 left-6 z-40 bg-white/80 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-bold uppercase border border-white/40">Before</div>
                      <div className="absolute top-6 right-6 z-40 bg-[#0d9488]/80 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-bold uppercase text-white border border-[#0d9488]/20">
                        After: {variations[selectedVariationIndex].style}
                      </div>
                    </div>
                  )}
                </div>

                {/* Variations Bar */}
                {variations.length > 1 && (
                  <div className="mt-6 flex flex-col gap-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Choose Variation</label>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {variations.map((v, idx) => (
                        <button
                          key={v.id}
                          onClick={() => setSelectedVariationIndex(idx)}
                          className={`flex-shrink-0 w-24 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                            selectedVariationIndex === idx
                              ? "border-[#0d9488] scale-105 shadow-lg shadow-teal-100"
                              : "border-transparent opacity-60 hover:opacity-100"
                          }`}
                        >
                          <img src={v.url} className="w-full h-full object-cover" alt={`Variation ${idx + 1}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom Actions */}
                {isDone && variations.length > 0 && (
                  <div className="mt-8 flex flex-col sm:flex-row gap-4">
                    <Button
                      onClick={generateVariation}
                      disabled={isRendering}
                      variant="outline"
                      className="flex-1 py-7 rounded-2xl border-2 border-gray-100 font-bold flex items-center justify-center gap-2 hover:bg-gray-50"
                    >
                      <RefreshCw className="w-5 h-5" />
                      New Variation
                    </Button>
                    <Link to="/services/virtual-staging/checkout" className="flex-[2]">
                      <Button className="w-full bg-black text-white hover:bg-gray-800 py-7 rounded-2xl font-bold text-lg flex items-center justify-center gap-2">
                        <ShoppingCart className="w-6 h-6" />
                        Purchase Full-Res Result
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
