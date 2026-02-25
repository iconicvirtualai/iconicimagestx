import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CreditCard, ShieldCheck, ShoppingCart, ArrowLeft, Plus, CheckCircle2, Lock } from "lucide-react";

export default function VirtualStagingCheckout() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
    }, 3000);
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        <Header />
        <main className="flex-1 flex items-center justify-center pt-32 pb-24 px-4">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 bg-[#f0fdfa] rounded-full flex items-center justify-center mx-auto mb-8">
              <CheckCircle2 className="w-10 h-10 text-[#0d9488]" />
            </div>
            <h1 className="text-3xl font-bold mb-4 tracking-tight">Payment Successful!</h1>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Your high-resolution virtually staged photo is being processed and will be sent to your email in minutes.
            </p>
            <div className="space-y-4">
              <Link to="/services/virtual-staging/ai-tool">
                <Button className="w-full bg-black text-white hover:bg-gray-800 py-6 rounded-2xl font-bold">
                  Stage More Photos
                </Button>
              </Link>
              <Link to="/">
                <Button variant="ghost" className="w-full text-gray-500">Back to Homepage</Button>
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <main className="flex-1 pt-32 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            
            <div className="flex flex-col lg:flex-row gap-12">
              
              {/* Left Column: Checkout Form */}
              <div className="lg:col-span-7 space-y-8">
                <div className="flex items-center gap-4 mb-4">
                  <Link to="/services/virtual-staging/ai-tool" className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                  </Link>
                  <h1 className="text-3xl font-bold tracking-tight">Complete Your Order</h1>
                </div>

                <div className="p-8 rounded-[2rem] bg-gray-50 border border-gray-100">
                  <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                    <CreditCard className="w-6 h-6 text-[#0d9488]" />
                    Payment Information
                  </h3>
                  
                  <form onSubmit={handlePayment} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label className="text-sm font-bold text-gray-700 block mb-2">Card Number</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            placeholder="0000 0000 0000 0000"
                            className="w-full bg-white border border-gray-200 rounded-xl px-12 py-4 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
                            required
                          />
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-2">Expiry Date</label>
                        <input 
                          type="text" 
                          placeholder="MM / YY"
                          className="w-full bg-white border border-gray-200 rounded-xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-2">CVV</label>
                        <input 
                          type="text" 
                          placeholder="123"
                          className="w-full bg-white border border-gray-200 rounded-xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-4 bg-white border border-[#ccfbf1] rounded-xl text-[12px] text-gray-500">
                      <ShieldCheck className="w-4 h-4 text-[#0d9488]" />
                      Your payment is secured with Stripe 256-bit encryption.
                    </div>

                    <Button 
                      type="submit"
                      disabled={isProcessing}
                      className="w-full bg-black text-white hover:bg-gray-800 py-8 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl transition-all"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                          Processing...
                        </>
                      ) : (
                        "Pay $5.00 Securely"
                      )}
                    </Button>
                  </form>
                </div>
              </div>

              {/* Right Column: Order Summary */}
              <div className="lg:col-span-5">
                <div className="p-8 rounded-[2rem] bg-gray-50 border border-gray-100 sticky top-32 shadow-sm">
                  <h3 className="text-xl font-bold mb-8">Order Summary</h3>
                  
                  <div className="space-y-6 mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-white border border-gray-200 flex-shrink-0">
                        <img 
                          src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80" 
                          className="w-full h-full object-cover" 
                          alt="Order Item" 
                        />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold mb-1">AI Staged Photo</h4>
                        <p className="text-xs text-gray-500 mb-2">Modern Style • Living Room</p>
                        <span className="text-[#0d9488] font-bold">$5.00</span>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-gray-200 space-y-4">
                      <div className="flex justify-between text-gray-500">
                        <span>Subtotal</span>
                        <span className="font-bold text-black">$5.00</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total Cost</span>
                        <span className="text-[#0d9488]">$5.00</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <Link to="/services/virtual-staging/ai-tool">
                      <Button variant="outline" className="w-full py-6 rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#0d9488] hover:bg-[#f0fdfa] transition-all flex items-center justify-center gap-2 font-bold text-gray-500 hover:text-[#0d9488]">
                        <Plus className="w-5 h-5" />
                        Add More Photos to Order
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
