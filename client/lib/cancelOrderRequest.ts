/** Cancel an order request on the server so a holiday calendar event is deleted too. */
export async function cancelOrderRequest(id: string, token: string): Promise<void> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(id)}/cancel`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "Could not cancel.";
    throw new Error(error);
  }
}
