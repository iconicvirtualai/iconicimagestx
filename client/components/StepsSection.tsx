import { Calendar, Camera, Scissors, Rocket, ArrowRight, Download, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";

function BookStepVisual() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const dates = [8, 9, 10, 11, 12, 13, 14];
  return (
    <div className="absolute inset-0 bg-[#0c1211] p-3 flex flex-col text-white" aria-hidden="true">
      <div className="flex items-center justify-between text-[9px] font-black tracking-[0.2em] mb-2">
        <span>PORTAL</span>
        <span className="text-teal-400">PICK A TIME</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((day, i) => (
          <span key={`${day}-${i}`} className="text-[8px] text-white/35 font-bold">{day}</span>
        ))}
        {dates.map((date) => (
          <span
            key={date}
            className={`text-[9px] font-black rounded-md py-1 ${date === 12 ? "bg-teal-500 text-black" : "bg-white/5 text-white/70"}`}
          >
            {date}
          </span>
        ))}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1">
        {["9:00", "11:30", "2:00"].map((time, i) => (
          <span key={time} className={`text-[8px] font-black text-center rounded-md py-1.5 ${i === 1 ? "bg-white text-black" : "bg-white/10 text-white/80"}`}>
            {time}
          </span>
        ))}
      </div>
    </div>
  );
}

function CaptureStepVisual() {
  return (
    <div className="absolute inset-0 bg-black" aria-hidden="true">
      <img
        src="/media/logos/camera-logo-white-on-black.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-50"
      />
      <div className="absolute inset-3 border border-white/50 rounded-lg">
        <div className="absolute top-2 left-2 flex items-center gap-1 text-[9px] font-black tracking-widest text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          REC
        </div>
        <div className="absolute bottom-2 inset-x-2 flex items-center justify-between text-[8px] font-black tracking-[0.18em] text-white">
          <span>ON SET</span>
          <span className="text-teal-300">4K</span>
        </div>
      </div>
    </div>
  );
}

function EditStepVisual() {
  return (
    <div className="absolute inset-0 bg-[#101413] p-3 flex flex-col justify-end text-white" aria-hidden="true">
      <div className="mb-2 text-[9px] font-black tracking-[0.22em] text-teal-400">TIMELINE</div>
      <div className="space-y-1.5">
        <div className="h-3 w-[88%] rounded-sm bg-teal-500" />
        <div className="ml-6 h-3 w-[62%] rounded-sm bg-white/25" />
        <div className="h-3 w-[74%] rounded-sm bg-white/50" />
      </div>
      <div className="relative mt-3 h-1 rounded-full bg-white/15">
        <div className="absolute left-[38%] top-1/2 h-3 w-1 -translate-y-1/2 rounded-sm bg-white" />
      </div>
    </div>
  );
}

function DeliveryStepVisual() {
  return (
    <div className="absolute inset-0 bg-white p-3 flex flex-col" aria-hidden="true">
      <div className="mb-2 flex items-center justify-between text-[9px] font-black tracking-[0.18em]">
        <span className="text-black">GALLERY</span>
        <span className="text-teal-600">READY</span>
      </div>
      <div className="grid grid-cols-3 gap-1 flex-1">
        {["bg-zinc-900", "bg-teal-700", "bg-zinc-700", "bg-zinc-800", "bg-teal-900", "bg-zinc-600"].map((tone) => (
          <div key={tone} className={`rounded-sm ${tone}`} />
        ))}
      </div>
      <div className="mt-2 flex gap-1">
        <span className="inline-flex items-center gap-1 rounded-md bg-black px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white">
          <Download className="h-2.5 w-2.5" /> Download
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-black">
          <Share2 className="h-2.5 w-2.5" /> Share
        </span>
      </div>
    </div>
  );
}

export default function StepsSection() {
  const settings = useSiteSettings();
  const steps = [
    {
      step: "STEP 1",
      title: "Book your session",
      description: "Select your creative service and schedule a time through our seamless partnership portal in just a few clicks.",
      icon: <Calendar className="w-5 h-5" style={{ color: settings.global.primaryColor }} />,
      visual: <BookStepVisual />,
    },
    {
      step: "STEP 2",
      title: "We capture the vision",
      description: "Our professional creative team arrives on-site with state-of-the-art equipment to capture high-impact raw media.",
      icon: <Camera className="w-5 h-5" style={{ color: settings.global.primaryColor }} />,
      visual: <CaptureStepVisual />,
    },
    {
      step: "STEP 3",
      title: "Rapid post-production",
      description: "Our expert editors transform raw clips into polished, cinematic masterpieces that perfectly align with your brand.",
      icon: <Scissors className="w-5 h-5" style={{ color: settings.global.primaryColor }} />,
      visual: <EditStepVisual />,
    },
    {
      step: "STEP 4",
      title: "Delivery & launch",
      description: "Receive your ready-to-post assets within 24 hours. Download, publish, and dominate your social feed instantly.",
      icon: <Rocket className="w-5 h-5" style={{ color: settings.global.primaryColor }} />,
      visual: <DeliveryStepVisual />,
    },
  ];

  return (
    <section className="bg-gray-50 py-20 md:py-24 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10 max-w-6xl">
        <div className="text-center mb-12">
          {/* Badge */}
          <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-black border border-black mb-6 shadow-sm">
            <span className="text-[12px] font-bold tracking-wider uppercase accent-text-bordered">
              4 STEPS TO RESULTS
            </span>
          </div>

          {/* Headline */}
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6 leading-[1.1] tracking-tight text-black max-w-5xl mx-auto">
            From vision to viral in <br className="hidden md:block" />
            <span className="accent-text-bordered">minutes</span>, not days
          </h2>

          <p className="text-base md:text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Placing an order with Iconic is as simple as it gets. We handle the heavy lifting so you can focus on growth.
          </p>
        </div>

        {/* Steps Grid - Updated to 4 columns as per screenshot */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-4 max-w-[1400px] mx-auto">
          {steps.map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-[1.5rem] p-6 border border-gray-100 shadow-sm flex flex-col h-full hover:shadow-xl transition-all duration-300 group"
            >
              <div className="mb-6">
                <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase block mb-2">
                  {item.step}
                </span>
                <h3 className="text-lg font-bold text-black mb-3 leading-tight transition-all" onMouseEnter={(e) => { e.currentTarget.classList.add('accent-text-bordered'); }} onMouseLeave={(e) => { e.currentTarget.classList.remove('accent-text-bordered'); }}>
                  {item.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed min-h-[60px]">
                  {item.description}
                </p>
              </div>

              <div className="mt-auto relative rounded-xl overflow-hidden aspect-[4/3] bg-gray-50 border border-gray-100">
                {item.visual}
                <div className="absolute top-3 right-3 w-8 h-8 bg-white/80 backdrop-blur-md rounded-lg flex items-center justify-center shadow-sm border border-white/40">
                  <div className="scale-75">
                    {item.icon}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <div className="mt-16 text-center">
          <Link to="/book">
            <Button className="text-white font-bold text-lg px-8 py-7 rounded-2xl shadow-xl shadow-teal-100 transition-all hover:scale-105 active:scale-95 group" style={{ backgroundColor: settings.global.primaryColor }}>
              BOOK YOUR SESSION
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Decorative background element */}
      <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] bg-white rounded-full blur-[120px] opacity-40"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-[#ccfbf1]/20 rounded-full blur-[100px] opacity-30"></div>
    </section>
  );
}
