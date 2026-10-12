/**
 * Hardcoded public copy. The live site keeps these strings until a page is published.
 */

import { LEGAL_BUSINESS_NAME } from "./businessContact.ts";
import { PUBLIC_PAGES } from "./siteSeo.ts";
import {
  type ContentItem,
  type ContentPage,
  areaField,
  block,
  contentPage,
  imageField,
  linkField,
  textField,
  videoField,
} from "./siteEditor.ts";

function seo(path: string): { title: string; description: string } {
  const page = PUBLIC_PAGES.find((item) => item.path === path);
  return {
    title: page?.title ?? "Iconic Images",
    description: page?.description ?? "",
  };
}

function linkItem(id: string, label: string, href: string): ContentItem {
  return { id, fields: [linkField("link", label, label, href)] };
}

function pairItem(id: string, label: string, before: string, after: string, afterKind: "image" | "video" = "image"): ContentItem {
  return {
    id,
    fields: [
      textField("label", "Label", label),
      imageField("before", "Before", before),
      afterKind === "video" ? videoField("after", "After", after) : imageField("after", "After", after),
    ],
  };
}

const HERO_IMAGE = "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F6529795874414a1e9fe845f3eb948e94?format=webp&width=1600&height=900";

const BUILDER_PAIRS: ContentItem[] = [
  pairItem("builder-1", "Listing film", "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Faecac2467163410db0180e8fdd8a98f7?format=webp&width=800&height=1200", "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4ea5feebdab84ee585ffaa811d803379?alt=media&token=dda6499e-44a2-47a4-a456-1cacb39b6ae4&apiKey=0ed22311ac6a4dbebeda1b4230c2746c", "video"),
  pairItem("builder-2", "Vertical cut", "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Fe7a04734046e4171bfccc96600f0870f?format=webp&width=800&height=1200", "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Fba0e88982aa140c2bd2a033055391c4a?alt=media&token=2faaf53d-9e02-4887-aa85-08c6f971cee4&apiKey=0ed22311ac6a4dbebeda1b4230c2746c", "video"),
  pairItem("builder-3", "Property film", "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F1bc44dc912bd4cd4848b7cbe64db7001?format=webp&width=800&height=1200", "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4203b3fa6d2046f6b3aebe85986706ad?alt=media&token=60e7a23a-12d3-45d9-8063-8fa212dc4c4c&apiKey=0ed22311ac6a4dbebeda1b4230c2746c", "video"),
  pairItem("builder-4", "Detail film", "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F54911d726f0a43b684406564dac1e5e8?format=webp&width=800&height=1200", "https://cdn.builder.io/o/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F4be86e27da6548d59c567aa0bdfc66e9?alt=media&token=927f0df1-6342-47f7-809f-131e4df074d6&apiKey=0ed22311ac6a4dbebeda1b4230c2746c", "video"),
];

const STILL_PAIRS: ContentItem[] = [
  pairItem("twilight-pool", "Twilight conversion", "/media/before-after/twilight-pool-day.jpg", "/media/before-after/twilight-pool-lifestyle.jpg"),
  pairItem("pavilion-lifestyle", "Lifestyle staging", "/media/before-after/pavilion-empty.jpg", "/media/before-after/pavilion-lifestyle.jpg"),
  pairItem("pasture-lifestyle", "Pasture lifestyle", "/media/before-after/pasture-animals.jpg", "/media/before-after/pasture-lifestyle.jpg"),
  pairItem("living-declutter", "Virtual declutter", "/media/before-after/living-occupied.jpg", "/media/before-after/living-declutter.jpg"),
];

function page(id: string, path: string, label: string, blocks: ContentPage["blocks"], title?: string, description?: string): ContentPage {
  const meta = seo(path);
  return contentPage(id, path, label, title ?? meta.title, description ?? meta.description, blocks);
}

