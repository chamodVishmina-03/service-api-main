import dns from "node:dns"
import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import { UserModel, UserRole } from "../models/user.model"

// Some networks block Node's default DNS lookup for mongodb+srv:// addresses
dns.setServers(["8.8.8.8", "1.1.1.1"])

// Admin login can be set in .env (ADMIN_EMAIL / ADMIN_PASSWORD); defaults below.
const adminEmail = (process.env.ADMIN_EMAIL || "admin@vsrms.com").toLowerCase()
const adminPassword = process.env.ADMIN_PASSWORD || "Password@123"

const users = [
  { name: "Admin", email: adminEmail, password: adminPassword, roles: [UserRole.ADMIN] },
  { name: "Mike Mechanic", email: "mechanic@vsrms.com", password: "Password@123", roles: [UserRole.MECHANIC] },
  { name: "Cathy Customer", email: "customer@vsrms.com", password: "Password@123", roles: [UserRole.CUSTOMER] }
]

async function run() {
  await mongoose.connect(process.env.MONGO_LOCAL_URL || "")
  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, 10)
    const exists = await UserModel.findOne({ email: u.email })
    if (exists) {
      // Re-running the seed resets the password of the seeded accounts
      exists.password = hashed
      exists.roles = u.roles
      await exists.save()
      console.log("updated", u.email)
    } else {
      await UserModel.create({ name: u.name, email: u.email, password: hashed, roles: u.roles, approve: true })
      console.log("created", u.email)
    }
  }
  await mongoose.disconnect()
}
run()