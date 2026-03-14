import { addDoc, collection } from "firebase/firestore"
import { db } from "./firebase"

export async function testWrite() {
  console.log("TEST WRITE START")

  try {
    const docRef = await addDoc(collection(db, "appointments"), {
      test: "firebase working",
      createdAt: new Date()
    })

    console.log("TEST WRITE SUCCESS:", docRef.id)
  } catch (error) {
    console.error("FIRESTORE WRITE ERROR:", error)
  }
}
