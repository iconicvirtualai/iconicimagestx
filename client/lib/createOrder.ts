import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

interface CreateOrderData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  sqft: string;
  serviceDate?: Date;
  serviceTime: string;
  selectedService: string;
  selectedBasics: string[];
  selectedAddOns: string[];
  premiumUpgrade: boolean;
  specializedPhotography?: "mls" | "social" | "both";
  vibeNote?: string;

  // NEW
  subtotal?: number;
  total?: number;
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

    console.log("[createOrder] STEP 2: Preparing order record...");

    const orderData = {
      clientName: `${formData.firstName} ${formData.lastName}`,
      clientEmail: formData.email,
      clientPhone: formData.phone,

      propertyAddress: formData.address,
      sqft: formData.sqft,

      services: formData.selectedService
        ? [formData.selectedService]
        : formData.selectedBasics,

      addons: formData.selectedAddOns,

      // 🔥 LINE ITEMS
      lineItems: [
        ...(formData.selectedService
          ? [{ name: formData.selectedService, price: 0 }]
          : (formData.selectedBasics || []).map((s: string) => ({
              name: s,
              price: 0,
            }))),

        ...(formData.selectedAddOns || []).map((a: string) => ({
          name: a,
          price: 0,
        })),
      ],

      // 🔥 PRICING
      pricing: {
        subtotal: formData.subtotal || 0,
        total: formData.total || 0,
      },

      specializedPhotography: formData.specializedPhotography || "mls",
      notes: formData.vibeNote || "",

      status: "new",
      createdAt: serverTimestamp(),
    };

    console.log("[createOrder] STEP 3: Writing order to database...");
    const orderRef = await addDoc(collection(db, "orders"), orderData);
    const orderId = orderRef.id;

    console.log("[createOrder] STEP 4: Order created successfully with ID:", orderId);

    // CREATE APPOINTMENT
    console.log("[createOrder] STEP 5: Preparing appointment record...");
    const appointmentData = {
      orderId: orderId,
      startTime: formData.serviceDate
        ? `${formData.serviceDate instanceof Date ? formData.serviceDate.toISOString().split('T')[0] : formData.serviceDate} ${formData.serviceTime}`
        : "",
      endTime: "",
      location: {
        addressLine: formData.address,
        city: "",
        state: "",
        zip: "",
      },
      photographerId: "",
      status: "pending",
      createdAt: serverTimestamp(),
    };

    console.log("[createOrder] STEP 6: Writing appointment to database...");
    const appointmentRef = await addDoc(collection(db, "appointments"), appointmentData);
    const appointmentId = appointmentRef.id;
    console.log("[createOrder] STEP 7: Appointment created successfully with ID:", appointmentId);

    // 3️⃣ Create the Order Request document with ALL fields
    console.log("[createOrder] STEP 8: Preparing order request record with all fields...");
    const orderRequestData = {
      ...formData,
      orderId: orderId,
      appointmentId: appointmentId,
      clientName: `${formData.firstName} ${formData.lastName}`,
      submittedAt: serverTimestamp(),
      status: "needs scheduled"
    };

    // Ensure serviceDate is serializable if it's a Date object
    if (orderRequestData.serviceDate instanceof Date) {
      orderRequestData.serviceDate = orderRequestData.serviceDate.toISOString();
    }

    console.log("[createOrder] STEP 9: Writing comprehensive order request to database...");
    await addDoc(collection(db, "orderRequests"), orderRequestData);
    console.log("[createOrder] SUCCESS: All records created successfully!");

    return {
      orderId: orderId,
      appointmentId: appointmentId,
    };

  } catch (error: any) {
    console.error("[createOrder] CRITICAL ERROR:", error);
    const customError = new Error(error?.message || "An unexpected error occurred during order creation.");
    (customError as any).originalError = error;
    throw customError;
  }
}
