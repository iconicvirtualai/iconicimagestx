import { addDoc, collection } from "firebase/firestore"
import { db } from "@/lib/firebase"

export async function testWrite() {

console.log("TEST WRITE START")

const docRef = await addDoc(collection(db, "appointments"), {
test: "firebase working",
createdAt: new Date()
})

console.log("TEST WRITE SUCCESS:", docRef.id)

}
