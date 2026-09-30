console.log("FIREBASE_SERVICE_ACCOUNT:", process.env.FIREBASE_SERVICE_ACCOUNT ? "Exists" : "Missing");
console.log("FIREBASE_STORAGE_BUCKET:", process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET ? "Exists" : "Missing");
console.log("STAFF_SETUP_SECRET:", process.env.STAFF_SETUP_SECRET ? "Exists" : "Missing");
console.log("GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS ? "Exists" : "Missing");
