import * as functions from "firebase-functions"
import * as admin from "firebase-admin"
import { google } from "googleapis"
import twilio from "twilio"

admin.initializeApp()

const twilioClient = twilio(
process.env.TWILIO_ACCOUNT_SID,
process.env.TWILIO_AUTH_TOKEN
)

const gmailAuth = new google.auth.JWT(
process.env.GOOGLE_CLIENT_EMAIL,
undefined,
process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,"\n"),
["https://www.googleapis.com/auth/gmail.send","https://www.googleapis.com/auth/calendar"]
)

const gmail = google.gmail({ version:"v1", auth:gmailAuth })
const calendar = google.calendar({ version:"v3", auth:gmailAuth })

export const onOrderCreated = functions.firestore
.document("orders/{orderId}")
.onCreate(async (snap,context)=>{

const order = snap.data()

const clientEmail = order.clientEmail
const clientPhone = order.clientPhone
const address = order.propertyAddress
const startTime = order.startTime

const message = `Your Iconic Images shoot has been scheduled.`

// SEND EMAIL
const emailRaw = Buffer.from(
`From: photos@iconicimagestx.com
To: ${clientEmail}
Subject: Iconic Images Booking Confirmation

Your shoot has been scheduled for ${startTime}

Address:
${address}
`
).toString("base64")

await gmail.users.messages.send({
userId:"me",
requestBody:{ raw: emailRaw }
})

// SEND SMS
if(clientPhone){
await twilioClient.messages.create({
body:`Iconic Images booking confirmed at ${address}`,
from:process.env.TWILIO_PHONE,
to:clientPhone
})
}

// CREATE CALENDAR EVENT
await calendar.events.insert({
calendarId:"primary",
requestBody:{
summary:"Iconic Images Photo Shoot",
location:address,
start:{ dateTime:startTime },
end:{ dateTime:startTime },
attendees:[{ email:clientEmail }]
}
})

})
