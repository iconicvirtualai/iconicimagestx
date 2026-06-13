import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Download, Lock } from "lucide-react";
import { useState } from "react";

interface PhotoGallery {
  id: string;
  neighborhood: string;
  price: number;
  imageCount: number;
  thumbnail: string;
  images: {
    url: string;
    alt: string;
  }[];
}

export default function StockFootage() {
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showLicenseeForm, setShowLicenseeForm] = useState(false);
  const [licenseeData, setLicenseeData] = useState({
    fullName: "",
    email: "",
    company: "",
    address: "",
    phone: ""
  });

  const neighborhoods: PhotoGallery[] = [
    {
      id: "artavia",
      neighborhood: "Artavia",
      price: 49.99,
      imageCount: 20,
      thumbnail: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80",
      images: Array.from({ length: 20 }, (_, i) => ({
        url: `https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&t=${i}`,
        alt: `Artavia Property ${i + 1}`
      }))
    },
    {
      id: "benders-landing",
      neighborhood: "Bender's Landing",
      price: 49.99,
      imageCount: 20,
      thumbnail: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=80",
      images: Array.from({ length: 20 }, (_, i) => ({
        url: `https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&t=${i}`,
        alt: `Bender's Landing Property ${i + 1}`
      }))
    },
    {
      id: "carlton-woods",
      neighborhood: "Carlton Woods",
      price: 49.99,
      imageCount: 20,
      thumbnail: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=400&q=80",
      images: Array.from({ length: 20 }, (_, i) => ({
        url: `https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80&t=${i}`,
        alt: `Carlton Woods Property ${i + 1}`
      }))
    },
    {
      id: "memorial",
      neighborhood: "Memorial",
      price: 49.99,
      imageCount: 20,
      thumbnail: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=400&q=80",
      images: Array.from({ length: 20 }, (_, i) => ({
        url: `https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80&t=${i}`,
        alt: `Memorial Property ${i + 1}`
      }))
    },
    {
      id: "uptown",
      neighborhood: "Uptown",
      price: 49.99,
      imageCount: 20,
      thumbnail: "https://images.unsplash.com/photo-1582321905220-8149df7ee89d?w=400&q=80",
      images: Array.from({ length: 20 }, (_, i) => ({
        url: `https://images.unsplash.com/photo-1582321905220-8149df7ee89d?w=800&q=80&t=${i}`,
        alt: `Uptown Property ${i + 1}`
      }))
    },
    {
      id: "energy-corridor",
      neighborhood: "Energy Corridor",
      price: 49.99,
      imageCount: 20,
      thumbnail: "https://images.unsplash.com/photo-1600054528934-e2e29bb94b00?w=400&q=80",
      images: Array.from({ length: 20 }, (_, i) => ({
        url: `https://images.unsplash.com/photo-1600054528934-e2e29bb94b00?w=800&q=80&t=${i}`,
        alt: `Energy Corridor Property ${i + 1}`
      }))
    }
  ];

  const selectedGallery = neighborhoods.find(n => n.id === selectedNeighborhood);

  const handleLicenseNow = () => {
    setShowCheckout(true);
  };

  const handleCheckout = async () => {
    if (!selectedGallery) return;
    setShowLicenseeForm(true);
  };

  const handleLicenseeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simulate Stripe checkout
    alert(`Thank you for your purchase, ${licenseeData.fullName}!\n\nYour photos are being prepared for download. A download link will be sent to ${licenseeData.email}`);
    
    // Reset form
    setLicenseeData({
      fullName: "",
      email: "",
      company: "",
      address: "",
      phone: ""
    });
    setShowLicenseeForm(false);
    setShowCheckout(false);
    setSelectedNeighborhood(null);
    setCurrentImageIndex(0);
  };

  const nextImage = () => {
    if (selectedGallery) {
      setCurrentImageIndex((prev) => (prev + 1) % selectedGallery.images.length);
    }
  };

  const prevImage = () => {
    if (selectedGallery) {
      setCurrentImageIndex((prev) => (prev - 1 + selectedGallery.images.length) % selectedGallery.images.length);
    }
  };

  return (
    <Layout>
      <div className="bg-white">
        <main className="flex-1">
          {/* Hero Section */}
          <section className="pt-24 pb-12 bg-gradient-to-b from-black to-gray-900">
            <div className="container mx-auto px-4">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Stock Footage Library</h1>
              <p className="text-gray-400 text-lg max-w-2xl">Premium, professionally photographed real estate images by neighborhood. License instantly and use for your listings, marketing, or staging inspiration.</p>
            </div>
          </section>

          {/* Neighborhood Grid */}
          {!selectedNeighborhood && (
            <section className="py-16">
              <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {neighborhoods.map((neighborhood) => (
                    <div
                      key={neighborhood.id}
                      className="group cursor-pointer"
                      onClick={() => setSelectedNeighborhood(neighborhood.id)}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-900 mb-4 hover:shadow-2xl transition-all">
                        <img
                          src={neighborhood.thumbnail}
                          alt={neighborhood.neighborhood}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-colors flex items-center justify-center">
                          <div className="text-center">
                            <h3 className="text-2xl font-bold text-white mb-2">{neighborhood.neighborhood}</h3>
                            <p className="text-gray-300 text-sm">{neighborhood.imageCount} Premium Photos</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-black">${neighborhood.price}</span>
                        <Button 
                          className="bg-teal-500 hover:bg-teal-600 text-white font-semibold px-4 py-2 rounded-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNeighborhood(neighborhood.id);
                          }}
                        >
                          Browse
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Gallery View */}
          {selectedNeighborhood && selectedGallery && !showCheckout && (
            <section className="py-16">
              <div className="container mx-auto px-4">
                <button
                  onClick={() => {
                    setSelectedNeighborhood(null);
                    setCurrentImageIndex(0);
                  }}
                  className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-700 text-sm font-semibold mb-6"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Neighborhoods
                </button>

                <div className="max-w-5xl">
                  <h2 className="text-3xl font-bold text-black mb-8">{selectedGallery.neighborhood} Gallery</h2>

                  {/* Image Viewer */}
                  <div className="relative aspect-video bg-black rounded-2xl overflow-hidden mb-8 shadow-2xl">
                    <img
                      src={selectedGallery.images[currentImageIndex].url}
                      alt={selectedGallery.images[currentImageIndex].alt}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Navigation Arrows */}
                    <button
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 backdrop-blur-md p-3 rounded-full text-white transition-all"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 backdrop-blur-md p-3 rounded-full text-white transition-all"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>

                    {/* Image Counter */}
                    <div className="absolute bottom-4 right-4 bg-black/60 text-white px-4 py-2 rounded-full text-sm font-semibold">
                      {currentImageIndex + 1} / {selectedGallery.images.length}
                    </div>
                  </div>

                  {/* Thumbnail Strip */}
                  <div className="overflow-x-auto mb-8 pb-4">
                    <div className="flex gap-3">
                      {selectedGallery.images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentImageIndex(idx)}
                          className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                            idx === currentImageIndex ? "border-teal-500 scale-105" : "border-gray-300 hover:border-teal-400"
                          }`}
                        >
                          <img
                            src={img.url}
                            alt={`Thumbnail ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Info and CTA */}
                  <div className="bg-gray-50 p-8 rounded-2xl">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-black">{selectedGallery.neighborhood} Collection</h3>
                        <p className="text-gray-600 mt-2">{selectedGallery.imageCount} High-Resolution Photos • Commercial License Included</p>
                      </div>
                      <div className="text-right">
                        <p className="text-4xl font-bold text-teal-600">${selectedGallery.price}</p>
                        <p className="text-gray-600 text-sm">One-time purchase</p>
                      </div>
                    </div>
                    <Button
                      onClick={handleLicenseNow}
                      className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 rounded-lg text-lg"
                    >
                      License Now
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Checkout View */}
          {showCheckout && selectedGallery && !showLicenseeForm && (
            <section className="py-16">
              <div className="container mx-auto px-4">
                <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-8 shadow-lg">
                  <h2 className="text-2xl font-bold text-black mb-6">Order Summary</h2>
                  
                  <div className="mb-8 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-black">{selectedGallery.neighborhood} Stock Collection</h3>
                        <p className="text-gray-600 text-sm">{selectedGallery.imageCount} Photos • Commercial License</p>
                      </div>
                      <p className="text-2xl font-bold text-teal-600">${selectedGallery.price}</p>
                    </div>
                  </div>

                  <div className="mb-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                    <h4 className="font-bold text-black mb-2">License Includes:</h4>
                    <ul className="space-y-1 text-sm text-gray-700">
                      <li>✓ Commercial use rights</li>
                      <li>✓ Unlimited downloads</li>
                      <li>✓ High-resolution files</li>
                      <li>✓ Perpetual license</li>
                    </ul>
                  </div>

                  <Button
                    onClick={handleCheckout}
                    className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 rounded-lg text-lg mb-4"
                  >
                    Proceed to Payment
                  </Button>
                  
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="w-full text-teal-600 hover:text-teal-700 font-semibold py-2"
                  >
                    Back
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Licensee Form */}
          {showLicenseeForm && selectedGallery && (
            <section className="py-16">
              <div className="container mx-auto px-4">
                <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-8 shadow-lg">
                  <h2 className="text-2xl font-bold text-black mb-2">Complete Your Purchase</h2>
                  <p className="text-gray-600 mb-6">Enter your information and proceed to secure payment via Stripe</p>

                  <form onSubmit={handleLicenseeSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={licenseeData.fullName}
                        onChange={(e) => setLicenseeData({ ...licenseeData, fullName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">Email Address *</label>
                      <input
                        type="email"
                        required
                        value={licenseeData.email}
                        onChange={(e) => setLicenseeData({ ...licenseeData, email: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        placeholder="john@example.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">Company</label>
                      <input
                        type="text"
                        value={licenseeData.company}
                        onChange={(e) => setLicenseeData({ ...licenseeData, company: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        placeholder="Acme Real Estate"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">Address *</label>
                      <input
                        type="text"
                        required
                        value={licenseeData.address}
                        onChange={(e) => setLicenseeData({ ...licenseeData, address: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        placeholder="123 Main St, City, State"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-black mb-2">Phone Number *</label>
                      <input
                        type="tel"
                        required
                        value={licenseeData.phone}
                        onChange={(e) => setLicenseeData({ ...licenseeData, phone: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        placeholder="(555) 123-4567"
                      />
                    </div>

                    <div className="pt-4 border-t">
                      <div className="flex items-center justify-between mb-6">
                        <span className="font-semibold text-black">Total Amount</span>
                        <span className="text-3xl font-bold text-teal-600">${selectedGallery.price}</span>
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 rounded-lg text-lg mb-4 flex items-center justify-center gap-2"
                      >
                        <Lock className="w-5 h-5" />
                        Pay Securely with Stripe
                      </Button>

                      <button
                        type="button"
                        onClick={() => setShowLicenseeForm(false)}
                        className="w-full text-teal-600 hover:text-teal-700 font-semibold py-2"
                      >
                        Back
                      </button>
                    </div>
                  </form>

                  <p className="text-xs text-gray-500 mt-6 text-center">
                    Your payment information is securely processed by Stripe. We never store credit card details.
                  </p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </Layout>
  );
}
