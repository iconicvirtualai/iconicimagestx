import * as React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import {
  Palette,
  Home,
  Tag,
  Share2,
  Globe,
  Save,
  Image as ImageIcon,
  Eye,
  Layout,
  Type,
  Component,
  Plus,
  Mail
} from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_SITE_SETTINGS } from "@/hooks/useSiteSettings";

export default function AdminSiteCustomizer() {
  const [settings, setSettings] = React.useState(DEFAULT_SITE_SETTINGS);

  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        // First try to see if we have them in the server (the persistent ones)
        // Using a short timeout to avoid long waits on network issues
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 3000);

        try {
          const res = await fetch("/api/settings", { signal: controller.signal });
          clearTimeout(id);

          if (res && res.ok) {
            const serverSettings = await res.json();
            setSettings(serverSettings);
          }
        } catch (fetchError) {
          // If fetch fails (network error, abort), we just fall back
        }

        // Check for drafting in local storage
        const saved = localStorage.getItem("site_customization");
        if (saved) {
          try {
            const localSettings = JSON.parse(saved);
            setSettings(prev => ({ ...prev, ...localSettings }));
          } catch (e) {
            // Ignore parse errors from local storage
          }
        }
      } catch (e) {
        // Catch-all to prevent any uncaught errors
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    // Save locally for immediate feedback in this tab
    localStorage.setItem("site_customization", JSON.stringify(settings));

    // Save to server for persistence and "publish preview"
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        toast.success("Site customization published successfully!");
        window.dispatchEvent(new Event('site-settings-updated'));
      } else {
        throw new Error("Failed to save to server");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to publish changes to the live site.");
    }
  };

  const updateSetting = (section: string, key: string, value: any) => {
    setSettings(prev => {
      const next = {
        ...prev,
        [section]: {
          //@ts-ignore
          ...prev[section],
          [key]: value
        }
      };
      // Save locally on every change for real-time preview in other tabs/iframes
      localStorage.setItem("site_customization", JSON.stringify(next));
      window.dispatchEvent(new Event('site-settings-updated'));
      return next;
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc]">
      <Header />
      
      <main className="flex-1 pt-24 pb-12">
        {/* Sub-Header */}
        <div className="bg-white border-b border-slate-200 sticky top-[72px] z-30 px-6 py-3">
          <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Palette className="w-4 h-4 text-[#0d9488]" />
              </div>
              <div>
                <h1 className="text-sm font-black text-slate-900 uppercase tracking-widest">Visual Customizer</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Manage Visual Building Blocks</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="sm" className="h-9 rounded-xl border-slate-200 text-slate-600 font-bold text-xs">
                <Link to="/" target="_blank">
                  <Eye className="w-3.5 h-3.5 mr-2" /> Preview Live Site
                </Link>
              </Button>
              <Button onClick={handleSave} size="sm" className="h-9 bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold text-xs rounded-xl px-6">
                <Save className="w-3.5 h-3.5 mr-2" /> Publish Changes
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-6 mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            
            {/* Sidebar Navigation */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sticky top-[140px]">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-4">Site Architecture</h2>
                <div className="space-y-1">
                  <CustomizerNavItem active={true} icon={<Globe className="w-4 h-4" />} label="Global Styles" />
                  <CustomizerNavItem active={false} icon={<Home className="w-4 h-4" />} label="Homepage" />
                  <CustomizerNavItem active={false} icon={<Tag className="w-4 h-4" />} label="Current Pricing" href="/admin/current-pricing" />
                  <CustomizerNavItem active={false} icon={<Share2 className="w-4 h-4" />} label="Socials" />
                  <CustomizerNavItem active={false} icon={<Component className="w-4 h-4" />} label="Shared Blocks" />
                  <CustomizerNavItem active={false} icon={<Mail className="w-4 h-4" />} label="Email Templates" href="/admin/email-templates" />
                </div>
                
                <div className="mt-8 pt-8 border-t border-slate-100 px-4">
                  <div className="bg-slate-900 rounded-2xl p-4 text-white">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#0d9488] mb-2">Build Mode</p>
                    <p className="text-[11px] font-bold text-slate-400 mb-4">You are editing visual blocks directly.</p>
                    <Button variant="outline" size="sm" className="w-full h-8 text-[9px] font-black border-slate-700 text-white hover:bg-slate-800">
                      <Plus className="w-3 h-3 mr-2" /> NEW BLOCK
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="lg:col-span-3">
              <Tabs defaultValue="global" className="w-full">
                <TabsList className="bg-slate-200/50 p-1 rounded-xl mb-6 w-full flex justify-start h-auto gap-1">
                  <TabsTrigger value="global" className="rounded-lg text-[10px] font-black uppercase tracking-widest px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-black shadow-none">Global</TabsTrigger>
                  <TabsTrigger value="homepage" className="rounded-lg text-[10px] font-black uppercase tracking-widest px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-black shadow-none">Homepage</TabsTrigger>
                  <TabsTrigger value="pricing" className="rounded-lg text-[10px] font-black uppercase tracking-widest px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:text-black shadow-none">Pricing</TabsTrigger>
                </TabsList>

                {/* Global Settings */}
                <TabsContent value="global" className="space-y-6">
                  <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-50">
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-1">Branding & Identity</h3>
                      <p className="text-xs font-medium text-slate-400">Manage your site's core visual identity.</p>
                    </div>
                    <div className="p-8 space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logo Text</Label>
                          <Input 
                            value={settings.global.logoText} 
                            onChange={(e) => updateSetting('global', 'logoText', e.target.value)}
                            className="rounded-xl border-slate-200 focus:ring-[#0d9488]/20" 
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Accent Color</Label>
                          <div className="flex gap-3">
                            <div className="w-10 h-10 rounded-xl border border-slate-200 flex-shrink-0" style={{ backgroundColor: settings.global.primaryColor }}></div>
                            <Input 
                              value={settings.global.primaryColor} 
                              onChange={(e) => updateSetting('global', 'primaryColor', e.target.value)}
                              className="rounded-xl border-slate-200 focus:ring-[#0d9488]/20 font-mono" 
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-8 border-t border-slate-50 space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-black text-slate-900 uppercase tracking-tight">Promotional Banner</Label>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Show top bar across all pages</p>
                          </div>
                          <Switch 
                            checked={settings.global.showPromoBar} 
                            onCheckedChange={(val) => updateSetting('global', 'showPromoBar', val)}
                          />
                        </div>
                        
                        {settings.global.showPromoBar && (
                          <div className="space-y-3 animate-in slide-in-from-top-2">
                            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Banner Text</Label>
                            <Input 
                              value={settings.global.promoBarText} 
                              onChange={(e) => updateSetting('global', 'promoBarText', e.target.value)}
                              className="rounded-xl border-slate-200 focus:ring-[#0d9488]/20" 
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Homepage Settings */}
                <TabsContent value="homepage" className="space-y-6">
                  <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-1">Hero Section</h3>
                        <p className="text-xs font-medium text-slate-400">The first thing users see on your site.</p>
                      </div>
                      <div className="bg-slate-100 p-2 rounded-xl">
                        <Layout className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                    <div className="p-8 space-y-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          Hero Title <Type className="w-3 h-3" />
                        </Label>
                        <textarea 
                          value={settings.homepage.heroTitle}
                          onChange={(e) => updateSetting('homepage', 'heroTitle', e.target.value)}
                          className="w-full p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-[#0d9488]/20 outline-none text-sm font-bold min-h-[100px]"
                        ></textarea>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hero Subtitle</Label>
                        <Input 
                          value={settings.homepage.heroSubtitle}
                          onChange={(e) => updateSetting('homepage', 'heroSubtitle', e.target.value)}
                          className="rounded-xl border-slate-200" 
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          Background Image <ImageIcon className="w-3 h-3" />
                        </Label>
                        <div className="flex gap-4">
                          <div className="w-32 h-20 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0">
                            <img src={settings.homepage.heroImage} className="w-full h-full object-cover" alt="Hero" />
                          </div>
                          <div className="flex-1 space-y-2">
                            <Input 
                              value={settings.homepage.heroImage}
                              onChange={(e) => updateSetting('homepage', 'heroImage', e.target.value)}
                              className="rounded-xl border-slate-200 text-[10px]" 
                            />
                            <p className="text-[9px] text-slate-400 italic">Recommended: 1920x1080px high-res JPEG</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-50">
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-1">Visual Blocks Visibility</h3>
                      <p className="text-xs font-medium text-slate-400">Toggle entire sections of the homepage.</p>
                    </div>
                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <VisibilityToggle 
                        label="Audience Categories" 
                        checked={settings.homepage.showAudienceSection}
                        onChange={(val) => updateSetting('homepage', 'showAudienceSection', val)}
                      />
                      <VisibilityToggle 
                        label="AI Solutions Grid" 
                        checked={settings.homepage.showAIToolsSection}
                        onChange={(val) => updateSetting('homepage', 'showAIToolsSection', val)}
                      />
                      <VisibilityToggle 
                        label="Before/After Carousels" 
                        checked={settings.homepage.showBeforeAfter}
                        onChange={(val) => updateSetting('homepage', 'showBeforeAfter', val)}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Pricing Settings */}
                <TabsContent value="pricing" className="space-y-6">
                  <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-50">
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-1">Pricing Page Customizer</h3>
                      <p className="text-xs font-medium text-slate-400">Manage messaging and product tiers.</p>
                    </div>
                    <div className="p-8 space-y-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hero Title</Label>
                        <Input
                          value={settings.pricing.title}
                          onChange={(e) => updateSetting('pricing', 'title', e.target.value)}
                          className="rounded-xl border-slate-200 font-bold"
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hero Subtitle</Label>
                        <Input
                          value={settings.pricing.subtitle}
                          onChange={(e) => updateSetting('pricing', 'subtitle', e.target.value)}
                          className="rounded-xl border-slate-200"
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <VisibilityToggle 
                          label="Show 'The Basics' Section" 
                          checked={settings.pricing.showBasics}
                          onChange={(val) => updateSetting('pricing', 'showBasics', val)}
                        />
                        <VisibilityToggle 
                          label="Show 'Phase 2' Tiers" 
                          checked={settings.pricing.showPhase2}
                          onChange={(val) => updateSetting('pricing', 'showPhase2', val)}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function CustomizerNavItem({ icon, label, active, href }: { icon: React.ReactNode, label: string, active: boolean, href?: string }) {
  const content = (
    <>
      <div className={`p-2 rounded-xl ${active ? 'bg-white shadow-sm text-[#0d9488]' : 'text-slate-400'}`}>
        {icon}
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${active ? 'bg-slate-50 text-[#0d9488]' : 'text-slate-500 hover:bg-slate-50/50 hover:text-slate-900'}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${active ? 'bg-slate-50 text-[#0d9488]' : 'text-slate-500 hover:bg-slate-50/50 hover:text-slate-900'}`}>
      {content}
    </button>
  );
}

function VisibilityToggle({ label, checked, onChange }: { label: string, checked: boolean, onChange: (val: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
      <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{label}</span>
      <Switch 
        checked={checked} 
        onCheckedChange={onChange}
      />
    </div>
  );
}
