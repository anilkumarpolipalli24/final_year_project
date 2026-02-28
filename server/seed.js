"use strict";
require("dotenv").config();

const mongoose = require("mongoose");
const User     = require("./models/User");

const MONGO_URI = process.env.MONGO_URI;

const users = [
  { name: "System Admin", email: "durgaraopolipalli24@gmail.com", password: "admin123", role: "SUPER_ADMIN", isActive: true, isVerified: true },
  { name: "Dr. K. Ramesh", email: "anilkumarpolipalli24@gmail.com", password: "principal123", role: "ADMIN", department: "Administration", isActive: true, isVerified: true },
  { name: "Dr. P. Suresh", email: "gunasrigedda29@gmail.com", password: "hod123", role: "HOD", department: "CSE", isActive: true, isVerified: true },
  { name: "Mr. A. Venkat", email: "faculty1@svec.edu.in", password: "faculty123", role: "FACULTY", department: "CSE", isActive: true, isVerified: true },
  { name: "Anil Kumar", email: "student1@svec.edu.in", password: "student123", role: "STUDENT", department: "CSE", studentId: "20CS001", isActive: true, isVerified: true },
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Atlas connected");

    await User.deleteMany({});
    console.log("🗑 Old users cleared");

    for (const u of users) {
      await User.create(u);   // ← model handles hashing
      console.log(`✅ Created: ${u.email}`);
    }

    console.log("\n⚡ Seeding Complete\n");

  } catch (err) {
    console.error("❌ Seed error:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected");
  }
}

seed();