import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

export async function createOrder(formData: any) {
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
    console.log("STEP 6: appointment created", appointmentRef.id)

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

    // 4️⃣ Return both ids
    return {
      orderId: orderRef.id,
      appointmentId: appointmentRef.id,
    };
  } catch (error) {
    console.error("ORDER ERROR:", error);
    throw error;
  }
}
