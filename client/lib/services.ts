export interface Service {
  id: string;
  name: string;
  category: "listings" | "branding" | "business" | "growth";
  price: number;
  description: string;
  tagline?: string;
  isPopular?: boolean;
  phase?: 1 | 2;
  highlights?: string;
  features?: string[];
}

export const services: Service[] = [
  // Listings
  {
    id: "listing-essentials",
    name: "The Essentials",
    category: "listings",
    price: 249,
    description: "Clean, bright, and ready to post. Perfect for quick turnarounds.",
    features: [
      "30 Images",
      "The 'Snap' Reel (15s)",
      "Trending Audio",
      "Pre-Launch Delivery Packet",
      "1 Iconic Twilight Render",
      "Same Day Delivery*"
    ]
  },
  {
    id: "listing-showcase",
    name: "The Showcase",
    category: "listings",
    price: 549,
    description: "A complete visual deep-dive. We capture the details, the angles, and the atmosphere.",
    isPopular: true,
    features: [
      "50 Images",
      "5 Aerials",
      "The 'Snap' Reel (15s)",
      "1 'Iconic' 3D Animated Reel (60s Vert)",
      "2D Floorplan",
      "Pre-Launch Delivery Packet",
      "2 Iconic Twilight Renders",
      "Same Day Delivery*"
    ]
  },
  {
    id: "listing-legacy",
    name: "The Legacy",
    category: "listings",
    price: 899,
    description: "Our highest level of care. We create a cinematic experience.",
    features: [
      "Full Images",
      "Full Aerials",
      "The 'Snap' Reel (15s)",
      "1 'Iconic' 3D Animated Reel (60s Vert)",
      "90s 4K Cinematic Property Video (with Aerial)",
      "Pre-Launch Delivery Packet",
      "5 Iconic Twilight Renders",
      "Agent On Camera Intro/Outro",
      "3D Motion Graphics and Animations",
      "Same Day Delivery*"
    ]
  },
  {
    id: "listing-market-leader",
    name: "The Market Leader",
    category: "listings",
    price: 1599,
    description: "Total market saturation strategy. Full-cycle media partner.",
    features: [
      "Full Images (Next-Day)",
      "Full Aerials (Same-Day by 7PM)",
      "The 'Snap' Reel (15s) (Same-Day by 7PM)",
      "1 'Iconic' Animated Reel (60s Vert) (Next-Day)",
      "2D Floorplan (Next-Day)",
      "Pre-Launch Delivery Packet (Same-Day by 7PM)",
      "5 Iconic Twilight Renders (Same-Day by 7PM)",
      "90s 4K Cinematic Video (Next-Day)",
      "VR / Matterport (Vision Pro Ready) & 2D Floorplan (Next-Day)",
      "The Iconic Finish - Complimentary Premium Editing",
      "Post-Sale Marketing Package (Scheduled)"
    ]
  },

  // Branding
  {
    id: "branding-refresh",
    name: "The Refresh",
    category: "branding",
    price: 349,
    description: "The Modern Portrait. Approachable, professional, and uniquely you.",
    features: [
      "60-Minute Session",
      "10 High-End 'Lifestyle' Portraits",
      "The Woodlands/Spring Locations",
      "AI Digital Twin Lite Setup",
      "Voice and Likeness Cloning"
    ]
  },
  {
    id: "branding-content-partner",
    name: "The Content Partner",
    category: "branding",
    price: 999,
    description: "30 days of content in 2 hours. Never wonder what to post again.",
    isPopular: true,
    features: [
      "2-Hour Monthly Filming Session",
      "Full Strategy, Scripting & Direction",
      "20 Custom Reels for Socials",
      "Trending Audio & Personal Branding"
    ]
  },
  {
    id: "branding-local-legend",
    name: "The Local Legend",
    category: "branding",
    price: 2499,
    description: "The Market Takeover Campaign. Your Story, Told Cinematically.",
    features: [
      "6-8 Hour Signature Production Day",
      "90-Second 4K Bio Film",
      "5 \"Local Authority\" Neighborhood Spotlights",
      "Pre-Production \"Vibe Check\" and Professional Scripting",
      "Post-Production Guidance and Marketing Review"
    ]
  },

  // Business (Social Monopoly)
  {
    id: "business-baseline",
    name: "The Baseline",
    category: "business",
    price: 500,
    description: "The Professional Foundation. Establish consistency with 8 edited reels per month.",
    phase: 1,
    features: [
      "8 Professionally Edited Reels (2/week)",
      "Signature \"Iconic\" 2026 Editing Style",
      "Trending Audio & Brand Integration"
    ]
  },
  {
    id: "business-growth-engine",
    name: "The Growth Engine",
    category: "business",
    price: 850,
    description: "Turning Views into Conversations. 12 edited reels with high-conversion hooks.",
    phase: 1,
    isPopular: true,
    features: [
      "12 Professionally Edited Reels (3/week)",
      "The Hook Suite: High-conversion captions & strategic hashtags.",
      "Scroll-Stopping Visual Flow.",
      "Conversion-Focused Copywriting"
    ]
  }
];
