import { Response } from "express"
import mongoose from "mongoose"
import { JobStatus } from "../models/service-job.model"
import { generateDiagnosis } from "../services/ai.service"
import { AuthRequest } from "../middleware/auth"
import * as jobService from "../services/job.service"
import { Actor, badId, fail } from "../util/http"



const user = (req: AuthRequest) => req.user as Actor

// ---------- Customer ----------
export const createJob = async (req: AuthRequest, res: Response) => {
  try {
    const { vehicleId, serviceType, title } = req.body
    if (!vehicleId || !serviceType || !title)
      return res.status(400).json({ error: "vehicleId, serviceType and title required" })
    if (!mongoose.isValidObjectId(vehicleId))
      return res.status(400).json({ error: "Invalid vehicle ID" })

    const job = await jobService.createJob(user(req), req.body)
    res.status(201).json(job)
  } catch (error) {
    fail(res, error)
  }
}




export const getMyJobs = async (req: AuthRequest, res: Response) => {
  try {
    res.status(200).json(await jobService.listMyJobs(user(req), req.query as any))
  } catch (error) {
    fail(res, error)
  }
}

export const cancelJob = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (badId(res, [id])) return

    const job = await jobService.cancelJob(user(req), String(id), req.body?.note)
    res.status(200).json(job)
  } catch (error) {
    fail(res, error)
  }
}




// ---------- Mechanic ----------
// show all jobs
export const getAssignedJobs = async (req: AuthRequest, res: Response) => {
  try {
    res.status(200).json(await jobService.listAssignedJobs(user(req), req.query as any))
  } catch (error) {
    fail(res, error)
  }
}

// update status
export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { status, note, mileage } = req.body
    if (badId(res, [id])) return
    if (!Object.values(JobStatus).includes(status))
      return res.status(400).json({ error: "Invalid status" })

    const job = await jobService.changeJobStatus(
      user(req),
      String(id),
      status,
      note,
      mileage ? Number(mileage) : undefined
    )
    res.status(200).json(job)
  } catch (error) {
    fail(res, error)
  }
}


//update coasting
export const updateCosting = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (badId(res, [id])) return

    const job = await jobService.updateJobCosting(user(req), String(id), req.body)
    res.status(200).json(job)
  } catch (error) {
    fail(res, error)
  }
}






// ---------- Admin ----------

// all job show
export const getAllJobs = async (req: AuthRequest, res: Response) => {
  try {
    res.status(200).json(await jobService.listAllJobs(req.query as any))
  } catch (error) {
    fail(res, error)
  }
}


// assign work
export const assignMechanic = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { mechanicId } = req.body
    if (badId(res, [id, mechanicId])) return

    const job = await jobService.assignMechanicToJob(user(req), String(id), mechanicId)
    res.status(200).json(job)
  } catch (error) {
    fail(res, error)
  }
}




// ---------- Shared ----------
export const getJobById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (badId(res, [id])) return

    res.status(200).json(await jobService.getJob(user(req), String(id)))
  } catch (error) {
    fail(res, error)
  }
}


// diagnogsis
export const getAIDiagnosis = async (req: AuthRequest, res: Response) => {
  try {
    const { vehicleInfo, symptoms } = req.body
    if (!symptoms) return res.status(400).json({ error: "Symptoms required" })

    const diagnosis = await generateDiagnosis(vehicleInfo || "Unknown vehicle", symptoms)
    res.status(200).json({ diagnosis })
  } catch (error) {
    res.status(500).json({ error: "AI generation failed" })
  }
}

// ---------- Invoice & payment e-mails (Admin) ----------

// send invoice
export const sendInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (badId(res, [id])) return

    const result = await jobService.sendJobInvoice(user(req), String(id), req.body?.note)
    res.status(200).json(result)
  } catch (error) {
    fail(res, error, "Failed to send email")
  }
}


// update payment
export const updatePayment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (badId(res, [id])) return

    const result = await jobService.setJobPayment(user(req), String(id), req.body)
    res.status(200).json(result)
  } catch (error) {
    fail(res, error)
  }
}