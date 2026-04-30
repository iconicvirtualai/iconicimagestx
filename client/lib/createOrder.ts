/**
 * Iconic Images — Create Order
 * Posts to the server's /api/bookings endpoint so that:
 *  1. All form fields (including access info) are saved to Firestore
 *  2. Confirmation emails are sent to the client and coordinator
 */

export async function createOrder(formData: any) {
  const lineItems = formData.lineItems || [];
  const total     = formData.total     || 0;

  // Map form field names → server field names
  const payload = {
    firstName:              formData.firstName              || "",
    lastName:               formData.lastName               || "",
    email:                  formData.email                  || "",
    phone:                  formData.phone                  || "",
    address:                formData.address                || "",
    lineItems,
    total,
    pricing:                formData.pricing                || { subtotal: total, total },
    vibeNote:               formData.vibeNote               || formData.notes || "",
    squareFootage:          formData.sqft                   || formData.squareFootage || "",
    scheduledDate:          formData.serviceDate
                              ? new Date(formData.serviceDate).toLocaleDateString("en-US", {
                                  weekday: "long", year: "numeric", month: "long", day: "numeric",
                                })
                              : null,
    scheduledTime:          formData.serviceTime            || null,
    photographerPreference: formData.preferredPhotographer  || null,

    // Access / property details — were being silently dropped before
    accessMethod:           formData.accessInfo             || formData.accessMethod || "Lockbox",
    lockboxCode:            formData.lockboxCode            || formData.supraCode    || "",
    propertyStatus:         formData.propertyStatus         || "Vacant",
    furnishingStatus:       formData.furnishingStatus       || "Furnished",

    // Extras
    specializedPhotography: formData.specializedPhotography || "",
    virtualStagingCredits:  formData.virtualStagingCredits  || 0,
    leadSource:             formData.leadSource             || "",
  };

  console.log("POSTING ORDER TO /api/bookings:", payload);

  const res = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to submit booking request.");
  }

  console.log("ORDER CREATED:", data.requestId);
  return { success: true, requestId: data.requestId };
}
