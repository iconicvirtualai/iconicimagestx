import { ListingTile } from "@/components/client-home/ClientHomeDashboard";
import type { ClientListingCard } from "@shared/clientHome";

function sample(overrides: Partial<ClientListingCard> & Pick<ClientListingCard, "id" | "look">): ClientListingCard {
  return {
    address: "123 Main Street, Conroe, TX 77304",
    status: "delivered",
    projectType: "real_estate",
    imageCount: 0,
    coverUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    appointmentDate: "2026-01-01",
    href: `/portal/listings/${overrides.id}`,
    street: "123 Main Street",
    locality: "Conroe, TX 77304",
    shootDateLabel: "01.01.2026",
    beds: "",
    baths: "",
    garage: "",
    pool: "",
    ...overrides,
  };
}

const CARDS: ClientListingCard[] = [
  sample({ id: "just-photos", look: "just-photos" }),
  sample({ id: "essentials", look: "essentials" }),
  sample({
    id: "showcase",
    look: "showcase",
    beds: "3",
    baths: "2",
    garage: "3",
    pool: "Y",
  }),
  sample({
    id: "legacy",
    look: "legacy",
    street: "123 Main St.",
    address: "123 Main St., Conroe, TX 77304",
    beds: "3",
    baths: "3",
    garage: "2",
    pool: "Y",
  }),
];

/** Coordinator review of the four package tiles. The client home uses the same ListingTile. */
export default function ListingCardPreview() {
  return (
    <main className="min-h-screen bg-[#f3f4f6] px-6 py-10 text-black">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2">
        {CARDS.map((listing) => (
          <ListingTile key={listing.id} listing={listing} />
        ))}
      </div>
    </main>
  );
}
