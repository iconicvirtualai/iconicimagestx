import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export default function PlaceholderPage({
  title,
  description = "This page is currently under development. We're crafting something special!",
}: PlaceholderPageProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 bg-white py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            {/* Icon */}
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full">
                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-bold text-black mb-4">
              {title}
            </h1>

            {/* Description */}
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              {description}
            </p>

            {/* Message */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 mb-12">
              <p className="text-gray-700 mb-4">
                Want to see something specific on this page? Just let us know in 
                the chat, and we'll build it for you!
              </p>
            </div>

            {/* CTA */}
            <Link to="/">
              <Button className="bg-black text-white hover:bg-gray-900 font-semibold px-8 py-6 flex items-center justify-center gap-2 w-full sm:w-auto mx-auto">
                <ArrowLeft className="w-5 h-5" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
