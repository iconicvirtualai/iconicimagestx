import {
  Palette,
  Lightbulb,
  Zap,
  Users,
} from "lucide-react";

const ValueCard = ({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) => (
  <div className="bg-white border border-gray-200 rounded-lg p-8 hover:shadow-lg transition-shadow">
    <div className="mb-4">
      <Icon className="w-12 h-12 text-black" strokeWidth={1.5} />
    </div>
    <h3 className="text-xl font-bold text-black mb-3">{title}</h3>
    <p className="text-gray-600 leading-relaxed text-sm">{description}</p>
  </div>
);

export default function ValueProposition() {
  const values = [
    {
      icon: Palette,
      title: "Creative Services",
      description:
        "From concept to execution, our creative team delivers stunning visual content that tells your brand's story with authenticity and impact.",
    },
    {
      icon: Lightbulb,
      title: "Strategic Partnerships",
      description:
        "We collaborate as true partners, understanding your vision and working closely to achieve measurable results that drive growth.",
    },
    {
      icon: Zap,
      title: "Production Excellence",
      description:
        "State-of-the-art equipment and cutting-edge techniques ensure every project meets the highest standards of quality and innovation.",
    },
    {
      icon: Users,
      title: "Industry Expertise",
      description:
        "15+ years in media and entertainment. Our team brings deep knowledge and proven strategies for success in digital and traditional spaces.",
    },
  ];

  return (
    <section className="bg-white py-20 md:py-32">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-black mb-4">
            Why Partner With Iconic Images
          </h2>
          <p className="text-lg text-gray-600">
            We bring together creative excellence, strategic thinking, and 
            proven expertise to elevate your brand's presence in the market.
          </p>
        </div>

        {/* Value Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {values.map((value, index) => (
            <ValueCard key={index} {...value} />
          ))}
        </div>
      </div>
    </section>
  );
}
