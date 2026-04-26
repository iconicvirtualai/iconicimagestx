import { Link } from "react-router-dom";
import BookingForm from "@/components/BookingForm";
import { ArrowLeft } from "lucide-react";

export default function BookPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top nav bar */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-black transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <span className="text-gray-200 select-none">|</span>
        <span className="text-sm font-bold tracking-widest text-gray-900 uppercase">
          Book a Session
        </span>
      </div>

      {/* Booking form */}
      <div className="flex-1">
        <BookingForm />
      </div>
    </div>
  );
}
