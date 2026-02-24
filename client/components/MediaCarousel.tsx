export default function MediaCarousel() {
  const mediaItems = [
    {
      id: 1,
      image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
      type: "real-estate",
    },
    {
      id: 2,
      image: "https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=800&q=80",
      type: "interior",
    },
    {
      id: 3,
      image: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800&q=80",
      type: "kitchen",
    },
    {
      id: 4,
      image: "https://images.unsplash.com/photo-1600585154526-990dcea4db0d?w=800&q=80",
      type: "bedroom",
    },
    {
      id: 5,
      image: "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=800&q=80",
      type: "living-room",
    },
    {
      id: 6,
      image: "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800&q=80",
      type: "bathroom",
    },
  ];

  // Double the items for seamless loop
  const displayItems = [...mediaItems, ...mediaItems];

  return (
    <div className="relative w-full overflow-hidden bg-white py-12">
      {/* Gradient Mask for edges */}
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>

      <div className="flex animate-scroll whitespace-nowrap">
        {displayItems.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="flex-shrink-0 w-72 h-48 md:w-96 md:h-64 mx-3 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer relative group"
          >
            <img
              src={item.image}
              alt={item.type}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {/* Split screen effect for some items to mimic "Before/After" */}
            {index % 3 === 0 && (
              <div className="absolute inset-0 flex">
                <div className="w-1/2 h-full border-r border-white/50 relative">
                   <div className="absolute inset-0 bg-black/10"></div>
                </div>
                <div className="w-1/2 h-full"></div>
              </div>
            )}
            <div className="absolute bottom-4 left-4">
               <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-wider border border-white/30">
                 {item.type.replace("-", " ")}
               </div>
            </div>
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 40s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
}
