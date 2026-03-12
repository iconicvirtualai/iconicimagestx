import { useState, useRef } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Upload, Camera, Trash2, LayoutGrid, CheckCircle2, ChevronRight, UserCheck, ArrowRight, MessageSquare } from "lucide-react";

interface UploadedPhoto {
  id: string;
  file: File;
  preview: string;
  roomType: string;
}

export default function VirtualStagingProOrder() {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [stylePreference, setStylePreference] = useState("Modern");
  const [instructions, setInstructions] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const newPhotos: UploadedPhoto[] = newFiles.map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
        roomType: "Living Room"
      }));
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const updateRoomType = (id: string, type: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, roomType: type } : p));
  };

  const styles = ["Modern", "Contemporary", "Traditional", "Industrial", "Luxury", "Minimalist", "Scandinavian", "Farmhouse"];
  const roomTypes = ["Living Room", "Bedroom", "Dining Room", "Office", "Kitchen", "Patio", "Other"];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <main className="flex-1 pt-32 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            
            {/* Header */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black text-white mb-6 shadow-lg border border-black">
                <UserCheck className="w-4 h-4 text-white" />
                <span className="text-[10px] font-bold tracking-widest uppercase accent-text-bordered">Professional Staging</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Submit to <span className="accent-text-bordered">Iconic Professionals</span></h1>
              <p className="text-gray-500 max-w-2xl mx-auto text-lg">Our design team will manually stage your photos for the highest possible quality and realism.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              
              {/* Left Side: Uploads & Photo Settings */}
              <div className="lg:col-span-2 space-y-8">
                
                {/* Upload Area */}
                <div className="p-8 rounded-[2rem] bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <LayoutGrid className="w-6 h-6 text-[#0d9488]" />
                      Your Photos ({photos.length})
                    </h3>
                    <Button 
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
                      onChange={handleUpload}
                      accept="image/*"
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
                                onChange={(e) => updateRoomType(photo.id, e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488]"
                              >
                                {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Additional Details */}
                <div className="p-8 rounded-[2rem] bg-gray-50 border border-gray-100">
                  <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                    <MessageSquare className="w-6 h-6 text-[#0d9488]" />
                    Additional Details
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-3">Overall Style Preference</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {styles.map(s => (
                          <button
                            key={s}
                            onClick={() => setStylePreference(s)}
                            className={`px-4 py-3 rounded-xl text-[13px] font-medium border transition-all ${
                              stylePreference === s ? 'bg-black text-white border-black shadow-lg' : 'bg-white border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-3">Special Instructions (Optional)</label>
                      <textarea 
                        rows={4}
                        placeholder="E.g. Use dark wood furniture, add a rug to the living room, etc."
                        className="w-full bg-white border border-gray-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all resize-none"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Summary & Checkout */}
              <div className="lg:col-span-1">
                <div className="p-8 rounded-[2rem] bg-black text-white sticky top-32 shadow-2xl">
                  <h3 className="text-xl font-bold mb-8">Order Summary</h3>
                  
                  <div className="space-y-6 mb-8">
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Pro Staging ({photos.length} photos)</span>
                      <span className="text-white font-bold">${photos.length * 25}</span>
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
                      <span className="text-3xl font-bold accent-text-bordered">${photos.length * 25}</span>
                    </div>
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

                  <Button 
                    disabled={photos.length === 0}
                    className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white py-8 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 group border-none shadow-lg shadow-teal-900/50"
                  >
                    Submit Order
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  
                  <p className="mt-6 text-center text-[11px] text-gray-500">
                    By submitting, you agree to Iconic's <span className="underline cursor-pointer">Terms of Service</span>.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
