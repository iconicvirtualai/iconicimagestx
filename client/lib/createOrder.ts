import { db } from "@/client/lib/firebase";
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
  vibeNote?: string;
}

export async function createOrder(formData: CreateOrderData) {
  try {
    // 1. Create a document in the 'appointments' collection
    console.log("STEP 3: creating appointment")
    const appointmentData = {
      startTime: formData.serviceDate ? `${formData.serviceDate.toISOString().split('T')[0]} ${formData.serviceTime}` : "",
      endTime: "", // Left empty per instructions
      location: {
        addressLine: formData.address,
        city: "", // Instructions didn't specify parsing, so leaving as placeholders
        state: "",
        zip: ""
      },
      photographerId: "",
      status: "pending",
      createdAt: serverTimestamp(),
    };

    const appointmentRef = await addDoc(collection(db, "appointments"), appointmentData);
    console.log("STEP 4: appointment created", appointmentRef.id)
    const appointmentId = appointmentRef.id;

    // 2. Create a document in the 'orders' collection
    console.log("STEP 5: creating order")
    const orderData = {
      appointmentId,
      clientName: `${formData.firstName} ${formData.lastName}`,
      clientEmail: formData.email,
      clientPhone: formData.phone,
      propertyAddress: formData.address,
      services: formData.selectedService ? [formData.selectedService] : formData.selectedBasics,
      addons: formData.selectedAddOns,
      notes: formData.vibeNote || "",
      status: "new",
      createdAt: serverTimestamp(),
    };

    const orderRef = await addDoc(collection(db, "orders"), orderData);
    console.log("STEP 6: order created", orderRef.id)

    return { appointmentId, orderId: orderRef.id };
  } catch (error) {
    console.error("ORDER ERROR:", error);
    throw error;
  }
}
