import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { SmsConsentField } from "@/components/SmsConsentField";
import { ChevronLeft, ChevronRight, X, Download, Lock } from "lucide-react";
import { useState } from "react";
import { useSiteText } from "@/content/siteContent";

interface GalleryImage {
  url: string;
  alt: string;
}

interface PhotoGallery {
  id: string;
  neighborhood: string;
  price: number;
  imageCount: number;
  thumbnail: string;
  images: GalleryImage[];
}

function amenityGallery(
  id: string,
  neighborhood: string,
  photos: { file: string; alt: string }[],
): PhotoGallery {
  const images = photos.map((photo) => ({
    url: `/media/amenities/${id}/${photo.file}`,
    alt: photo.alt,
  }));
  return {
    id,
    neighborhood,
    price: 49.99,
    imageCount: images.length,
    thumbnail: images[0].url,
    images,
  };
}

function AmenityImage({
  src,
  alt,
  className,
  pictureClassName,
}: {
  src: string;
  alt: string;
  className?: string;
  pictureClassName?: string;
}) {
  return (
    <picture className={pictureClassName}>
      <source srcSet={src.replace(/\.jpe?g$/i, ".webp")} type="image/webp" />
      <img src={src} alt={alt} className={className} />
    </picture>
  );
}

export default function StockFootage() {
  const title = useSiteText("stock", "hero", "title", "Stock Footage Library");
  const intro = useSiteText("stock", "hero", "body", "Premium, professionally photographed real estate images by neighborhood. License instantly and use for your listings, marketing, or staging inspiration.");
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
  const [smsConsent, setSmsConsent] = useState(false);

  const neighborhoods: PhotoGallery[] = [
    amenityGallery("artavia", "Artavia", [
      { file: "A7303322.jpg", alt: "Artavia entrance with a large letter A sculpture" },
      { file: "A7303323.jpg", alt: "Artavia lake and curved walking path" },
      { file: "A7303338.jpg", alt: "Artavia covered seating plaza with picnic tables" },
      { file: "A7303339.jpg", alt: "Artavia amenity buildings along a paved walkway" },
      { file: "A7303349.jpg", alt: "Artavia sculpture of nested pink frames" },
      { file: "A7303350.jpg", alt: "Artavia covered deck with picnic tables beside the lake" },
    ]),
    amenityGallery("benders-landing", "Bender's Landing", [
      { file: "DJI_0002_edits.jpg", alt: "Aerial view of a Bender's Landing playground" },
      { file: "DJI_0005_edits.jpg", alt: "Aerial view of the Bender's Landing pool beside a lake" },
      { file: "DJI_0009_edits.jpg", alt: "Aerial view of Bender's Landing tennis courts and a basketball court" },
      { file: "DJI_0021_edits.jpg", alt: "Aerial view of the Bender's Landing pool, dock, and sports fields" },
      { file: "DJI_0026_edits.jpg", alt: "Aerial view of a Bender's Landing soccer field" },
      { file: "DSC02422_edits.jpg", alt: "Bender's Landing soccer field with goals" },
    ]),
    amenityGallery("carlton-woods", "Carlton Woods", [
      { file: "MLU07984.jpg", alt: "Carlton Woods outdoor basketball court" },
      { file: "MLU07990.jpg", alt: "Carlton Woods garden with benches and a stone planter" },
      { file: "MLU07991.jpg", alt: "Carlton Woods shaded benches around a stone planter" },
      { file: "MLU08015.jpg", alt: "Carlton Woods playground with a slide" },
      { file: "MLU08020.jpg", alt: "Carlton Woods tennis courts" },
      { file: "MLU08024.jpg", alt: "Carlton Woods pavilion overlooking a pond" },
    ]),
    amenityGallery("east-shore", "East Shore", [
      { file: "A6509322.jpg", alt: "East Shore clubhouse and the East Shore Club sign" },
      { file: "A6509323.jpg", alt: "Front walk to the East Shore clubhouse" },
      { file: "A6509324.jpg", alt: "East Shore clubhouse porch and stone drive" },
      { file: "A6509328.jpg", alt: "East Shore lawn between rows of trees" },
      { file: "A6509329.jpg", alt: "East Shore patio seating in a hedge garden" },
      { file: "A6509330.jpg", alt: "East Shore stone monument in a circular garden" },
    ]),
    amenityGallery("woodlands-waterway", "The Woodlands Waterway", [
      { file: "DJI_0100.jpg", alt: "The Woodlands Waterway with glass towers, a bridge, and a fountain" },
      { file: "DJI_0102.jpg", alt: "The Woodlands Waterway glass towers and arched bridge" },
      { file: "DJI_0105.jpg", alt: "The Woodlands Waterway arched bridge, fountain, and docks" },
      { file: "DJI_0107.jpg", alt: "The Woodlands Waterway canal beside office buildings" },
      { file: "DJI_0886.jpg", alt: "The Woodlands Waterway at sunset with lit towers and the bridge" },
      { file: "DJI_0894.jpg", alt: "The Woodlands Waterway shopping district at sunset" },
    ]),
    amenityGallery("woodforest", "Woodforest", [
      { file: "DJI_0088.jpg", alt: "Aerial view of the Woodforest pool and water slides" },
      { file: "DJI_0094.jpg", alt: "Aerial view of a Woodforest lap pool and lawn" },
      { file: "MLU08266.jpg", alt: "Woodforest entrance sign reading Forest Island" },
      { file: "MLU08273.jpg", alt: "Woodforest lawn with cornhole boards and covered seating" },
      { file: "MLU08275.jpg", alt: "Woodforest model home with a Discover Woodforest sign" },
      { file: "MLU08292.jpg", alt: "Woodforest Harvest Market storefront" },
    ]),
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
    if (!smsConsent) {
      alert("Check the box to agree to Iconic Images booking and appointment text messages.");
      return;
    }
    
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
    setSmsConsent(false);
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
              <h1 data-site-page="stock" data-site-block="hero" data-site-field="title" data-site-kind="text" className="text-4xl md:text-5xl font-bold text-white mb-4">{title}</h1>
              <p data-site-page="stock" data-site-block="hero" data-site-field="body" data-site-kind="text" className="text-gray-400 text-lg max-w-2xl">{intro}</p>
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
                        <AmenityImage
                          src={neighborhood.thumbnail}
                          alt={neighborhood.images[0].alt}
                          pictureClassName="absolute inset-0"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
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
                    <AmenityImage
                      src={selectedGallery.images[currentImageIndex].url}
                      alt={selectedGallery.images[currentImageIndex].alt}
                      pictureClassName="block h-full w-full"
                      className="h-full w-full object-cover"
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
                          <AmenityImage
                            src={img.url}
                            alt={img.alt}
                            pictureClassName="block h-full w-full"
                            className="h-full w-full object-cover"
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

                    <SmsConsentField
                      id="stock-sms-consent"
                      checked={smsConsent}
                      onChange={setSmsConsent}
                    />

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
