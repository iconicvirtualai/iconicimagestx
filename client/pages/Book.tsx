import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BookingForm from "@/components/BookingForm";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Book() {
  const settings = useSiteSettings();

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />

      <main className="flex-1 pt-32 pb-24">
        {/* Page Header */}
        <div className="container mx-auto px-4 max-w-4xl text-center mb-16">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <span className="text-[12px] font-bold tracking-wider uppercase" style={{ color: settings.global.primaryColor }}>
              Instant Booking
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-black tracking-tight leading-[1.1] mb-6">
            SCHEDULE YOUR <br className="hidden md:block" />
            <span style={{ color: settings.global.primaryColor }}>MASTERPIECE</span>
          </h1>
          <p className="text-lg text-gray-400 font-medium max-w-2xl mx-auto leading-relaxed">
            Zero login required. Just your property, your package, and your preferred date.
            We'll handle the rest.
          </p>
        </div>

        {/* Booking Form Component */}
        <div className="container mx-auto px-4 max-w-6xl">
           <div className="bg-white rounded-[3rem] p-4 md:p-12 border border-gray-100 shadow-2xl relative overflow-hidden">
             {/* Decorative Background Elements */}
             <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
             <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2"></div>

             <div className="relative z-10">
               <BookingForm />
             </div>
           </div>
        </div>

        {/* Support Link */}
        <div className="mt-16 text-center">
          <p className="text-gray-400 text-sm font-medium">
            Need a custom quote? <a href="/contact" className="text-black font-bold underline underline-offset-4 hover:text-primary transition-colors">Contact our support team</a>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