const PAGES: ContentPage[] = [
  page("chrome", "", "Header, footer, and promo", [
    block("promo", "Promo bar", [
      textField("visible", "Show promo bar", "true"),
      textField("text", "Promo text", "FREE AI STAGING ON YOUR FIRST ORDER - CODE: ICONICAI"),
    ]),
    block("brand", "Logo and color", [
      textField("logoText", "Logo wordmark", "ICONIC"),
      textField("primaryColor", "Accent color", "#0d9488"),
      imageField("logo", "Logo image", "/media/logos/camera-logo-white-on-black.png"),
    ]),
    block("nav", "Navigation", [], [
      linkItem("about", "About", "/about"),
      linkItem("pricing", "Pricing", "/pricing"),
      linkItem("studio", "Studio 105", "/studio-105"),
      linkItem("portfolio", "Portfolio", "/portfolio"),
      linkItem("stock", "Stock Footage", "/stock-footage"),
      linkItem("contact", "Contact Us", "/contact"),
    ]),
    block("headerCtas", "Header buttons", [
      linkField("login", "Log in", "Log in", "/login"),
      linkField("book", "Book Now", "Book Now", "/book"),
    ]),
    block("footer", "Footer links", [
      textField("copyright", "Copyright name", LEGAL_BUSINESS_NAME),
    ], [
      linkItem("home", "Home", "/"),
      linkItem("pricing", "Pricing", "/pricing"),
      linkItem("socials", "Socials", "/socials"),
      linkItem("portfolio", "Portfolio", "/portfolio"),
      linkItem("studio", "Studio 105", "/studio-105"),
      linkItem("contact", "Contact Us", "/contact"),
      linkItem("login", "Client Login", "/login"),
    ]),
    block("socials", "Social profiles", [], [
      linkItem("facebook", "Facebook", "https://facebook.com/iconicimagestx"),
      linkItem("instagram", "Instagram", "https://instagram.com/iconicimagestx"),
      linkItem("tiktok", "TikTok", "https://tiktok.com/@iconicimagestx"),
    ]),
  ], "Iconic Images", "Shared header, footer, and promo."),

  page("home", "/", "Home", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "Your Brand, Made"),
      textField("title", "Headline", "ICONIC"),
      areaField("line1", "Supporting line", "Media Production. Virtual Staging. Content Management."),
      areaField("line2", "Body", "ICONIC is the dedicated creative crew for businesses and agents who demand more than \"good enough\"."),
      textField("weAre", "Rotator label", "WE ARE YOUR:"),
      imageField("image", "Background", HERO_IMAGE),
      linkField("ctaRealEstate", "Real estate button", "I'm in Real Estate", "/pricing#listings"),
      linkField("ctaBusiness", "Business button", "I own a Business", "/pricing#branding-personal"),
    ], [
      { id: "cap-1", fields: [textField("label", "Capability", "Cinematic Filmmakers")] },
      { id: "cap-2", fields: [textField("label", "Capability", "Social Architects")] },
      { id: "cap-3", fields: [textField("label", "Capability", "REEL Producers")] },
      { id: "cap-4", fields: [textField("label", "Capability", "Private Editing Studio")] },
      { id: "cap-5", fields: [textField("label", "Capability", "Content Managers")] },
      { id: "cap-6", fields: [textField("label", "Capability", "Personal Production Team")] },
    ]),
    block("beforeAfter", "Before and after", [
      textField("beforeLabel", "Before label", "Before"),
      textField("afterLabel", "After label", "After"),
    ], [...STILL_PAIRS, ...BUILDER_PAIRS]),
    block("raising", "We are the bar", [
      textField("titleLead", "Title lead", "We"),
      textField("titleAccent", "Title accent", "ARE"),
      textField("titleTail", "Title tail", "the Bar."),
      areaField("body", "Body", "We don’t follow trends. We break patterns. We don’t undercut. We outperform."),
    ]),
    block("market", "Our market", [
      textField("titleLead", "Title lead", "This Is"),
      textField("titleAccent", "Title accent", "OUR"),
      textField("titleTail", "Title tail", "Market."),
      areaField("body", "Body", "Iconic was built here. We’ve invested here. We’ve shaped here. Winning brands don’t chase. They choose Iconic."),
    ]),
    block("solution", "High-impact video", [
      textField("badge", "Badge", "Built for Creative Excellence"),
      textField("title", "Headline", "Your All-in-One Solution for High-Impact Media Content"),
      areaField("body", "Body", "Transform your raw ideas into engaging cinematic media in minutes. Whether you're a high-growth startup serving multiple clients or an established enterprise, Iconic helps you create professional-grade visual content seamlessly."),
    ], [
      { id: "product", fields: [videoField("video", "Video", "/media/video/product-photography.mp4"), textField("title", "Title", "Product Photography")] },
      { id: "vertical", fields: [videoField("video", "Video", "/media/reels/superpower-reel-12s.mp4"), textField("title", "Title", "Vertical Reel")] },
      { id: "content", fields: [videoField("video", "Video", "/media/video/content-web-clip.mp4"), textField("title", "Title", "Content Package")] },
      { id: "snap-luxury", fields: [videoField("video", "Video", "/media/videos/snap-reels/snap-reel-01.mp4"), textField("title", "Title", "Snap Reel · Luxury Tour")] },
      { id: "snap-modern", fields: [videoField("video", "Video", "/media/videos/snap-reels/snap-reel-02.mp4"), textField("title", "Title", "Snap Reel · Modern Living")] },
      { id: "snap-kitchen", fields: [videoField("video", "Video", "/media/videos/snap-reels/snap-reel-03.mp4"), textField("title", "Title", "Snap Reel · Kitchen Glow")] },
      { id: "snap-arrival", fields: [videoField("video", "Video", "/media/videos/snap-reels/snap-reel-04.mp4"), textField("title", "Title", "Snap Reel · Grand Arrival")] },
    ]),
    block("stats", "Stats", [], [
      { id: "assets", fields: [textField("value", "Value", "100,000+"), textField("label", "Label", "Media assets produced")] },
      { id: "turnaround", fields: [textField("value", "Value", "24 hrs"), textField("label", "Label", "Avg. turnaround time")] },
      { id: "engagement", fields: [textField("value", "Value", "+403%"), textField("label", "Label", "More brand engagement")] },
    ]),
    block("steps", "Steps", [
      textField("badge", "Badge", "4 STEPS TO RESULTS"),
      textField("title", "Headline", "From vision to viral in minutes, not days"),
      areaField("body", "Body", "Placing an order with Iconic is as simple as it gets. We handle the heavy lifting so you can focus on growth."),
    ], [
      { id: "step-1", fields: [textField("step", "Step", "STEP 1"), textField("title", "Title", "Book your session"), areaField("body", "Body", "Select your creative service and schedule a time through our seamless partnership portal in just a few clicks.")] },
      { id: "step-2", fields: [textField("step", "Step", "STEP 2"), textField("title", "Title", "We capture the vision"), areaField("body", "Body", "Our professional creative team arrives on-site with state-of-the-art equipment to capture high-impact raw media.")] },
      { id: "step-3", fields: [textField("step", "Step", "STEP 3"), textField("title", "Title", "Rapid post-production"), areaField("body", "Body", "Our expert editors transform raw clips into polished, cinematic masterpieces that perfectly align with your brand.")] },
      { id: "step-4", fields: [textField("step", "Step", "STEP 4"), textField("title", "Title", "Delivery & launch"), areaField("body", "Body", "Receive your ready-to-post assets within 24 hours. Download, publish, and dominate your social feed instantly.")] },
    ]),
    block("network", "The network", [
      textField("titleLead", "Title lead", "Built Bigger Than"),
      textField("titleAccent", "Title accent", "One Brand"),
      areaField("body", "Body", "Iconic isn’t here to squeeze the market; we’re here to expand it."),
    ]),
    block("audience", "Who it’s for", [
      textField("badge", "Badge", "WHO IT'S FOR"),
      textField("title", "Headline", "Tailored for real estate and visual storytelling professionals"),
      areaField("body", "Body", "Iconic simplifies media creation for real estate professionals, builders, and business owners — helping you showcase your vision and grow your presence."),
    ]),
    block("audienceDetails", "Audiences", [], [
      { id: "realtors", fields: [textField("title", "Title", "Realtors & Brokers"), areaField("body", "Body", "Attract leads, close faster, and win more listings with engaging property videos."), imageField("image", "Image", "/media/photos/lifestyle-mtz04327.jpg")] },
      { id: "photographers", fields: [textField("title", "Title", "Photographers"), areaField("body", "Body", "Upsell AI videos with every order. More profit, no effort."), imageField("image", "Image", "/media/photos/studio-mtz01691.jpg")] },
      { id: "media", fields: [textField("title", "Title", "Real Estate Media Companies"), areaField("body", "Body", "Scale your business and stay competitive with AI property videos — no extra overhead."), imageField("image", "Image", "/media/photos/drone-hero.jpg")] },
      { id: "developers", fields: [textField("title", "Title", "Developers & Builders"), areaField("body", "Body", "Showcase new construction and development projects with cinematic fly-throughs."), imageField("image", "Image", "/media/photos/luxury-exterior.jpg")] },
      { id: "business", fields: [textField("title", "Title", "Small Business Owners"), areaField("body", "Body", "Professional media content to tell your brand story and engage your local community."), imageField("image", "Image", "/media/photos/lifestyle-daughtery-mtz00636.jpg")] },
      { id: "online", fields: [textField("title", "Title", "Online Appearance"), areaField("body", "Body", "High-impact visual identity for anyone looking to dominate their digital space."), imageField("image", "Image", "/media/photos/headshot-gracepoint-1.jpg")] },
    ]),
    block("snapReels", "Snap Reels", [
      textField("kicker", "Kicker", "Essentials"),
      textField("title", "Headline", "Snap Reels"),
      areaField("body", "Body", "Listing stills, turned into a 9:16 Snap Reel. Same-day vertical video from the photos we already shoot."),
    ], [
      { id: "marias", fields: [videoField("video", "Video", "/media/videos/snap-reels/MariasWay_MarketingSnap_v1.mp4"), textField("title", "Title", "Marias Way"), textField("vibe", "Caption", "Evening light through the house, paced for a vertical scroll")] },
      { id: "heron", fields: [videoField("video", "Video", "/media/videos/snap-reels/HeronWing_MarketingSnap_v1.mp4"), textField("title", "Title", "Heron Wing"), textField("vibe", "Caption", "Clean lines and still water, cut for the feed")] },
      { id: "blue", fields: [videoField("video", "Video", "/media/videos/snap-reels/BlueLake_MarketingSnap_v1.mp4"), textField("title", "Title", "Blue Lake"), textField("vibe", "Caption", "Golden hour from the terrace to the lake")] },
    ]),
    block("features", "Add-on tools", [
      textField("badge", "Badge", "ADDITIONAL FEATURES"),
      textField("title", "Headline", "Go beyond basic editing with powerful add-on tools"),
      areaField("body", "Body", "Iconic isn't just about reels — enhance your content with smart AI tools designed to polish, extend, and personalize every video."),
    ], [
      { id: "snap", fields: [textField("title", "Title", "Snap Reels"), areaField("body", "Body", "Turn the listing stills into a 9:16 Snap Reel. A vertical cut buyers can watch before they ever book a showing.")] },
      { id: "import", fields: [textField("title", "Title", "One Click Import"), areaField("body", "Body", "Pull listing photos directly from Realtor.com or Zillow to start your video in seconds.")] },
      { id: "staging", fields: [textField("title", "Title", "AI Virtual Staging"), areaField("body", "Body", "Instantly furnish empty rooms with realistic AI staging to showcase your property's full potential.")] },
      { id: "edits", fields: [textField("title", "Title", "AI Photo Edits"), areaField("body", "Body", "Make your listing photos stand out with AI-powered enhancements — like twilights, lawn repairs, and other edits that instantly elevate any property.")] },
      { id: "studio", fields: [textField("title", "Title", "Studio"), areaField("body", "Body", "Iconic's built-in editor that allows you to customize your videos with templates, music, captions, branding, and even your own photos or clips.")] },
      { id: "voice", fields: [textField("title", "Title", "AI Voiceovers"), areaField("body", "Body", "Instantly generate natural-sounding narrations from a wide range of voices.")] },
      { id: "captions", fields: [textField("title", "Title", "Social Media Captions"), areaField("body", "Body", "Automatically create captions optimized for Instagram, Facebook, LinkedIn, YouTube, and X.")] },
      { id: "avatars", fields: [textField("title", "Title", "AI Avatars"), areaField("body", "Body", "Create professional video presentations with AI-generated avatars for a personal touch.")] },
    ]),
    block("reviews", "Reviews", [
      textField("badge", "Badge", "TESTIMONIALS"),
      textField("title", "Headline", "What our clients are saying"),
      areaField("body", "Body", "Agents and businesses trust Iconic Images for listing photography, video, and a fast, professional turnaround."),
      linkField("cta", "Button", "Book a shoot", "/book"),
    ]),
    block("faq", "FAQ", [
      textField("badge", "Badge", "FAQ"),
      textField("title", "Headline", "Got questions? We've got answers."),
      areaField("body", "Body", "Everything you need to know about Iconic in a nutshell."),
    ], [
      { id: "time", fields: [textField("question", "Question", "How long does video processing take?"), areaField("answer", "Answer", "Typically, our high-end media assets are delivered within 24 hours of capture. Our rapid post-production workflow is optimized for social media timelines.")] },
      { id: "portrait", fields: [textField("question", "Question", "Does Iconic support portrait mode?"), areaField("answer", "Answer", "Yes, we specialize in both cinematic landscape and scroll-stopping vertical content optimized for Reels, TikTok, and Shorts.")] },
      { id: "images", fields: [textField("question", "Question", "How many images can I use per video?"), areaField("answer", "Answer", "Our standard cinematic reel utilizes between 15-25 of the best property shots, but this can be customized based on your specific project needs.")] },
      { id: "length", fields: [textField("question", "Question", "How long is each video?"), areaField("answer", "Answer", "Most property reels are between 30-60 seconds, which is the 'sweet spot' for high engagement across modern social platforms.")] },
    ]),
    block("partnership", "Closing call to action", [
      textField("title", "Headline", "Let's Create Something ICONIC Together."),
      areaField("body", "Body", "Whether you're looking for creative services, strategic partnership, or media licensing solutions, our team is ready to discuss your vision and bring it to life."),
      linkField("cta", "Button", "Get your free Iconic Video", "/book"),
    ]),
  ]),

  page("pricing", "/pricing", "Pricing", [
    block("hero", "Hero", [
      textField("badge", "Badge", "Pricing & Packages"),
      textField("titleLead", "Title lead", "The Perfect"),
      textField("titleAccent", "Title accent", "Price"),
      textField("titleTail", "Title tail", "for Your Presence"),
      textField("subtitle", "Subtitle", "Media that moves as fast as you do."),
      videoField("background", "Background video", "/media/video/content-web-clip.mp4"),
    ]),
    block("chips", "Section jumps", [], [
      { id: "listings", fields: [textField("label", "Label", "FOR LISTINGS"), textField("anchor", "Anchor", "listings")] },
      { id: "branding", fields: [textField("label", "Label", "FOR BRANDING"), textField("anchor", "Anchor", "branding")] },
      { id: "business", fields: [textField("label", "Label", "FOR BUSINESS"), textField("anchor", "Anchor", "social")] },
      { id: "growth", fields: [textField("label", "Label", "FOR GROWTH"), textField("anchor", "Anchor", "brand-identity")] },
    ]),
    block("assistant", "AI assistant card", [
      textField("title", "Title", "Not sure where to start?"),
      textField("subtitle", "Subtitle", "Let our AI guide you"),
      linkField("cta", "Link", "Let our AI guide you", "/pricing/ai-assistant"),
    ]),
    block("doors", "Choose a path", [
      textField("title", "Headline", "Do you have..."),
      textField("timeTitle", "Time door title", "MORE TIME THAN MONEY"),
      areaField("timeBody", "Time door body", "I’m ready to hustle, I just need the tools and the professional polish to win."),
      textField("timeCta", "Time door button", "I'M READY TO HUSTLE →"),
      textField("moneyTitle", "Money door title", "MORE MONEY THAN TIME"),
      areaField("moneyBody", "Money door body", "I’m ready to scale, I need my time back and my brand on autopilot."),
      textField("moneyCta", "Money door button", "I'M READY TO SCALE →"),
    ]),
    block("listings", "Listings section", [
      textField("title", "Headline", "Listings & Spaces (The Property)"),
      areaField("body", "Body", "Targeting the listing lifecycle: Pre-launch buzz, active sale, and post-close legacy. Every package now includes a Listing Reel as the core deliverable. We don't just shoot; we trend."),
    ]),
    block("brandStages", "Personal brand", [
      textField("titleLead", "Title lead", "Elevate Your"),
      textField("titleAccent", "Title accent", "Personal Brand"),
      areaField("body", "Body", "Three beats. A stiff standard headshot, a polished Iconic corporate portrait, then a lifestyle frame with some life in it."),
    ], [
      { id: "standard", fields: [textField("label", "Label", "Standard"), imageField("image", "Photo", "/media/photos/standard-headshot.jpg"), textField("note", "Note", "Flat light. A stiff crop. Easy to scroll past.")] },
      { id: "corporate", fields: [textField("label", "Label", "Iconic Corporate"), imageField("image", "Photo", "/media/photos/lifestyle-mtz04327.jpg"), textField("note", "Note", "Polished, confident, and ready for the brand.")] },
      { id: "lifestyle", fields: [textField("label", "Label", "Iconic Lifestyle"), imageField("image", "Photo", "/media/photos/lifestyle-kennedy-mtz01127.jpg"), textField("note", "Note", "Alive. Warm. The frame people actually stop for.")] },
    ]),
  ]),

  page("book", "/book", "Book", [
    block("seoNote", "Booking page", [
      areaField("note", "Editor note", "The booking form, package prices, and promo math stay on the booking catalog so a copy edit cannot change what a client is charged."),
    ]),
  ]),

  page("seniorLiving", "/senior-living", "Senior Living", [
    block("hero", "Hero", [
      textField("titleLead", "Title lead", "Virtual tours for"),
      textField("titleAccent", "Title accent", "senior living"),
      areaField("location", "Location", "For communities in Spring, The Woodlands, and Houston."),
      areaField("sampleNote", "Sample note", "The sample tour is from a Woodlands-area senior living community."),
      linkField("cta", "Primary button", "Schedule when you're ready for us to come!", "#schedule"),
      imageField("hero", "Hero photo", "/senior-living/senior-living-01-hero.jpg"),
    ]),
    block("gallery", "Photo gallery", [
      textField("title", "Headline", "A Woodlands-area senior living community"),
    ]),
    block("tour", "Sample tour", [
      textField("title", "Headline", "Sample tour"),
      textField("embedTitle", "Tour title", "Sample tour of a Woodlands-area senior living community"),
    ]),
  ]),

  page("contact", "/contact", "Contact", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "CONTACT US"),
      textField("titleLead", "Title lead", "We'd love to"),
      textField("titleAccent", "Title accent", "hear from you"),
      areaField("body", "Body", "Have a question or feedback? We'd love to hear from you. Send us a message and we'll respond as soon as possible."),
      textField("chatKicker", "Chat kicker", "LIVE CHAT"),
      textField("chatLabel", "Chat label", "Start Chat"),
    ]),
  ]),

  page("about", "/about", "About", [
    block("hero", "Hero", [
      textField("badge", "Badge", "Decade of Excellence"),
      textField("titleLead", "Title lead", "A Decade of"),
      textField("titleAccent", "Title accent", "Setting the Standard."),
      areaField("body", "Body", "Est. 2016. 10 Years. Thousands of Listings. Millions in Commission Generated for our Partners."),
    ], [
      { id: "est", fields: [imageField("image", "Photo", "/media/about/tiles/01_est_2016.jpg"), textField("label", "Label", "Est. 2016")] },
      { id: "engine", fields: [imageField("image", "Photo", "/media/about/tiles/02_the_engine.jpg"), textField("label", "Label", "The Engine")] },
      { id: "scale", fields: [imageField("image", "Photo", "/media/about/tiles/03_scale.jpg"), textField("label", "Label", "Scale")] },
      { id: "growth", fields: [imageField("image", "Photo", "/media/about/tiles/04_growth.jpg"), textField("label", "Label", "Growth")] },
      { id: "legacy", fields: [imageField("image", "Photo", "/media/about/tiles/05_legacy.jpg"), textField("label", "Label", "Legacy")] },
      { id: "cinematic", fields: [imageField("image", "Photo", "/media/about/tiles/06_cinematic.jpg"), textField("label", "Label", "Cinematic")] },
      { id: "market", fields: [imageField("image", "Photo", "/media/about/tiles/08_market_lead.jpg"), textField("label", "Label", "Market Lead")] },
    ]),
    block("hub", "Intelligence hub", [
      textField("kicker", "Kicker", "THE INTELLIGENCE HUB: BEYOND THE LENS"),
      textField("title", "Headline", "Where Vision Meets Velocity."),
      areaField("body", "Body", "At Iconic Images, we don’t just capture real estate; we engineer market ownership. In a world of infinite scrolling, 'pretty pictures' are the bare minimum."),
      textField("philosophyTitle", "Philosophy title", "THE ICONIC PHILOSOPHY"),
      areaField("philosophy", "Philosophy", "We believe the agent is the architect of the deal, but the media is the fuel."),
    ]),
  ]),

  page("portfolio", "/portfolio", "Portfolio", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "Selected Work"),
      textField("title", "Headline", "Portfolio"),
      areaField("body", "Body", "People, families, studio, holiday, headshots, listings, aerials, and virtual staging from Iconic Images."),
    ]),
  ]),

  page("studio105", "/studio-105", "Studio 105", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "The physical studio"),
      textField("title", "Headline", "Studio 105"),
    ]),
    block("rooms", "Rooms", [], [
      { id: "studio-noir", fields: [textField("name", "Name", "Studio Noir"), textField("vibe", "Vibe", "Dark / dramatic"), areaField("summary", "Summary", "A controlled black room for portraits with edge, branding films, and product that needs mood.")] },
      { id: "studio-blanc", fields: [textField("name", "Name", "Studio Blanc"), textField("vibe", "Vibe", "Bright / white"), areaField("summary", "Summary", "A clean white room for crisp headshots, bright product, and holiday minis.")] },
    ]),
  ]),

  page("socials", "/socials", "Socials", [
    block("hero", "Hero", [
      textField("kicker", "Kicker", "Iconic channels"),
      textField("titleLead", "Title lead", "ICONIC"),
      textField("titleAccent", "Title accent", "EVERYWHERE."),
      areaField("body", "Body", "Follow Iconic Images. The frames below are from our own library."),
      textField("stillsTitle", "Stills heading", "Selected stills"),
    ], [
      { id: "drone", fields: [imageField("image", "Photo", "/media/photos/drone-hero.jpg"), textField("caption", "Caption", "Aerial still from an Iconic listing shoot.")] },
      { id: "pool", fields: [imageField("image", "Photo", "/media/before-after/twilight-pool-lifestyle.jpg"), textField("caption", "Caption", "Twilight conversion of a rear pool.")] },
      { id: "interior", fields: [imageField("image", "Photo", "/media/photos/luxury-interior.jpg"), textField("caption", "Caption", "Listing interior from the Iconic library.")] },
    ]),
  ]),

  page("stock", "/stock-footage", "Stock footage", [
    block("hero", "Hero", [
      textField("title", "Headline", "Stock Footage Library"),
      areaField("body", "Body", "Premium, professionally photographed real estate images by neighborhood. License instantly and use for your listings, marketing, or staging inspiration."),
    ]),
  ]),

  page("virtualStaging", "/services/virtual-staging", "Virtual staging", [
    block("hero", "Hero", [
      textField("titleLead", "Title lead", "AI"),
      textField("titleAccent", "Title accent", "Virtual Staging"),
      areaField("body", "Body", "Transform empty spaces into beautifully furnished rooms instantly. Our AI-powered staging helps buyers visualize their future home."),
      textField("free", "Free line", "Try for free"),
      linkField("cta", "Button", "Try for free", "/services/virtual-staging/select"),
    ]),
    block("pricing", "Pricing intro", [
      textField("titleLead", "Title lead", "Flexible"),
      textField("titleAccent", "Title accent", "Pricing"),
      areaField("body", "Body", "Choose between our lightning-fast AI tool or professional human edits for the ultimate quality."),
    ]),
  ]),

  page("go", "/go", "Go", [
    block("hero", "Hero", [
      textField("eyebrow", "Eyebrow", "Iconic Images"),
      textField("title", "Headline", "Real estate media that sells"),
      areaField("body", "Body", "Listing photos, film, and brand media from Iconic Images. Book a shoot when you are ready."),
      linkField("cta", "Button", "Book a shoot", "/book"),
      textField("documentTitle", "Browser title", "Iconic Images | Book your shoot"),
    ]),
  ], "Iconic Images | Book your shoot", "Listing photos, film, and brand media from Iconic Images. Book a shoot when you are ready."),

  page("agents", "/agents", "Agents", [
    block("hero", "Hero", [
      textField("badge", "Badge", "Exclusive Offer for Real Estate Agents"),
      textField("titleLead", "Title lead", "Get"),
      textField("titleAccent", "Title accent", "10X More Eyes"),
      textField("titleTail", "Title tail", "On Your Listings"),
      areaField("body", "Body", "Top-producing agents don't just list homes—they create experiences. Iconic Images provides the cinematic content you need to dominate your market and win every listing presentation."),
    ]),
  ]),

  page("privacy", "/privacy", "Privacy", [
    block("hero", "Title", [
      textField("title", "Headline", "Privacy Policy"),
    ]),
  ]),

  page("terms", "/terms", "Terms", [
    block("hero", "Title", [
      textField("title", "Headline", "Terms and Conditions"),
    ]),
  ]),

  page("login", "/login", "Login", [
    block("hero", "Sign in", [
      textField("title", "Wordmark", "ICONIC"),
    ]),
  ]),

  page("aiAssistant", "/pricing/ai-assistant", "AI assistant", [
    block("hero", "Hero", [
      textField("badge", "Badge", "AI Media Strategist"),
      textField("titleLead", "Title lead", "Find your"),
      textField("titleAccent", "Title accent", "perfect match"),
      areaField("body", "Body", "Answer a few questions and our AI will determine which service or package best suits your specific business goals."),
    ]),
  ]),

  page("unsubscribe", "/unsubscribe", "Unsubscribe", [
    block("hero", "Title", [
      textField("title", "Headline", "Unsubscribe"),
    ]),
  ]),
];

export function defaultPages(): ContentPage[] {
  return JSON.parse(JSON.stringify(PAGES)) as ContentPage[];
}

export function defaultPage(id: string): ContentPage | null {
  return defaultPages().find((item) => item.id === id) ?? null;
}

export function knownPageIds(): string[] {
  return PAGES.map((item) => item.id);
}
