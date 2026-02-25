import { useState, useRef } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Upload, Camera, ChevronDown, Check, RefreshCw, ShoppingCart, Sparkles, Image as ImageIcon } from "lucide-react";

export default function VirtualStagingAITool() {
  const [file, setFile] = useState<File | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [style, setStyle] = useState("Modern");
  const [roomType, setRoomType] = useState("Living Room");
  const [sliderPos, setSliderPos] = useState(50);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const startRender = () => {
    setIsRendering(true);
    setTimeout(() => {
      setIsRendering(false);
      setIsDone(true);
    }, 4000);
  };

  const reset = () => {
    setFile(null);
    setIsDone(false);
    setIsRendering(false);
  };

  const styles = ["Modern", "Contemporary", "Traditional", "Industrial", "Luxury", "Minimalist"];
  const roomTypes = ["Living Room", "Bedroom", "Dining Room", "Office", "Kitchen", "Patio"];

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
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Try AI Staging <span className="text-[#0d9488]">for Free</span></h1>
              </div>
              <div className="flex gap-4">
                 <Button variant="ghost" onClick={reset} className="text-gray-500 hover:text-black">Reset</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              
              {/* Left Column: Editor Controls */}
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
                <div className={`p-6 rounded-3xl bg-gray-50 border border-gray-100 transition-opacity ${!file ? 'opacity-50 pointer-events-none' : ''}`}>
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-black text-white text-[12px] flex items-center justify-center">2</span>
                    Set Preferences
                  </h3>

                  <div className="space-y-6">
                    <div>
                      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block mb-3">Room Type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {roomTypes.map(r => (
                          <button
                            key={r}
                            onClick={() => setRoomType(r)}
                            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
                              roomType === r ? 'bg-black text-white border-black shadow-lg' : 'bg-white border-gray-200 hover:border-gray-300'
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
                        {styles.map(s => (
                          <button
                            key={s}
                            onClick={() => setStyle(s)}
                            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${
                              style === s ? 'bg-[#0d9488] text-white border-[#0d9488] shadow-lg shadow-teal-100' : 'bg-white border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={startRender}
                  disabled={!file || isRendering || isDone}
                  className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white py-8 rounded-2xl font-bold text-lg shadow-xl shadow-teal-100 disabled:bg-gray-200 disabled:shadow-none transition-all"
                >
                  {isRendering ? (
                    <div className="flex items-center gap-3">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      Rendering...
                    </div>
                  ) : isDone ? (
                    <div className="flex items-center gap-2">
                      <Check className="w-6 h-6" />
                      Rendering Complete
                    </div>
                  ) : (
                    "Render Photo"
                  )}
                </Button>
              </div>

              {/* Right Column: Interactive Canvas */}
              <div className="lg:col-span-8 flex flex-col h-full">
                <div className="relative flex-1 rounded-[2.5rem] overflow-hidden bg-gray-100 border-[10px] border-gray-50 shadow-2xl min-h-[400px]">
                  
                  {/* Empty State */}
                  {!file && !isRendering && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 shadow-sm border border-gray-100 text-gray-300">
                        <Camera className="w-10 h-10" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Ready to stage?</h3>
                      <p className="text-gray-500 max-w-sm">Upload a photo to see the magic happen. High quality, wide angle shots work best.</p>
                    </div>
                  )}

                  {/* Rendering State */}
                  {isRendering && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-12 text-center bg-black/40 backdrop-blur-sm">
                       <div className="relative w-32 h-32 mb-8">
                          <div className="absolute inset-0 rounded-full border-4 border-[#0d9488]/20 border-t-[#0d9488] animate-spin"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                             <Sparkles className="w-12 h-12 text-[#0d9488]" />
                          </div>
                       </div>
                       <h3 className="text-2xl font-bold text-white mb-2">Analyzing your space...</h3>
                       <p className="text-gray-300">Applying {style} style to your {roomType}.</p>
                    </div>
                  )}

                  {/* Results: Slider View */}
                  {isDone && (
                    <div className="absolute inset-0 z-10 select-none">
                      {/* Before (Original) */}
                      <img 
                        src={URL.createObjectURL(file!)} 
                        className="absolute inset-0 w-full h-full object-cover"
                        alt="Original"
                      />
                      
                      {/* After (Staged) */}
                      <div 
                        className="absolute inset-0 overflow-hidden"
                        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                      >
                         <img 
                          src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80" 
                          className="absolute inset-0 w-full h-full object-cover"
                          alt="Staged"
                        />
                      </div>

                      {/* Slider Control */}
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

                      {/* Invisible Input for Slider */}
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={sliderPos}
                        onChange={(e) => setSliderPos(parseInt(e.target.value))}
                        className="absolute inset-0 opacity-0 cursor-ew-resize z-30"
                      />

                      {/* Labels */}
                      <div className="absolute top-6 left-6 z-40 bg-white/80 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-bold uppercase border border-white/40">Before</div>
                      <div className="absolute top-6 right-6 z-40 bg-[#0d9488]/80 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-bold uppercase text-white border border-[#0d9488]/20">After: {style}</div>
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                {isDone && (
                  <div className="mt-8 flex flex-col sm:flex-row gap-4">
                    <Button 
                      onClick={() => { setIsDone(false); startRender(); }}
                      variant="outline"
                      className="flex-1 py-7 rounded-2xl border-2 border-gray-100 font-bold flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-5 h-5" />
                      Regenerate
                    </Button>
                    <Button 
                      className="flex-[2] bg-black text-white hover:bg-gray-800 py-7 rounded-2xl font-bold text-lg flex items-center justify-center gap-2"
                    >
                      <ShoppingCart className="w-6 h-6" />
                      Purchase Full-Res Result
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
