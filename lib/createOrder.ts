import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function createOrder(data) {

  // 1️⃣ Create appointment
  const appointmentRef = await addDoc(collection(db, "appointments"), {
    startTime: data.startTime,
    endTime: data.endTime,
    location: data.location,
    photographerId: "",
    status: "pending",
    createdAt: serverTimestamp()
  });

  // 2️⃣ Create order
  const orderRef = await addDoc(collection(db, "orders"), {
    appointmentId: appointmentRef.id,
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    clientPhone: data.clientPhone,
    propertyAddress: data.propertyAddress,
    services: data.services,
    addons: data.addons,
    notes: data.notes,
    status: "new",
    createdAt: serverTimestamp()
  });

  return {
    orderId: orderRef.id,
    appointmentId: appointmentRef.id
  };
}
