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
}

export async function createOrder(formData: CreateOrderData) {
  try {
    // 1️⃣ Create the order first
    console.log("STEP 3: creating order")
    const orderData = {
      clientName: `${formData.firstName} ${formData.lastName}`,
      clientEmail: formData.email,
      clientPhone: formData.phone,
      propertyAddress: formData.address,
      services: formData.selectedService ? [formData.selectedService] : formData.selectedBasics,
      addons: formData.selectedAddOns,
      specializedPhotography: formData.specializedPhotography || "mls",
      notes: formData.vibeNote || "",
      status: "new",
      createdAt: serverTimestamp(),
    };

    const orderRef = await addDoc(collection(db, "orders"), orderData);
    const orderId = orderRef.id;
    console.log("STEP 4: order created", orderId)

    // 2️⃣ Create the appointment linked to that order
    console.log("STEP 5: creating appointment")
    const appointmentData = {
      orderId: orderId,
      startTime: formData.serviceDate
        ? `${formData.serviceDate.toISOString().split('T')[0]} ${formData.serviceTime}`
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
    console.log("STEP 6: appointment created", appointmentRef.id)

    // 3️⃣ Return both ids
    return {
      orderId: orderRef.id,
      appointmentId: appointmentRef.id,
    };
  } catch (error) {
    console.error("ORDER ERROR:", error);
    throw error;
  }
}
