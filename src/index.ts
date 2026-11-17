import dns from "node:dns"
import express from "express"
import mongoose from "mongoose"
import cors from "cors"
import dotenv from "dotenv"
import AuthRouter from "./routes/auth.routers"
import VehicleRouter from "./routes/vehicle.routers"
import JobRouter from "./routes/job.routers"
import AdminRouter from "./routes/admin.routers"
dotenv.config({ quiet: true })

// Local dev only: some networks/ISPs block the DNS SRV lookup used by mongodb+srv
if (!process.env.VERCEL) dns.setServers(["8.8.8.8", "1.1.1.1"])

const MONGO_URL = process.env.MONGO_LOCAL_URL || ""
const PORT = process.env.PORT || 5000

const app = express()

app.use(cors())
app.use(express.json())



// Serverless: connect lazily and reuse the connection between requests
let connecting: Promise<typeof mongoose> | null = null
const connectDB = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose)
  if (!connecting) {
    connecting = mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 8000 }).catch((err) => {
      connecting = null // allow a retry on the next request
      throw err
    })
  }
  return connecting
}

app.use(async (_req, res, next) => {
  try {
    await connectDB()
    next()
  } catch (err: any) {
    console.error("Fail to connect DB..!", err.message)
    res.status(500).json({ message: "Database connection failed" })
  }
})

app.get("/health", (_req, res) => res.json({ status: "ok" }))
app.use("/api/v1/auth", AuthRouter)
app.use("/api/v1/vehicles", VehicleRouter)
app.use("/api/v1/jobs", JobRouter)
app.use("/api/v1/admin", AdminRouter)





// Local development only. On Vercel the exported app is used as the function.
if (!process.env.VERCEL) {
  connectDB()
    .then(() => {
      console.log("DB connected..!")
      app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`))
    })
    .catch((err) => console.error("Fail to connect DB..!", err.message))
}

export default app