export type ClientReview = {
  /** Public attribution. Initials only — never a full name. */
  initials: string;
  role: "Google review" | "Client";
  quote: string;
  stars?: 5;
};

/** Cleared public reviews. Attribution is initials only. */
export const CLIENT_REVIEWS: ClientReview[] = [
  {
    initials: "R.J.",
    role: "Google review",
    stars: 5,
    quote:
      "Daniel was very professional, offered honest and insightful feedback. Great attitude! We enjoyed working with him. Highly recommend.",
  },
  {
    initials: "S.Y.",
    role: "Google review",
    stars: 5,
    quote:
      "Iconic Images has been providing me their services since they began and have been my go to ever since! The ease of scheduling, efficient communication, punctuality, quality and quick turnaround are some of the reasons why I highly recommend them. All photographers are professional and friendly. They always handle special requests with ease and no hesitations. Their services are a great asset to my business.",
  },
  {
    initials: "E.M.",
    role: "Client",
    stars: 5,
    quote: "Pedro was awesome. 5 stars!",
  },
  {
    initials: "H.D.",
    role: "Client",
    quote:
      "Thank you so much, the pictures look great and I have paid the invoice. Thank y'all so much for the quick turn around and wonderful service. My client had nothing but nice things to say about the photos process.",
  },
  {
    initials: "S.T.",
    role: "Client",
    quote: "Holy cow. Once again, Mike is the miracle worker. These look great!",
  },
  {
    initials: "L.F.",
    role: "Client",
    quote: "Yes, thank you so much. You guys always do a great job.",
  },
  {
    initials: "J.M.",
    role: "Client",
    quote: "Wow, that looks fantastic! This is exactly what I was hoping for.",
  },
  {
    initials: "N.I.",
    role: "Client",
    quote: "Love your work.",
  },
  {
    initials: "A.P.",
    role: "Client",
    quote: "Yes! That works. He did a great job.",
  },
  {
    initials: "C.B.",
    role: "Client",
    quote: "I'd like the same photographer. They did a great job. Same angles are great.",
  },
  {
    initials: "K.W.",
    role: "Client",
    quote: "After a quick review everything looks great!",
  },
  {
    initials: "A.A.",
    role: "Client",
    quote: "Outside of those items, the photos look perfect!",
  },
];

/** Homepage featured quote: the S.Y. Google review. */
export const FEATURED_REVIEW =
  CLIENT_REVIEWS.find((review) => review.initials === "S.Y.") ?? CLIENT_REVIEWS[0];

export function reviewMonogram(initials: string) {
  return initials.replace(/\./g, "");
}
