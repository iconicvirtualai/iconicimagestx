import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminListingFile from "./AdminListingFile";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { getIdToken: async () => "token" },
    staffProfile: { role: "coordinator", name: "QA" },
    loading: false,
    isStaff: true,
    signOutUser: async () => undefined,
  }),
}));

const PLACES = {
  formatted: "100 Congress Ave, Austin, TX 78701",
  lat: 30.2648,
  lng: -97.7431,
  placeId: "place_congress",
};

function renderListing(address: unknown) {
  const project: Record<string, unknown> = {
    id: "bklist_req_m6dPeawQ4RQ63gA7LAMl",
    projectType: "real_estate",
    status: "scheduled",
    clientName: "QA Tester",
  };
  if (address !== undefined) project.address = address;
  return renderToString(
    <MemoryRouter initialEntries={["/admin/listing/bklist_req_m6dPeawQ4RQ63gA7LAMl"]}>
      <Routes>
        <Route
          path="/admin/listing/:id"
          element={<AdminListingFile initialProject={project} initialTab={5} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function heading(html: string): string {
  return html.match(/<h1 class="text-2xl[^"]*text-white">([^<]*)<\/h1>/)?.[1] ?? "";
}

describe("admin listing page address", () => {
  it("renders a legacy string address", () => {
    const html = renderListing("456 QA Lane");
    expect(heading(html)).toBe("456 QA Lane");
    expect(html).toContain("Property Address");
    expect(html).toContain("456 QA Lane");
    expect(html).not.toContain("[object Object]");
  });

  it("renders a Google Places address object as text", () => {
    const html = renderListing(PLACES);
    expect(heading(html)).toBe("100 Congress Ave, Austin, TX 78701");
    expect(html).toContain("100 Congress Ave, Austin, TX 78701");
    expect(html).not.toContain("place_congress");
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("Minified React error");
  });

  it("renders a placeholder when the address is missing", () => {
    const html = renderListing(undefined);
    expect(heading(html)).toBe("—");
    expect(html).toContain("QA Tester");
    expect(html).not.toContain("[object Object]");
  });
});
