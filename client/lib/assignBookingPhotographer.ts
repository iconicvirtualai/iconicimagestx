/** Ask the server to put the booked shooter's staff uid on a listing. */
export async function assignBookingPhotographer(input: {
  orderRequestId: string;
  listingId: string;
  token: string;
}): Promise<void> {
  const response = await fetch(`/api/bookings/${encodeURIComponent(input.orderRequestId)}/assign-photographer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({ listingId: input.listingId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.error === "string" ? data.error : "Could not assign the photographer.");
  }
}
