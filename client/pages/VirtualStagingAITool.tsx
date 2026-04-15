import { useState, useRef, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Upload, Camera, RefreshCw, ShoppingCart, Sparkles,
  AlertCircle, ChevronLeft, ChevronRight, Plus, Trash2, CheckCircle,
} from "lucide-react";
import { auth, storage } from "@/lib/firebase";
import { signInAnonymously } from "firebase/auth";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Render {
  jobId: string;
  resultUrl: string;
  style: string;
  roomType: string;
}

interface CartItem {
  /** The selected render to purchase */
  render: Render;
  /** Original uploaded photo (for thumbnail) */
  previewUrl: string;
}

// ─── Maps: display label → VSAI API value ────────────────────────────────────

const ROOM_TYPE_MAP: Record<string, string> = {
  "Living Room": "living",
  "Bedroom":     "bedroom",
  "Dining Room": "dining",
  "Kitchen":     "kitchen",
  "Home Office": "office",
  "Patio":       "outdoor",
};

const STYLE_MAP: Record<string, string> = {
  "Modern":       "modern",
  "Contemporary": "contemporary",
  "Traditional":  "transitional",
  "Minimalist":   "scandinavian",
  "Industrial":   "industrial",
  "Farmhouse":    "farmhouse",
  "Coastal":      "coastal",
  "Luxury":       "luxury",
};

const ROOM_TYPES = Object.keys(ROOM_TYPE_MAP);
const STYLES     = Object.keys(STYLE_MAP);

const PRICE_PER_PHOTO = 15; // dollars — matches server VSAI_PRICE_CENTS default

// ─── Component ───────────────────────────────────────────────────────────────

