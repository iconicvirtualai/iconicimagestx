import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function FAQSection() {
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

  return (
    <section className="bg-white py-24 md:py-32">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-[#f0fdfa] border border-[#ccfbf1] mb-8">
            <span className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
              FAQ
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
            Got questions? We've got <span className="text-[#0d9488]">answers</span>.
          </h2>
          <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Everything you need to know about Iconic in a nutshell.
          </p>
        </div>

        {/* Accordion */}
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
            {faqs.map((faq, index) => (
              <Accordion key={index} type="single" collapsible className="w-full">
                <AccordionItem value={`item-${index}`} className="border-none mb-4 bg-gray-50 rounded-2xl px-8 hover:bg-gray-100 transition-colors">
                  <AccordionTrigger className="text-left py-6 hover:no-underline font-bold text-black text-lg">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-500 pb-6 leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
