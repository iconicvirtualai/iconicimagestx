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
    console.log("STEP 3: creating order");

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

    const orderRef = await addDoc(collection(db, "orders"), orderData);
    const orderId = orderRef.id;

    console.log("STEP 4: order created", orderId);

    // CREATE APPOINTMENT
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

    const appointmentRef = await addDoc(collection(db, "appointments"), appointmentData);
    console.log("STEP 6: appointment created", appointmentRef.id);

    // 3️⃣ Create the Order Request document with ALL fields
    console.log("STEP 7: creating order request record")
    const orderRequestData = {
      ...formData,
      orderId: orderId,
      appointmentId: appointmentRef.id,
      clientName: `${formData.firstName} ${formData.lastName}`,
      submittedAt: serverTimestamp(),
      status: "needs scheduled"
    };

    // Ensure serviceDate is serializable if it's a Date object
    if (orderRequestData.serviceDate instanceof Date) {
      orderRequestData.serviceDate = orderRequestData.serviceDate.toISOString();
    }

    await addDoc(collection(db, "orderRequests"), orderRequestData);

    return {
      orderId: orderRef.id,
      appointmentId: appointmentRef.id,
    };

  } catch (error) {
    console.error("ORDER ERROR:", error);
    throw error;
  }
}