export default function VirtualStagingAITool() {
  // Upload
  const [file, setFile]               = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging]   = useState(false);

  // Preferences
  const [roomType, setRoomType] = useState("Living Room");
  const [style, setStyle]       = useState("Modern");

  // Render state
  const [isRendering, setIsRendering]       = useState(false);
  const [statusMessage, setStatusMessage]   = useState("");
  const [renderError, setRenderError]       = useState<string | null>(null);

  // Completed renders for current photo
  const [renders, setRenders]             = useState<Render[]>([]);
  const [selectedRenderIdx, setSelectedRenderIdx] = useState(0);

  // Before/after slider
  const [sliderPos, setSliderPos] = useState(50);

  // Cart (multiple photos)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Polling
  const [currentJobId, setCurrentJobId]   = useState<string | null>(null);
  const [currentToken, setCurrentToken]   = useState<string | null>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDone = renders.length > 0 && !isRendering;

  // ─── Cleanup file preview URL on change ──────────────────────────────────
  useEffect(() => {
    if (!file) { setFilePreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ─── Polling loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentJobId || !currentToken) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/vsai/result/${currentJobId}`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        });
        if (!res.ok) return; // transient error — keep polling

        const data = await res.json();

        if (data.status === "completed" && data.resultUrl) {
          clearInterval(pollRef.current!);
          pollRef.current = null;

          const newRender: Render = {
            jobId:    currentJobId,
            resultUrl: data.resultUrl,
            style,
            roomType,
          };

          setRenders((prev) => {
            const updated = [...prev, newRender];
            setSelectedRenderIdx(updated.length - 1);
            return updated;
          });
          setIsRendering(false);
          setStatusMessage("");
          setCurrentJobId(null);
          setCurrentToken(null);

        } else if (data.status === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setRenderError(data.error || "Render failed. Please try again.");
          setIsRendering(false);
          setStatusMessage("");
          setCurrentJobId(null);
          setCurrentToken(null);

        } else {
          setStatusMessage("Still rendering… this usually takes 20–40 seconds.");
        }
      } catch {
        // network hiccup — keep polling
      }
    };

    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [currentJobId, currentToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── File selection ───────────────────────────────────────────────────────
  const acceptFile = useCallback((incoming: File | null) => {
    if (!incoming) return;
    if (!incoming.type.startsWith("image/")) {
      setRenderError("Please upload an image file (JPG, PNG, WEBP).");
      return;
    }
    if (incoming.size > 20 * 1024 * 1024) {
      setRenderError("Image must be under 20 MB.");
      return;
    }
    setFile(incoming);
    setRenders([]);
    setRenderError(null);
    setStatusMessage("");
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) =>
    acceptFile(e.target.files?.[0] ?? null);

  // ─── Drag and drop ────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    acceptFile(dropped ?? null);
  };

  // ─── Auth helper ─────────────────────────────────────────────────────────
  const ensureAuth = async () => {
    let user = auth.currentUser;
    if (!user) {
      const result = await signInAnonymously(auth);
      user = result.user;
    }
    return user;
  };

  // ─── Start render ─────────────────────────────────────────────────────────
  const startRender = async () => {
    if (!file) return;
    setIsRendering(true);
    setRenderError(null);
    setStatusMessage("Uploading your photo…");

    try {
      const user = await ensureAuth();

      // Upload to Firebase Storage
      const ext = file.name.split(".").pop() || "jpg";
      const path = `vsai-uploads/${user.uid}/${Date.now()}.${ext}`;
      await uploadBytes(storageRef(storage, path), file);
      const imageUrl = await getDownloadURL(storageRef(storage, path));

      const token = await user.getIdToken();
      setStatusMessage("Starting render…");

      const response = await fetch("/api/vsai/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageUrl,
          roomType: ROOM_TYPE_MAP[roomType] ?? "living",
          style:    STYLE_MAP[style]     ?? "modern",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start render.");
      }

      setStatusMessage("Rendering your space…");
      setCurrentJobId(data.jobId);
      setCurrentToken(token);
    } catch (err: unknown) {
      setRenderError(err instanceof Error ? err.message : "Something went wrong.");
      setIsRendering(false);
      setStatusMessage("");
    }
  };

  // ─── Regenerate (new variation, same photo + params) ──────────────────────
  const regenerate = async () => {
    if (!renders.length) return;
    setIsRendering(true);
    setRenderError(null);
    setStatusMessage("Creating a new variation…");

    try {
      const user = await ensureAuth();
      const token = await user.getIdToken();

      // Use the currently-selected render as the base job
      const baseJobId = renders[selectedRenderIdx].jobId;

      const res = await fetch("/api/vsai/variation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId:    baseJobId,
          style:    STYLE_MAP[style]     ?? "modern",
          roomType: ROOM_TYPE_MAP[roomType] ?? "living",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create variation.");

      setCurrentJobId(data.jobId);
      setCurrentToken(token);
    } catch (err: unknown) {
      setRenderError(err instanceof Error ? err.message : "Variation failed.");
      setIsRendering(false);
      setStatusMessage("");
    }
  };

  // ─── Add selected render to cart, reset for next photo ───────────────────
  const addToCartAndContinue = () => {
    if (!renders.length || !filePreviewUrl) return;
    const selected = renders[selectedRenderIdx];
    setCart((prev) => [
      ...prev,
      { render: selected, previewUrl: filePreviewUrl },
    ]);
    // reset everything except cart
    if (pollRef.current) clearInterval(pollRef.current);
    setFile(null);
    setRenders([]);
    setRenderError(null);
    setStatusMessage("");
    setCurrentJobId(null);
    setCurrentToken(null);
    setSliderPos(50);
    setSelectedRenderIdx(0);
    // Scroll to top of tool
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeFromCart = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── Stripe checkout ──────────────────────────────────────────────────────
  const checkout = async (extraRender?: Render) => {
    setIsCheckingOut(true);
    setRenderError(null);

    try {
      const user = await ensureAuth();
      const token = await user.getIdToken();

      // Build the list of job IDs to purchase
      const jobIds: string[] = [
        ...cart.map((item) => item.render.jobId),
        ...(extraRender ? [extraRender.jobId] : []),
      ];

      if (jobIds.length === 0) {
        setRenderError("No renders selected for purchase.");
        setIsCheckingOut(false);
        return;
      }

      const res = await fetch("/api/vsai/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jobIds }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start checkout.");

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err: unknown) {
      setRenderError(err instanceof Error ? err.message : "Checkout failed.");
      setIsCheckingOut(false);
    }
  };

  // ─── Reset everything ────────────────────────────────────────────────────
  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setFile(null);
    setRenders([]);
    setIsRendering(false);
    setRenderError(null);
    setStatusMessage("");
    setCurrentJobId(null);
    setCurrentToken(null);
    setSliderPos(50);
    setSelectedRenderIdx(0);
    setCart([]);
    setIsCheckingOut(false);
  };

  const cartTotal = (cart.length + (isDone ? 1 : 0)) * PRICE_PER_PHOTO;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />

      <main className="flex-1 pt-32 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">

            {/* Header row */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
              <div>
                <div className="flex items-center gap-2 text-[#0d9488] font-bold text-sm uppercase tracking-widest mb-2">
                  <Sparkles className="w-4 h-4" />
                  AI Staging Tool
                </div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Try AI Staging{" "}
                  <span className="text-[#0d9488]">for Free</span>
                </h1>
                <p className="text-gray-500 mt-2 text-sm">
                  Upload an empty room photo — we'll stage it with furniture in seconds.
                  Purchase full-res downloads for $15/photo.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {cart.length > 0 && (
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-4 py-2 rounded-2xl text-sm font-medium">
                    <ShoppingCart className="w-4 h-4 text-[#0d9488]" />
                    {cart.length} in cart
                  </div>
                )}
                <Button
                  variant="ghost"
                  onClick={reset}
                  className="text-gray-400 hover:text-black text-sm"
                >
                  Start Over
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

              {/* ── Left Column: Controls ─────────────────────────────────── */}
              <div className="lg:col-span-4 space-y-6">

                {/* Step 1 — Upload */}
                <div className="p-6 rounded-3xl bg-gray-50 border border-gray-100">
                  <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-black text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      1
                    </span>
                    Upload Photo
                  </h3>

                  {!file ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all
                        ${isDragging
                          ? "border-[#0d9488] bg-[#f0fdfa] scale-[1.01]"
                          : "border-gray-200 bg-white hover:border-[#0d9488] hover:bg-[#f0fdfa]"
                        }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileInput}
                        accept="image/*"
                      />
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors
                        ${isDragging ? "bg-[#0d9488]/10" : "bg-gray-100"}`}
                      >
                        <Upload className={`w-6 h-6 transition-colors ${isDragging ? "text-[#0d9488]" : "text-gray-400"}`} />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">
                        {isDragging ? "Drop it here!" : "Drag & drop or click to upload"}
                      </p>
                      <p className="text-[11px] text-gray-500">JPG, PNG, WEBP · max 20 MB</p>
                    </div>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden aspect-video bg-black border border-gray-200">
                      {filePreviewUrl && (
                        <img
                          src={filePreviewUrl}
                          className="w-full h-full object-cover"
                          alt="Uploaded photo"
                        />
                      )}
                      <button
                        onClick={() => {
                          setFile(null);
                          setRenders([]);
                          setRenderError(null);
                        }}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black text-base leading-none"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                {/* Step 2 — Preferences */}
                <div className={`p-6 rounded-3xl bg-gray-50 border border-gray-100 transition-opacity ${!file ? "opacity-40 pointer-events-none" : ""}`}>
                  <h3 className="text-base font-bold mb-5 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-black text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      2
                    </span>
                    Set Preferences
                  </h3>

                  <div className="space-y-5">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">
                        Room Type
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {ROOM_TYPES.map((r) => (
                          <button
                            key={r}
                            onClick={() => setRoomType(r)}
                            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                              roomType === r
                                ? "bg-black text-white border-black"
                                : "bg-white border-gray-200 hover:border-gray-400 text-gray-700"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">
                        Style
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {STYLES.map((s) => (
                          <button
                            key={s}
                            onClick={() => setStyle(s)}
                            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                              style === s
                                ? "bg-[#0d9488] text-white border-[#0d9488]"
                                : "bg-white border-gray-200 hover:border-gray-400 text-gray-700"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error */}
                {renderError && (
                  <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{renderError}</span>
                  </div>
                )}

                {/* Render / Regenerate CTA */}
                <Button
                  onClick={isDone ? regenerate : startRender}
                  disabled={!file || isRendering}
                  className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white py-7 rounded-2xl font-bold text-base shadow-lg shadow-teal-100/50 disabled:bg-gray-200 disabled:shadow-none disabled:text-gray-400 transition-all"
                >
                  {isRendering ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      {statusMessage || "Rendering…"}
                    </span>
                  ) : isDone ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5" />
                      Regenerate
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      Render Photo
                    </span>
                  )}
                </Button>

                {/* Cart summary */}
                {cart.length > 0 && (
                  <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Cart ({cart.length})
                      </span>
                      <span className="text-sm font-bold text-gray-900">
                        ${cart.length * PRICE_PER_PHOTO}.00
                      </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {cart.map((item, i) => (
                        <div key={i} className="relative flex-shrink-0">
                          <img
                            src={item.render.resultUrl}
                            alt={`Cart ${i + 1}`}
                            className="w-16 h-12 rounded-lg object-cover border border-gray-200"
                          />
                          <button
                            onClick={() => removeFromCart(i)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right Column: Canvas ──────────────────────────────────── */}
              <div className="lg:col-span-8 flex flex-col">

                {/* Main viewer */}
                <div className="relative flex-1 rounded-[2rem] overflow-hidden bg-gray-100 border-[8px] border-gray-50 shadow-2xl min-h-[440px]">

                  {/* Empty state */}
                  {!file && !isRendering && renders.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-5 shadow-sm border border-gray-100">
                        <Camera className="w-10 h-10 text-gray-300" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        Ready to stage?
                      </h3>
                      <p className="text-gray-400 text-sm max-w-xs">
                        Upload an empty room photo and we'll furnish it with AI in under a minute.
                      </p>
                    </div>
                  )}

                  {/* Photo uploaded, not yet rendered */}
                  {file && !isRendering && renders.length === 0 && filePreviewUrl && (
                    <div className="absolute inset-0">
                      <img
                        src={filePreviewUrl}
                        className="w-full h-full object-cover"
                        alt="Original"
                      />
                      <div className="absolute inset-0 flex items-end p-6">
                        <div className="bg-black/50 backdrop-blur-md text-white text-xs px-4 py-2 rounded-xl font-medium">
                          Set preferences on the left, then click Render Photo →
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rendering overlay */}
                  {isRendering && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                      {filePreviewUrl && (
                        <img
                          src={filePreviewUrl}
                          className="absolute inset-0 w-full h-full object-cover opacity-25"
                          alt=""
                        />
                      )}
                      <div className="relative z-10 flex flex-col items-center text-center px-8">
                        <div className="relative w-24 h-24 mb-6">
                          <div className="absolute inset-0 rounded-full border-4 border-white/20 border-t-[#0d9488] animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles className="w-10 h-10 text-[#0d9488]" />
                          </div>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">
                          Staging your space…
                        </h3>
                        <p className="text-gray-300 text-sm">
                          {statusMessage || `Applying ${style} style to your ${roomType}.`}
                        </p>
                        <p className="text-gray-500 text-xs mt-1">
                          Usually takes 20–40 seconds
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Before / After Slider */}
                  {isDone && renders.length > 0 && filePreviewUrl && (
                    <div className="absolute inset-0 z-10 select-none">
                      {/* Before */}
                      <img
                        src={filePreviewUrl}
                        className="absolute inset-0 w-full h-full object-cover"
                        alt="Original"
                      />
                      {/* After (clipped) */}
                      <div
                        className="absolute inset-0 overflow-hidden"
                        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                      >
                        <img
                          src={renders[selectedRenderIdx].resultUrl}
                          className="absolute inset-0 w-full h-full object-cover"
                          alt="Staged"
                        />
                      </div>

                      {/* Slider handle */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white z-20 cursor-ew-resize"
                        style={{ left: `${sliderPos}%` }}
                      >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 bg-white rounded-full shadow-xl border border-gray-200 flex items-center justify-center">
                          <div className="flex gap-0.5">
                            <ChevronLeft className="w-3 h-3 text-gray-400" />
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                          </div>
                        </div>
                      </div>

                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sliderPos}
                        onChange={(e) => setSliderPos(+e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-ew-resize z-30 w-full h-full"
                      />

                      {/* Labels */}
                      <div className="absolute top-4 left-4 z-40 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-lg">
                        Before
                      </div>
                      <div className="absolute top-4 right-4 z-40 bg-[#0d9488]/80 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-lg">
                        After · {renders[selectedRenderIdx].style}
                      </div>

                      {/* Variation count badge */}
                      {renders.length > 1 && (
                        <div className="absolute bottom-4 left-4 z-40 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-3 py-1.5 rounded-lg">
                          Variation {selectedRenderIdx + 1} of {renders.length}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Variation thumbnails */}
                {renders.length > 1 && (
                  <div className="mt-5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                      All Variations — Pick Your Favorite
                    </p>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {renders.map((r, idx) => (
                        <button
                          key={r.jobId}
                          onClick={() => setSelectedRenderIdx(idx)}
                          className={`relative flex-shrink-0 w-28 h-20 rounded-xl overflow-hidden border-2 transition-all
                            ${selectedRenderIdx === idx
                              ? "border-[#0d9488] shadow-lg shadow-teal-100 scale-105"
                              : "border-gray-200 opacity-60 hover:opacity-100"
                            }`}
                        >
                          <img
                            src={r.resultUrl}
                            className="w-full h-full object-cover"
                            alt={`Variation ${idx + 1}`}
                          />
                          {selectedRenderIdx === idx && (
                            <div className="absolute inset-0 flex items-center justify-center bg-[#0d9488]/20">
                              <CheckCircle className="w-6 h-6 text-white drop-shadow" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5 font-medium">
                            V{idx + 1} · {r.style}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons after render complete */}
                {isDone && renders.length > 0 && (
                  <div className="mt-6 space-y-3">

                    {/* Primary: Purchase */}
                    <Button
                      onClick={() => checkout(renders[selectedRenderIdx])}
                      disabled={isCheckingOut}
                      className="w-full bg-black hover:bg-gray-800 text-white py-6 rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-xl"
                    >
                      {isCheckingOut ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <ShoppingCart className="w-5 h-5" />
                      )}
                      {cart.length > 0
                        ? `Purchase ${cart.length + 1} Photo${cart.length + 1 > 1 ? "s" : ""} — $${cartTotal}`
                        : "Purchase High Resolution Photo — $15"}
                    </Button>

                    {/* Secondary: Add another photo */}
                    <Button
                      onClick={addToCartAndContinue}
                      variant="outline"
                      className="w-full py-5 rounded-2xl border-2 border-gray-200 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-50"
                    >
                      <Plus className="w-4 h-4" />
                      Add to Cart &amp; Stage Another Photo
                      {cart.length > 0 && (
                        <span className="ml-1 bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {cart.length + 1} total
                        </span>
                      )}
                    </Button>

                    <p className="text-center text-xs text-gray-400">
                      High-res download link delivered instantly after payment · No account required
                    </p>
                  </div>
                )}

                {/* Checkout cart if user has items but no current render */}
                {!isDone && cart.length > 0 && !isRendering && (
                  <div className="mt-6">
                    <Button
                      onClick={() => checkout()}
                      disabled={isCheckingOut}
                      className="w-full bg-black hover:bg-gray-800 text-white py-6 rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-xl"
                    >
                      {isCheckingOut ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <ShoppingCart className="w-5 h-5" />
                      )}
                      Purchase {cart.length} Photo{cart.length > 1 ? "s" : ""} — ${cart.length * PRICE_PER_PHOTO}
                    </Button>
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
