import { useState, useRef } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Upload, Camera, Trash2, LayoutGrid, CheckCircle2, UserCheck, ArrowRight, MessageSquare } from "lucide-react";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import {
  VIRTUAL_STAGING_PRO_MAX_PHOTO_BYTES,
  VIRTUAL_STAGING_PRO_MAX_PHOTOS,
  VIRTUAL_STAGING_PRO_ROOM_TYPES,
  VIRTUAL_STAGING_PRO_STYLES,
  VIRTUAL_STAGING_PRO_UNIT_PRICE,
  normalizeVirtualStagingPhotoType,
} from "@shared/virtualStagingPro";

interface UploadedPhoto {
  id: string;
  file: File;
  preview: string;
  roomType: string;
}

interface UploadTicket {
  storagePath: string;
  uploadUrl: string;
  contentType: string;
  roomType: string;
  fileName: string;
}

function officeFallback(message: string): string {
  const phone = BUSINESS_CONTACT.phoneDisplay;
  if (message.includes(phone)) return message;
  return `${message} Please call ${phone}.`;
}

export default function VirtualStagingProOrder() {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [stylePreference, setStylePreference] = useState("Modern");
  const [instructions, setInstructions] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [draft, setDraft] = useState<{
    orderId: string;
    orderNumber: string;
    photoToken: string;
    uploads: UploadTicket[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const incoming = Array.from(e.target.files);
    const accepted: UploadedPhoto[] = [];
    let rejected = "";
    for (const file of incoming) {
      const contentType = normalizeVirtualStagingPhotoType(file.type, file.name);
      if (contentType !== "image/jpeg" && contentType !== "image/png" && contentType !== "image/webp") {
        rejected = "Upload a JPG, PNG, or WebP photo.";
        continue;
      }
      if (file.size < 1 || file.size > VIRTUAL_STAGING_PRO_MAX_PHOTO_BYTES) {
        rejected = "Each photo must be a JPG, PNG, or WebP under 12 MB.";
        continue;
      }
      accepted.push({
        id: Math.random().toString(36).slice(2, 11),
        file,
        preview: URL.createObjectURL(file),
        roomType: "Living Room",
      });
    }
    setPhotos((prev) => [...prev, ...accepted].slice(0, VIRTUAL_STAGING_PRO_MAX_PHOTOS));
    if (photos.length + accepted.length > VIRTUAL_STAGING_PRO_MAX_PHOTOS) {
      rejected = `Send up to ${VIRTUAL_STAGING_PRO_MAX_PHOTOS} photos per order.`;
    }
    setError(rejected ? officeFallback(rejected) : "");
    e.target.value = "";
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((photo) => photo.id !== id));
  };

  const updateRoomType = (id: string, type: string) => {
    setPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, roomType: type } : photo)));
  };

  const submitOrder = async () => {
    setError("");
    if (photos.length === 0) return;
    if (!name.trim() || !email.trim() || !phone.trim() || !address.trim()) {
      setError(officeFallback("Enter your name, email, phone, and property address."));
      return;
    }
    setSubmitting(true);
    let receivedNumber = draft?.orderNumber || "";
    try {
      let current = draft;
      if (!current) {
        const response = await fetch("/api/virtual-staging-pro/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            phone,
            address,
            style: stylePreference,
            instructions,
            companyWebsite,
            photos: photos.map((photo) => ({
              fileName: photo.file.name,
              contentType: normalizeVirtualStagingPhotoType(photo.file.type, photo.file.name),
              roomType: photo.roomType,
              byteSize: photo.file.size,
            })),
          }),
        });
        const data = await response.json().catch(() => null) as {
          success?: boolean;
          error?: string;
          orderNumber?: string;
          orderId?: string;
          photoToken?: string;
          uploads?: UploadTicket[];
        } | null;
        if (!response.ok || !data?.success || !data.orderNumber || !data.orderId || !data.photoToken) {
          throw new Error(typeof data?.error === "string" ? data.error : "We could not submit that order.");
        }
        current = {
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          photoToken: data.photoToken,
          uploads: Array.isArray(data.uploads) ? data.uploads : [],
        };
        receivedNumber = current.orderNumber;
        setDraft(current);
      }
      if (current.uploads.length !== photos.length) {
        throw new Error(`Order ${current.orderNumber} was received, but a photo did not upload.`);
      }
      for (let index = 0; index < current.uploads.length; index += 1) {
        const ticket = current.uploads[index];
        const file = photos[index]?.file;
        if (!ticket?.uploadUrl || !file) {
          throw new Error(`Order ${current.orderNumber} was received, but a photo did not upload.`);
        }
        const put = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": ticket.contentType || file.type || "image/jpeg" },
          body: file,
        });
        if (!put.ok) {
          throw new Error(`Order ${current.orderNumber} was received, but a photo did not upload.`);
        }
      }
      const confirmed = await fetch(`/api/virtual-staging-pro/orders/${encodeURIComponent(current.orderId)}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoToken: current.photoToken,
          photos: current.uploads.map((ticket) => ({ storagePath: ticket.storagePath })),
        }),
      });
      const confirmedBody = await confirmed.json().catch(() => null) as { success?: boolean; error?: string; orderNumber?: string } | null;
      if (!confirmed.ok || !confirmedBody?.success) {
        throw new Error(typeof confirmedBody?.error === "string"
          ? confirmedBody.error
          : `Order ${current.orderNumber} was received, but a photo did not upload.`);
      }
      setOrderNumber(confirmedBody.orderNumber || current.orderNumber);
    } catch (err) {
      const message = err instanceof Error ? err.message : "We could not submit that order.";
      const withNumber = receivedNumber && !message.includes(receivedNumber)
        ? `Order ${receivedNumber} was received, but we could not finish the upload. ${message}`
        : message;
      setError(officeFallback(withNumber));
    } finally {
      setSubmitting(false);
    }
  };

  const total = photos.length * VIRTUAL_STAGING_PRO_UNIT_PRICE;

  if (orderNumber) {
    return (
      <Layout>
        <div className="bg-white">
          <main className="flex-1 pt-24 pb-24 px-4">
            <div className="max-w-xl mx-auto text-center" data-testid="virtual-staging-pro-confirmation">
              <div className="w-20 h-20 bg-[#f0fdfa] rounded-full flex items-center justify-center mx-auto mb-8">
                <CheckCircle2 className="w-10 h-10 text-[#0d9488]" />
              </div>
              <h1 className="text-3xl font-bold mb-4 tracking-tight">Order {orderNumber} received</h1>
              <p className="text-gray-500 mb-4 leading-relaxed">
                No payment was taken. We&apos;ll email your invoice after review.
              </p>
              <p className="text-gray-500 mb-8">
                Questions? Call{" "}
                <a className="underline" href={BUSINESS_CONTACT.phoneHref}>{BUSINESS_CONTACT.phoneDisplay}</a>.
              </p>
              <Link to="/services/virtual-staging">
                <Button className="bg-black text-white hover:bg-gray-800 py-6 px-8 rounded-2xl font-bold">
                  Back to virtual staging
                </Button>
              </Link>
            </div>
          </main>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-white">
        <main className="flex-1 pt-24 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black text-white mb-6 shadow-lg border border-black">
                <UserCheck className="w-4 h-4 text-white" />
                <span className="text-[10px] font-bold tracking-widest uppercase accent-text-bordered">Professional Staging</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Submit to <span className="accent-text-bordered">Iconic Professionals</span></h1>
              <p className="text-gray-500 max-w-2xl mx-auto text-lg">Our design team will manually stage your photos for the highest possible quality and realism.</p>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void submitOrder(); }}>
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label htmlFor="vs-pro-company">Company website</label>
              <input
                id="vs-pro-company"
                name="companyWebsite"
                tabIndex={-1}
                autoComplete="off"
                value={companyWebsite}
                onChange={(event) => setCompanyWebsite(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2 space-y-8">
                <div className="p-8 rounded-[2rem] bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <LayoutGrid className="w-6 h-6 text-[#0d9488]" />
                      Your Photos ({photos.length})
                    </h3>
                    <Button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="rounded-xl border-gray-200"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Add More
                    </Button>
                    <input
                      type="file"
                      multiple
                      ref={fileInputRef}
                      className="hidden"
                      data-testid="virtual-staging-pro-files"
                      onChange={handleUpload}
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    />
                  </div>

                  {photos.length === 0 ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-200 rounded-[2rem] p-20 flex flex-col items-center justify-center cursor-pointer hover:border-[#0d9488] transition-all bg-white group"
                    >
                      <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-6 group-hover:bg-[#f0fdfa] transition-colors">
                        <Camera className="w-10 h-10 text-gray-300 group-hover:text-[#0d9488]" />
                      </div>
                      <p className="text-lg font-bold text-gray-900 mb-2">Drag and drop multiple files</p>
                      <p className="text-gray-500">High-resolution JPG or PNG preferred</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {photos.map((photo) => (
                        <div key={photo.id} className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm flex flex-col h-full group">
                          <div className="relative aspect-video">
                            <img src={photo.preview} className="w-full h-full object-cover" alt="Upload" />
                            <button
                              type="button"
                              onClick={() => removePhoto(photo.id)}
                              className="absolute top-3 right-3 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="p-5 flex flex-col gap-4">
                            <div>
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Room Type</label>
                              <select
                                value={photo.roomType}
                                onChange={(event) => updateRoomType(photo.id, event.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488]"
                              >
                                {VIRTUAL_STAGING_PRO_ROOM_TYPES.map((room) => <option key={room} value={room}>{room}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-8 rounded-[2rem] bg-gray-50 border border-gray-100">
                  <h3 className="text-xl font-bold mb-8">Contact and property</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="text-sm font-bold text-gray-700 block">
                      Name
                      <input id="vs-pro-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-normal focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488]" />
                    </label>
                    <label className="text-sm font-bold text-gray-700 block">
                      Email
                      <input id="vs-pro-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-normal focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488]" />
                    </label>
                    <label className="text-sm font-bold text-gray-700 block">
                      Phone
                      <input id="vs-pro-phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-normal focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488]" />
                    </label>
                    <label className="text-sm font-bold text-gray-700 block md:col-span-2">
                      Property address
                      <input id="vs-pro-address" autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} className="mt-2 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-normal focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488]" />
                    </label>
                  </div>
                </div>

                <div className="p-8 rounded-[2rem] bg-gray-50 border border-gray-100">
                  <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                    <MessageSquare className="w-6 h-6 text-[#0d9488]" />
                    Additional Details
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-3">Overall Style Preference</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {VIRTUAL_STAGING_PRO_STYLES.map((style) => (
                          <button
                            key={style}
                            type="button"
                            onClick={() => setStylePreference(style)}
                            className={`px-4 py-3 rounded-xl text-[13px] font-medium border transition-all ${
                              stylePreference === style ? "bg-black text-white border-black shadow-lg" : "bg-white border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            {style}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-3" htmlFor="vs-pro-instructions">Special Instructions (Optional)</label>
                      <textarea
                        id="vs-pro-instructions"
                        rows={4}
                        placeholder="E.g. Use dark wood furniture, add a rug to the living room, etc."
                        className="w-full bg-white border border-gray-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all resize-none"
                        value={instructions}
                        onChange={(event) => setInstructions(event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="p-8 rounded-[2rem] bg-black text-white sticky top-32 shadow-2xl">
                  <h3 className="text-xl font-bold mb-8">Order Summary</h3>
                  <div className="space-y-6 mb-8">
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Pro Staging ({photos.length} photos)</span>
                      <span className="text-white font-bold">${total}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Style Match</span>
                      <span className="accent-text-bordered font-bold">Included</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Revision Protection</span>
                      <span className="accent-text-bordered font-bold">Included</span>
                    </div>
                    <div className="pt-6 border-t border-white/10 flex justify-between items-center">
                      <span className="text-lg font-bold">Total Cost</span>
                      <span className="text-3xl font-bold accent-text-bordered">${total}</span>
                    </div>
                    <p className="text-[11px] text-gray-400">No payment today. We&apos;ll email your invoice after review.</p>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <CheckCircle2 className="w-4 h-4 text-[#0d9488]" />
                      24-48 hour turnaround
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <CheckCircle2 className="w-4 h-4 text-[#0d9488]" />
                      Professional designer review
                    </div>
                  </div>

                  {error ? (
                    <p className="mb-4 text-sm text-red-300" data-testid="virtual-staging-pro-error" role="alert">
                      {error}{" "}
                      <a className="underline" href={BUSINESS_CONTACT.phoneHref}>Call the office</a>
                    </p>
                  ) : null}

                  <Button
                    type="submit"
                    data-testid="virtual-staging-pro-submit"
                    disabled={photos.length === 0 || submitting}
                    className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white py-8 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 group border-none shadow-lg shadow-teal-900/50"
                  >
                    {submitting ? "Submitting..." : "Submit Order"}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>

                  <p className="mt-6 text-center text-[11px] text-gray-500">
                    By submitting, you agree to Iconic&apos;s{" "}
                    <Link to="/terms" className="underline">Terms and Conditions</Link>
                    {" "}and{" "}
                    <Link to="/privacy" className="underline">Privacy Policy</Link>.
                  </p>
                </div>
              </div>
            </div>
            </form>
          </div>
        </div>
      </main>
      </div>
    </Layout>
  );
}
