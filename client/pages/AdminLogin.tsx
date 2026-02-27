import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Lock, User, ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate login for now
    console.log("Admin Login Attempt:", { email, password });
    alert("Admin login is currently in simulation mode. Access pending cloud database integration.");
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 flex items-center justify-center pt-32 pb-24 px-4">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-12 border border-gray-100 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
              <ShieldCheck className="w-32 h-32" />
            </div>

            <div className="text-center mb-10 relative z-10">
              <div className="w-16 h-16 bg-[#f0fdfa] rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#ccfbf1]">
                <Lock className="w-8 h-8 text-[#0d9488]" />
              </div>
              <h1 className="text-3xl font-black text-black tracking-tight mb-2 uppercase">Admin Portal</h1>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Authorized Personnel Only</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <User className="w-3.5 h-3.5" />
                  Email Address
                </label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-5 py-4 rounded-xl border border-gray-100 bg-[#fafafa] focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all font-medium text-black"
                  placeholder="admin@iconicimagestx.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  Security Key
                </label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 rounded-xl border border-gray-100 bg-[#fafafa] focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all font-medium text-black"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="pt-4">
                <Button type="submit" className="w-full py-7 bg-black hover:bg-[#0d9488] text-white font-black rounded-2xl transition-all shadow-xl hover:scale-[1.02] active:scale-95 text-lg">
                  Access Dashboard
                </Button>
              </div>

              <div className="text-center pt-6 border-t border-gray-50">
                <Link to="/" className="text-[10px] font-bold text-gray-400 hover:text-black transition-colors uppercase tracking-widest">
                  Back to Homepage
                </Link>
              </div>
            </form>
          </div>
          
          <p className="mt-8 text-center text-[10px] text-gray-300 font-bold uppercase tracking-widest">
            © 2024 Iconic Images Inc. Secure Infrastructure.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
