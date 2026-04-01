import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
} from "firebase/firestore";

/**
 * Clean data for Firestore by removing undefined values
 */
function clean(data: any) {
  if (data === null || data === undefined) return null;
  if (data instanceof Date) return data; // Keep Date objects for Firestore
  if (Array.isArray(data)) return data.map(item => clean(item));
  if (typeof data === 'object') {
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
    const lineItems = formData.lineItems || [];
    const total = formData.total || 0;

    console.log("FINAL ORDER PAYLOAD:", {
      ...formData,
      lineItems,
      total
    });

    const docData = {
      firstName: formData.firstName || "",
      lastName: formData.lastName || "",
      clientName: (formData.firstName || "") + " " + (formData.lastName || ""),
      email: formData.email || "",
      phone: formData.phone || "",
      address: formData.address || "",
      lineItems: lineItems,
      pricing: {
        subtotal: total,
        total: total
      },
      total: total,
      vibeNote: formData.vibeNote || formData.notes || "",
      status: "new",
      createdAt: new Date()
    };

    await addDoc(collection(db, "orderRequests"), clean(docData));
    
    console.log("ORDER WRITTEN SUCCESSFULLY");

    return {
      success: true
    };

  } catch (error: any) {
    console.error("ORDER ERROR:", error);
    throw error;
  }
}
