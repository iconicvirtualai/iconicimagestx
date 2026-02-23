import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const ServiceCard = ({
  title,
  description,
  image,
}: {
  title: string;
  description: string;
  image: string;
}) => (
  <div className="group overflow-hidden rounded-lg bg-gray-900">
    {/* Image */}
    <div className="relative h-80 md:h-96 bg-gray-800 overflow-hidden">
      <img
        src={image}
        alt={title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors"></div>
    </div>

    {/* Content */}
    <div className="p-8">
      <h3 className="text-2xl font-bold text-white mb-3">{title}</h3>
      <p className="text-gray-300 text-sm leading-relaxed mb-6">{description}</p>

      <Link
        to="/services"
        className="inline-flex items-center gap-2 text-white hover:text-gray-200 transition-colors font-medium text-sm"
      >
        Learn More
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  </div>
);

export default function FeaturedServices() {
  const services = [
    {
      title: "Content Production",
      description:
        "End-to-end content creation from concept through post-production. We produce compelling photography, videography, and multimedia content.",
      image:
        "https://images.unsplash.com/photo-1633356122544-f134324ef6db?w=800&h=600&fit=crop",
    },
    {
      title: "Creative Direction",
      description:
        "Strategic visual storytelling that aligns with your brand identity. Our creative directors ensure consistency and impact across all media.",
      image:
        "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=600&fit=crop",
    },
    {
      title: "Media Licensing",
      description:
        "Access our extensive library of high-quality media assets. Licensing solutions tailored to your project needs and budget.",
      image:
        "https://images.unsplash.com/photo-1611532736579-6b16e2b50449?w=800&h=600&fit=crop",
    },
  ];

  return (
    <section className="bg-white py-20 md:py-32">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-black mb-4">
            Our Services
          </h2>
          <p className="text-lg text-gray-600">
            Comprehensive media solutions designed to elevate your brand and 
            connect with your audience in meaningful ways.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <ServiceCard key={index} {...service} />
          ))}
        </div>
      </div>
    </section>
  );
}
