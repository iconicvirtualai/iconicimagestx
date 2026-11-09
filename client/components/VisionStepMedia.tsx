const ORDER_FRAMES = [
  "/media/home-v2/steps/order-1.webp",
  "/media/home-v2/steps/order-2.webp",
  "/media/home-v2/steps/order-3.webp",
  "/media/home-v2/steps/order-4.webp",
] as const;

const SHOOTER = "/media/about/03_gear_bts_camera_16x9.jpg";
const STUDIO_BEFORE = "/media/before-after/twilight-pool-day.jpg";
const STUDIO_AFTER = "/media/before-after/twilight-pool-lifestyle.jpg";

const LISTING_PHOTOS = [
  { src: "/media/pay-at-close/luxury/marias/01-front-day.jpg", name: "Front" },
  { src: "/media/pay-at-close/luxury/marias/08-kitchen.jpg", name: "Kitchen" },
  { src: "/media/pay-at-close/luxury/marias/07-grand-interior.jpg", name: "Great room" },
  { src: "/media/pay-at-close/luxury/marias/05-pool-day.jpg", name: "Pool" },
  { src: "/media/pay-at-close/luxury/pool-rd/02-backyard-pool.jpg", name: "Back patio" },
  { src: "/media/pay-at-close/luxury/marias/06-aerial-day.jpg", name: "Aerial" },
] as const;

const STEP_CSS = `
.order-frame{position:absolute;inset:0;height:100%;width:100%;object-fit:cover;object-position:top;opacity:0;animation:order-show 16s infinite}
.order-frame:nth-child(1){animation-delay:0s}
.order-frame:nth-child(2){animation-delay:4s}
.order-frame:nth-child(3){animation-delay:8s}
.order-frame:nth-child(4){animation-delay:12s}
@keyframes order-show{0%,24%{opacity:1}27%,100%{opacity:0}}
.order-cursor{position:absolute;z-index:2;width:18px;height:18px;margin:-2px 0 0 -2px;animation:order-cursor 16s infinite;filter:drop-shadow(0 1px 1px rgba(0,0,0,.45))}
@keyframes order-cursor{
  0%,22%{left:18%;top:68%}
  28%,46%{left:24%;top:72%}
  52%,70%{left:38%;top:34%}
  77%,96%{left:28%;top:78%}
  100%{left:18%;top:68%}
}
.shooter-pan{animation:shooter-pan 9s ease-in-out infinite alternate}
@keyframes shooter-pan{from{transform:scale(1.04)}to{transform:scale(1.12) translate3d(-3%,-2%,0)}}
.studio-before{animation:studio-wipe 7.5s ease-in-out infinite}
.studio-handle{animation:studio-handle 7.5s ease-in-out infinite}
@keyframes studio-wipe{0%,14%{clip-path:inset(0 0 0 0)}46%,60%{clip-path:inset(0 100% 0 0)}92%,100%{clip-path:inset(0 0 0 0)}}
@keyframes studio-handle{0%,14%{left:calc(100% - 1px)}46%,60%{left:0}92%,100%{left:calc(100% - 1px)}}
.listing-scroll{animation:listing-scroll 18s linear infinite}
@keyframes listing-scroll{0%,8%{transform:translateY(0)}92%,100%{transform:translateY(-72%)}}
@media (prefers-reduced-motion: reduce){
  .order-frame,.order-cursor,.shooter-pan,.studio-before,.studio-handle,.listing-scroll{animation:none}
  .order-frame{opacity:0}
  .order-frame:first-child{opacity:1}
  .order-cursor{display:none}
  .studio-before{clip-path:inset(0 46% 0 0)}
  .studio-handle{left:54%}
}
`;

function kindFor(title: string, index: number) {
  const key = title.toLowerCase();
  if (key.includes("book")) return "order";
  if (key.includes("capture")) return "shoot";
  if (key.includes("post")) return "studio";
  if (key.includes("delivery") || key.includes("launch")) return "listing";
  return (["order", "shoot", "studio", "listing"] as const)[index] ?? "order";
}

export default function VisionStepMedia({ title, index }: { title: string; index: number }) {
  const kind = kindFor(title, index);
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#101418]" data-testid={`vision-step-${kind}`}>
      <style>{STEP_CSS}</style>
      {kind === "order" ? <OrderReel /> : null}
      {kind === "shoot" ? <Shooter /> : null}
      {kind === "studio" ? <StudioWipe /> : null}
      {kind === "listing" ? <ListingScroll /> : null}
    </div>
  );
}

function OrderReel() {
  return (
    <div className="relative h-full w-full" role="img" aria-label="The Iconic order page, with the cursor moving through each step. No order is sent.">
      {ORDER_FRAMES.map((src, index) => (
        <img
          key={src}
          src={src}
          alt=""
          width={900}
          height={1200}
          loading={index === 0 ? "eager" : "lazy"}
          decoding="async"
          className="order-frame"
        />
      ))}
      <svg className="order-cursor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 2 L4 20 L9 15.2 L13.2 22 L16 20.6 L11.8 14 H19 Z" fill="#fff" stroke="#111" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

function Shooter() {
  return (
    <img
      src={SHOOTER}
      alt="An Iconic photographer lining up a shot"
      width={1200}
      height={675}
      loading="lazy"
      decoding="async"
      className="shooter-pan h-full w-full object-cover"
    />
  );
}

function StudioWipe() {
  return (
    <div className="flex h-full flex-col bg-[#0d1418] text-white" role="img" aria-label="Studio editor wiping a raw photo into the edited photo">
      <div className="flex items-center justify-between px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-teal-200">
        <span>Iconic · Scratch pad</span>
        <span>Before / After</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <img src={STUDIO_AFTER} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <img src={STUDIO_BEFORE} alt="" className="studio-before absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <span className="studio-handle pointer-events-none absolute inset-y-0 z-10 w-px bg-white" />
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1 py-0.5 text-[8px] font-black uppercase tracking-widest">Raw</span>
        <span className="absolute right-1.5 top-1.5 rounded bg-[#14b8a6] px-1 py-0.5 text-[8px] font-black uppercase tracking-widest">Edited</span>
      </div>
      <div className="grid grid-cols-4 gap-1 p-1">
        {[STUDIO_BEFORE, STUDIO_AFTER, STUDIO_BEFORE, STUDIO_AFTER].map((src, index) => (
          <img key={`${src}-${index}`} src={src} alt="" className="aspect-[4/3] w-full rounded-sm object-cover opacity-90" loading="lazy" />
        ))}
      </div>
    </div>
  );
}

function ListingScroll() {
  return (
    <div className="flex h-full flex-col bg-[#f7f7f5] text-[#161616]">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-black/10 bg-white px-2 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[#d4d4d4]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#d4d4d4]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#d4d4d4]" />
        <span className="truncate text-[8px] font-black uppercase tracking-[0.16em] text-gray-500">Listing site</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden" role="img" aria-label="An Iconic listing website scrolling through property photos">
        <div className="listing-scroll">
          {LISTING_PHOTOS.map((photo, index) => (
            <figure key={photo.src} className="border-b border-black/5">
              <img
                src={photo.src}
                alt={photo.name}
                width={1200}
                height={800}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className="aspect-[4/3] w-full object-cover"
              />
              <figcaption className="bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#0f766e]">
                {String(index + 1).padStart(2, "0")} · {photo.name}
              </figcaption>
            </figure>
          ))}
          <p className="bg-black px-2 py-2 text-center text-[8px] font-black uppercase tracking-[0.16em] text-white">Powered by Iconic Images</p>
        </div>
      </div>
    </div>
  );
}
