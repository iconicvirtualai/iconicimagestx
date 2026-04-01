import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

/**
 * Clean data for Firestore by removing undefined values
 */
function clean(data: any) {
  if (data === null || data === undefined) return null;
  if (data instanceof Date) return data.toISOString();
  if (Array.isArray(data)) return data.map(item => clean(item));
  if (typeof data === 'object') {
    // Don't recurse into special Firestore FieldValues or other non-plain objects
    if (data.constructor && data.constructor.name !== 'Object') {
      return data;
    }
    const result: any = {};
    Object.keys(data).forEach(key => {
      result[key] = clean(data[key]);
    });
    return result;
  }
  return data;
}

export async function createOrder(formData: any) {
  try {
    console.log("[createOrder] STEP 1: Validating form data...");

    // Basic validation
    if (!formData.firstName || !formData.lastName || !formData.email) {
      const error = new Error("Missing required client information (first name, last name, or email)");
      console.error("[createOrder] Validation failed:", error.message);
      throw error;
    }

    if (!formData.address) {
      const error = new Error("Property address is required");
      console.error("[createOrder] Validation failed:", error.message);
      throw error;
    }

    console.log("[createOrder] STEP 2: Preparing order request record...");

    // Construct the document exactly as requested
    const orderRequestData = {
      clientName: `${formData.firstName} ${formData.lastName}`,
      clientEmail: formData.email,
      clientPhone: formData.phone,
      propertyAddress: formData.address,
      sqft: formData.sqft,
      services: formData.selectedService
        ? [formData.selectedService]
        : (formData.selectedBasics || []),
      addons: formData.selectedAddOns || [],
      lineItems: formData.lineItems || [],
      pricing: {
        subtotal: formData.subtotal || 0,
        total: formData.total || 0,
      },
      total: formData.total || 0,
      notes: formData.vibeNote || "",
      specializedPhotography: formData.specializedPhotography || "mls",
      submittedAt: serverTimestamp(),
      status: "needs scheduled"
    };

    console.log("[createOrder] STEP 3: Writing order request to database...");
    const requestRef = await addDoc(collection(db, "orderRequests"), clean(orderRequestData));
    const requestId = requestRef.id;

    console.log("[createOrder] SUCCESS: Order request created successfully with ID:", requestId);

    // Return the ID as orderId for compatibility with the frontend
    return {
      orderId: requestId,
    };

  } catch (error: any) {
    console.error("[createOrder] CRITICAL ERROR:", error);
    const customError = new Error(error?.message || "An unexpected error occurred during order creation.");
    (customError as any).originalError = error;
    throw customError;
  }
}
