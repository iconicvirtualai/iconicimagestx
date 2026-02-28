import * as React from "react";
import { 
  X, 
  Download, 
  Archive, 
  Send, 
  Settings2, 
  Moon, 
  Layout, 
  RotateCcw, 
  Eye, 
  Plus, 
  Crop, 
  Maximize, 
  Sparkles,
  Smartphone,
  Video,
  Image as ImageIcon,
  Check,
  ChevronRight,
  Monitor,
  Flame,
  Edit3
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";

interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
}

export default function ImageEditorModal({ isOpen, onClose, imageUrl }: ImageEditorModalProps) {
  const [activeTab, setActiveTab] = React.useState("adjust");
  const [activeStyle, setActiveStyle] = React.useState("signature");
  const [activeRatio, setActiveRatio] = React.useState("original");
  const [activeSky, setActiveSky] = React.useState("Sunset");
  const [activeRoom, setActiveRoom] = React.useState("Living Room");
  const [activeFurniture, setActiveFurniture] = React.useState("Modern");

  // Adjustments State
  const [adjustments, setAdjustments] = React.useState({
    exposure: 0,
    contrast: 0,
    temp: 0,
    tint: 0,
    saturation: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    sharpening: 0
  });

  const [options, setOptions] = React.useState({
    autoPerspective: true,
    upscale: false
  });

  const resetAdjustments = () => {
    setAdjustments({
      exposure: 0,
      contrast: 0,
      temp: 0,
      tint: 0,
      saturation: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      sharpening: 0
    });
  };

  const applyPreset = (style: string) => {
    setActiveStyle(style);
    if (style === 'signature') {
      setAdjustments({
        ...adjustments,
        exposure: 10,
        contrast: 15,
        saturation: 5,
        highlights: -10
      });
    } else {
      setAdjustments({
        ...adjustments,
        exposure: 5,
        contrast: 5,
        saturation: 0,
        highlights: 0
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[100vw] w-screen h-screen p-0 border-none bg-black/95 gap-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="sr-only">
          <DialogTitle>Photo Editor</DialogTitle>
          <DialogDescription>Edit and enhance listing photos with AI tools and manual adjustments.</DialogDescription>
        </div>
        
        {/* Top Header */}
        <div className="h-14 flex items-center justify-between px-6 bg-white border-b border-slate-100 z-50">
          <div className="flex items-center gap-4">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">Photo Editor</h2>
            <div className="h-4 w-[1px] bg-slate-200"></div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">IMG_8245_FINAL.JPG</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button onClick={resetAdjustments} size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-50 text-slate-400"><RotateCcw className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-50 text-slate-400"><Download className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-50 text-slate-400"><Archive className="w-3.5 h-3.5" /></Button>
            <div className="w-[1px] h-5 bg-slate-100 mx-1"></div>
            <Button className="bg-[#ff4d6d] hover:bg-[#ff4d6d]/90 text-white font-black text-[10px] px-4 h-8 rounded-lg shadow-lg shadow-pink-100">
              <Send className="w-3.5 h-3.5 mr-2" /> DELIVER
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-slate-50 text-slate-400 ml-1" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Main Image View */}
          <div className="flex-1 flex items-center justify-center p-8 bg-slate-900 relative group">
            <img 
              src={imageUrl} 
              alt="Preview" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-sm transition-transform duration-500" 
            />
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="p-1.5 hover:bg-white/10 rounded-full text-white"><Maximize className="w-3.5 h-3.5" /></button>
              <div className="w-px h-3 bg-white/20"></div>
              <button className="p-1.5 hover:bg-white/10 rounded-full text-white font-bold text-[10px]">100%</button>
              <div className="w-px h-3 bg-white/20"></div>
              <button className="p-1.5 hover:bg-white/10 rounded-full text-white"><Crop className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-[340px] bg-white border-l border-slate-100 flex flex-col relative z-50">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex">
              
              {/* Vertical Tab Navigation */}
              <div className="w-14 border-r border-slate-100 flex flex-col items-center py-4 gap-4">
                <TabsList className="flex flex-col bg-transparent h-auto gap-4 w-full p-0">
                  <TabsTrigger value="adjust" className="p-0 bg-transparent data-[state=active]:bg-transparent shadow-none group relative w-full flex justify-center">
                    <div className="p-2 rounded-lg transition-all duration-300 group-data-[state=active]:bg-[#0d9488]/10 group-data-[state=active]:text-[#0d9488] text-slate-300">
                      <Settings2 className="w-4 h-4" />
                    </div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#0d9488] opacity-0 group-data-[state=active]:opacity-100 rounded-l-full"></div>
                  </TabsTrigger>
                  
                  <TabsTrigger value="sky" className="p-0 bg-transparent data-[state=active]:bg-transparent shadow-none group relative w-full flex justify-center">
                    <div className="p-2 rounded-lg transition-all duration-300 group-data-[state=active]:bg-[#0d9488]/10 group-data-[state=active]:text-[#0d9488] text-slate-300 relative">
                      <Moon className="w-4 h-4" />
                      <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-pink-500 rounded-full border border-white"></div>
                    </div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#0d9488] opacity-0 group-data-[state=active]:opacity-100 rounded-l-full"></div>
                  </TabsTrigger>
                  
                  <TabsTrigger value="staging" className="p-0 bg-transparent data-[state=active]:bg-transparent shadow-none group relative w-full flex justify-center">
                    <div className="p-2 rounded-lg transition-all duration-300 group-data-[state=active]:bg-[#0d9488]/10 group-data-[state=active]:text-[#0d9488] text-slate-300 relative">
                      <Layout className="w-4 h-4" />
                      <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-pink-500 rounded-full border border-white"></div>
                    </div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#0d9488] opacity-0 group-data-[state=active]:opacity-100 rounded-l-full"></div>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-5 space-y-8">
                    
                    <TabsContent value="adjust" className="m-0 space-y-8 focus-visible:outline-none">
                      {/* FOTON 6.0 STYLES */}
                      <section>
                        <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">FOTON 6.0 STYLES</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { id: 'signature', label: 'Signature', icon: <Sparkles className="w-4 h-4" /> },
                            { id: 'natural', label: 'Natural', icon: <Plus className="w-4 h-4" /> }
                          ].map((style) => (
                            <button 
                              key={style.id}
                              onClick={() => applyPreset(style.id)}
                              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-300 ${
                                activeStyle === style.id 
                                ? 'bg-[#0d9488]/5 border-[#0d9488] shadow-sm' 
                                : 'border-slate-100 hover:border-slate-300'
                              }`}
                            >
                              <div className={`p-3 rounded-xl ${activeStyle === style.id ? 'bg-[#0d9488]/10 text-[#0d9488]' : 'bg-slate-50 text-slate-400'}`}>
                                {style.icon}
                              </div>
                              <span className={`text-[9px] font-bold uppercase tracking-widest ${activeStyle === style.id ? 'text-[#0d9488]' : 'text-slate-500'}`}>{style.label}</span>
                            </button>
                          ))}
                        </div>
                      </section>

                      {/* MY PROFILES */}
                      <section>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                            MY PROFILES <Eye className="w-3.5 h-3.5 text-slate-300" />
                          </h3>
                          <div className="flex items-center gap-2">
                            <button className="text-[8px] font-bold text-slate-400 hover:text-black uppercase tracking-widest transition-colors">Apply to all</button>
                            <button onClick={resetAdjustments} className="p-1 hover:bg-slate-100 rounded-md transition-colors"><RotateCcw className="w-3.5 h-3.5 text-slate-300" /></button>
                          </div>
                        </div>
                        <div className="flex gap-3 pb-2 overflow-x-auto custom-scrollbar">
                          <button className="min-w-[80px] aspect-square rounded-xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-1.5 text-slate-300 hover:border-[#0d9488]/30 hover:text-[#0d9488]/50 transition-all">
                            <Plus className="w-4 h-4" />
                            <span className="text-[8px] font-black uppercase tracking-widest">Create</span>
                          </button>
                          {[
                            { name: 'Airy', img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=100&q=80' },
                            { name: 'Crisp', img: 'https://images.unsplash.com/photo-1600585154341-be6161a56a0c?w=100&q=80' },
                            { name: 'Gold', img: 'https://images.unsplash.com/photo-1600585154342-be6161a56a0c?w=100&q=80' }
                          ].map((profile, i) => (
                            <div key={i} className="min-w-[80px] flex flex-col gap-2 group">
                              <div className="aspect-square rounded-xl overflow-hidden border-2 border-transparent group-hover:border-[#0d9488] transition-all cursor-pointer">
                                <img src={profile.img} className="w-full h-full object-cover" alt={profile.name} />
                              </div>
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center">{profile.name}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* ADJUSTMENTS GROUPS */}
                      <div className="space-y-6">
                        {/* Basic */}
                        <AdjustmentGroup 
                          label="BASIC" 
                          sliders={[
                            { label: 'Exposure', key: 'exposure' },
                            { label: 'Contrast', key: 'contrast' }
                          ]} 
                          values={adjustments}
                          onChange={(key, val) => setAdjustments({...adjustments, [key]: val})}
                        />
                        
                        {/* Color */}
                        <AdjustmentGroup 
                          label="COLOR" 
                          sliders={[
                            { label: 'Temp', key: 'temp' },
                            { label: 'Tint', key: 'tint' },
                            { label: 'Saturation', key: 'saturation' }
                          ]} 
                          values={adjustments}
                          onChange={(key, val) => setAdjustments({...adjustments, [key]: val})}
                        />
                        
                        {/* Tone */}
                        <AdjustmentGroup 
                          label="TONE" 
                          sliders={[
                            { label: 'Highlights', key: 'highlights' },
                            { label: 'Shadows', key: 'shadows' },
                            { label: 'Whites', key: 'whites' },
                            { label: 'Blacks', key: 'blacks' }
                          ]} 
                          values={adjustments}
                          onChange={(key, val) => setAdjustments({...adjustments, [key]: val})}
                        />
                        
                        {/* Detail */}
                        <AdjustmentGroup 
                          label="DETAIL" 
                          sliders={[
                            { label: 'Sharpening', key: 'sharpening' }
                          ]} 
                          values={adjustments}
                          onChange={(key, val) => setAdjustments({...adjustments, [key]: val})}
                        />
                      </div>

                      {/* ASPECT RATIO */}
                      <section>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest">ASPECT RATIO</h3>
                          <button className="p-1 hover:bg-slate-100 rounded-md transition-colors"><Maximize className="w-3.5 h-3.5 text-slate-300" /></button>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {[
                            { id: 'original', label: 'Original', icon: <ImageIcon className="w-3.5 h-3.5" /> },
                            { id: 'freeform', label: 'Freeform', icon: <Crop className="w-3.5 h-3.5" /> },
                            { id: '3:2', label: '3:2', icon: <div className="w-3.5 h-2 bg-slate-400/20 border border-slate-400/40 rounded-sm"></div> },
                            { id: '4:3', label: '4:3', icon: <div className="w-3 h-2.5 bg-slate-400/20 border border-slate-400/40 rounded-sm"></div> },
                            { id: '16:9', label: '16:9', icon: <div className="w-4 h-1.5 bg-slate-400/20 border border-slate-400/40 rounded-sm"></div> }
                          ].map((ratio) => (
                            <button 
                              key={ratio.id} 
                              onClick={() => setActiveRatio(ratio.id)}
                              className={`flex flex-col items-center gap-2 p-2.5 rounded-xl border transition-all group ${
                                activeRatio === ratio.id ? 'bg-[#0d9488]/5 border-[#0d9488]' : 'border-slate-50 hover:border-slate-200'
                              }`}
                            >
                              <div className={`p-2.5 rounded-lg transition-colors ${
                                activeRatio === ratio.id ? 'bg-[#0d9488]/10 text-[#0d9488]' : 'bg-slate-50 text-slate-400 group-hover:text-slate-600'
                              }`}>
                                {ratio.icon}
                              </div>
                              <span className={`text-[8px] font-black uppercase tracking-tighter ${
                                activeRatio === ratio.id ? 'text-[#0d9488]' : 'text-slate-500'
                              }`}>{ratio.label}</span>
                            </button>
                          ))}
                        </div>
                      </section>

                      {/* REMOVE TOOL */}
                      <section>
                        <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">REMOVE TOOL</h3>
                        <Button className="w-full h-10 bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 font-black text-[9px] uppercase tracking-widest rounded-xl shadow-sm">
                          Start Removing
                        </Button>
                      </section>

                      {/* OPTIONS */}
                      <section className="space-y-3">
                        <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">OPTIONS</h3>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500 tracking-tight">Auto Perspective Correction</span>
                          <Switch 
                            checked={options.autoPerspective} 
                            onCheckedChange={(checked) => setOptions({...options, autoPerspective: checked})}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 tracking-tight">Upscale with Topaz Gigapixel</span>
                            <span className="px-1.5 py-0.5 bg-[#ff4d6d] text-white text-[6px] font-black uppercase rounded-full">New</span>
                          </div>
                          <Switch 
                            checked={options.upscale}
                            onCheckedChange={(checked) => setOptions({...options, upscale: checked})}
                          />
                        </div>
                      </section>

                      {/* PERSONALIZED TV SCREEN */}
                      <section>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest">PERSONALIZED TV SCREEN</h3>
                          <button className="p-1 hover:bg-slate-100 rounded-md transition-colors"><RotateCcw className="w-3 h-3 text-slate-300" /></button>
                        </div>
                        <div className="flex gap-3 pb-2 overflow-x-auto custom-scrollbar">
                          <button className="min-w-[80px] aspect-square rounded-xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-1.5 text-slate-300 hover:border-[#0d9488]/30 hover:text-[#0d9488]/50 transition-all">
                            <Plus className="w-4 h-4" />
                            <span className="text-[8px] font-black uppercase tracking-widest">Upload</span>
                          </button>
                          {[
                            { name: 'Exterior View', img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=100&q=80' },
                            { name: 'Midnight Fade', img: 'https://images.unsplash.com/photo-1600585154341-be6161a56a0c?w=100&q=80' },
                            { name: 'Palm Breeze', img: 'https://images.unsplash.com/photo-1600585154342-be6161a56a0c?w=100&q=80' }
                          ].map((tv, i) => (
                            <div key={i} className="min-w-[80px] flex flex-col gap-2 group">
                              <div className="aspect-square rounded-xl overflow-hidden border-2 border-transparent group-hover:border-[#0d9488] transition-all cursor-pointer relative">
                                <img src={tv.img} className="w-full h-full object-cover" alt={tv.name} />
                                <div className="absolute top-1 right-1 p-1 bg-white/90 backdrop-blur-sm rounded-md shadow-sm text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Edit3 className="w-2.5 h-2.5" />
                                </div>
                              </div>
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center truncate">{tv.name}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* FIREPLACE */}
                      <section>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest">FIREPLACE</h3>
                          <button className="p-1 hover:bg-slate-100 rounded-md transition-colors"><RotateCcw className="w-3 h-3 text-slate-300" /></button>
                        </div>
                        <div className="flex gap-3 pb-2 overflow-x-auto custom-scrollbar">
                          <button className="min-w-[80px] aspect-square rounded-xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-1.5 text-slate-300 hover:border-[#0d9488]/30 hover:text-[#0d9488]/50 transition-all">
                            <Plus className="w-4 h-4" />
                            <span className="text-[8px] font-black uppercase tracking-widest">Upload</span>
                          </button>
                          {[
                            { name: 'Cottage Flame', img: 'https://images.unsplash.com/photo-1542332213-31f87348057f?w=100&q=80' },
                            { name: 'Panorama Glow', img: 'https://images.unsplash.com/photo-1516594798947-e65505dbb29d?w=100&q=80' }
                          ].map((fire, i) => (
                            <div key={i} className="min-w-[80px] flex flex-col gap-2 group">
                              <div className="aspect-square rounded-xl overflow-hidden border-2 border-transparent group-hover:border-[#0d9488] transition-all cursor-pointer">
                                <img src={fire.img} className="w-full h-full object-cover" alt={fire.name} />
                              </div>
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center truncate">{fire.name}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* DID THE AI MAKE A MISTAKE? */}
                      <section className="pt-4 border-t border-slate-100">
                        <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">DID THE AI MAKE A MISTAKE?</h3>
                        <div className="space-y-3">
                          <textarea
                            rows={3}
                            placeholder="Please describe the issue clearly and our experts will fix it quickly"
                            className="w-full p-3 rounded-xl border border-slate-100 bg-slate-50/50 text-[10px] font-medium focus:ring-2 focus:ring-[#0d9488]/20 outline-none resize-none"
                          ></textarea>
                          <button className="text-[9px] font-bold text-red-500 hover:underline underline-offset-4 tracking-tight">Remove watermark to enable revisions</button>
                        </div>
                      </section>
                    </TabsContent>

                    <TabsContent value="sky" className="m-0 space-y-8 focus-visible:outline-none">
                      <section>
                        <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">SKY STYLE</h3>
                        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                          <button className="min-w-[110px] aspect-[4/3] rounded-xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-1.5 text-slate-300 hover:border-[#0d9488]/30 hover:text-[#0d9488]/50 transition-all">
                            <Plus className="w-4 h-4" />
                            <span className="text-[8px] font-black uppercase tracking-widest">Upload</span>
                          </button>
                          {[
                            { name: 'Twilight', img: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=200&q=80' },
                            { name: 'Sunset', img: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=200&q=80' },
                            { name: 'Daylight', img: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=200&q=80' }
                          ].map((sky, i) => (
                            <div key={i} className="min-w-[110px] flex flex-col gap-2 group">
                              <div 
                                onClick={() => setActiveSky(sky.name)}
                                className={`aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                                  activeSky === sky.name ? 'border-[#0d9488]' : 'border-transparent group-hover:border-[#0d9488]/50'
                                }`}
                              >
                                <img src={sky.img} className="w-full h-full object-cover" alt={sky.name} />
                              </div>
                              <span className={`text-[9px] font-bold uppercase tracking-widest text-center ${
                                activeSky === sky.name ? 'text-[#0d9488]' : 'text-slate-500'
                              }`}>{sky.name}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">VARIATIONS</h3>
                        <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6 space-y-3">
                          {[
                            "Select a sky style or upload yours.",
                            "Click Create to get twilight variations.",
                            "Choose one and personalize it for delivery."
                          ].map((step, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="text-[10px] font-black text-slate-300">{i + 1}.</span>
                              <p className="text-[10px] font-bold text-slate-500 tracking-tight leading-relaxed">{step}</p>
                            </div>
                          ))}
                          <Button className="w-full h-10 bg-[#ff4d6d] hover:bg-[#ff4d6d]/90 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-pink-100 mt-2">
                            <Sparkles className="w-3.5 h-3.5 mr-2" /> Create
                          </Button>
                        </div>
                      </section>
                    </TabsContent>

                    <TabsContent value="staging" className="m-0 space-y-8 focus-visible:outline-none">
                      <section>
                        <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">ROOM TYPE</h3>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { name: 'Living Room', icon: <Monitor className="w-4 h-4" /> },
                            { name: 'Bedroom', icon: <Layout className="w-4 h-4" /> },
                            { name: 'Kitchen', icon: <Plus className="w-4 h-4" /> },
                            { name: 'Dining', icon: <ChevronRight className="w-4 h-4" /> }
                          ].map((room, i) => (
                            <button 
                              key={i} 
                              onClick={() => setActiveRoom(room.name)}
                              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                                activeRoom === room.name ? 'bg-[#0d9488]/5 border-[#0d9488]' : 'border-slate-50 hover:border-slate-200'
                              }`}
                            >
                              <div className={`p-2.5 rounded-lg ${
                                activeRoom === room.name ? 'bg-[#0d9488]/10 text-[#0d9488]' : 'bg-slate-50 text-slate-300'
                              }`}>
                                {room.icon}
                              </div>
                              <span className={`text-[7px] font-black uppercase tracking-tighter ${
                                activeRoom === room.name ? 'text-[#0d9488]' : 'text-slate-500'
                              }`}>{room.name}</span>
                            </button>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">FURNITURE STYLE</h3>
                        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                          {[
                            { name: 'Modern', img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=200&q=80' },
                            { name: 'Scandinavian', img: 'https://images.unsplash.com/photo-1600585154341-be6161a56a0c?w=200&q=80' },
                            { name: 'Industrial', img: 'https://images.unsplash.com/photo-1600585154342-be6161a56a0c?w=200&q=80' }
                          ].map((style, i) => (
                            <div key={i} className="min-w-[110px] flex flex-col gap-2 group">
                              <div 
                                onClick={() => setActiveFurniture(style.name)}
                                className={`aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                                  activeFurniture === style.name ? 'border-[#0d9488]' : 'border-transparent group-hover:border-[#0d9488]/50'
                                }`}
                              >
                                <img src={style.img} className="w-full h-full object-cover" alt={style.name} />
                              </div>
                              <span className={`text-[9px] font-bold uppercase tracking-widest text-center ${
                                activeFurniture === style.name ? 'text-[#0d9488]' : 'text-slate-500'
                              }`}>{style.name}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">VARIATIONS</h3>
                        <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-6 space-y-3">
                          {[
                            "Select room type and furniture style.",
                            "Click Create to get staging variations.",
                            "Choose one and personalize it for delivery."
                          ].map((step, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="text-[10px] font-black text-slate-300">{i + 1}.</span>
                              <p className="text-[10px] font-bold text-slate-500 tracking-tight leading-relaxed">{step}</p>
                            </div>
                          ))}
                          <Button className="w-full h-10 bg-[#ff4d6d] hover:bg-[#ff4d6d]/90 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-pink-100 mt-2">
                            <Sparkles className="w-3.5 h-3.5 mr-2" /> Create
                          </Button>
                        </div>
                      </section>
                    </TabsContent>

                  </div>
                </ScrollArea>
              </div>

            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface AdjustmentGroupProps {
  label: string;
  sliders: { label: string; key: string }[];
  values: any;
  onChange: (key: string, val: number) => void;
}

function AdjustmentGroup({ label, sliders, values, onChange }: AdjustmentGroupProps) {
  return (
    <section>
      <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-4">{label}</h3>
      <div className="space-y-5">
        {sliders.map((slider, i) => (
          <div key={i} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 tracking-tight">{slider.label}</span>
              <span className="text-[10px] font-bold text-slate-900">{values[slider.key]}</span>
            </div>
            <Slider 
              value={[values[slider.key]]} 
              onValueChange={(val) => onChange(slider.key, val[0])}
              max={100} 
              min={-100}
              step={1} 
              className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border-2 [&_[role=slider]]:border-[#0d9488] [&_[role=slider]]:bg-white [&_.relative]:h-0.5 [&_.relative]:bg-slate-100 [&_[data-orientation=horizontal]_div:first-child]:bg-[#0d9488]" 
            />
          </div>
        ))}
      </div>
    </section>
  );
}
