import * as React from "react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function FAQSection() {
  const settings = useSiteSettings();
  const faqs = [
    {
      question: "How long does video processing take?",
      answer: "Typically, our high-end media assets are delivered within 24 hours of capture. Our rapid post-production workflow is optimized for social media timelines.",
    },
    {
      question: "Does Iconic support portrait mode?",
      answer: "Yes, we specialize in both cinematic landscape and scroll-stopping vertical content optimized for Reels, TikTok, and Shorts.",
    },
    {
      question: "How many images can I use per video?",
      answer: "Our standard cinematic reel utilizes between 15-25 of the best property shots, but this can be customized based on your specific project needs.",
    },
    {
      question: "How long is each video?",
      answer: "Most property reels are between 30-60 seconds, which is the 'sweet spot' for high engagement across modern social platforms.",
    },
  ];

  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  return (
    <section className="bg-white py-24 md:py-32">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-black border border-black mb-8 shadow-lg">
            <span className="text-[12px] font-bold tracking-wider uppercase accent-text-bordered">
              FAQ
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-6 leading-[1.2] tracking-tight text-black max-w-5xl mx-auto whitespace-nowrap">
            Got questions? We've got <span className="accent-text-bordered">answers</span>.
          </h2>
          <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Everything you need to know about Iconic in a nutshell.
          </p>
        </div>

        {/* Manual Accordion to avoid Radix issues for now */}
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="mb-4 bg-gray-50 rounded-2xl px-8 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <div className="flex items-center justify-between py-6">
                  <h3 className="font-bold text-black text-lg">{faq.question}</h3>
                  <span className={`transition-transform duration-300 ${openIndex === index ? 'rotate-180' : ''}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </div>
                {openIndex === index && (
                  <div className="text-gray-500 pb-6 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-300">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
