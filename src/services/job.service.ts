import { ServiceJob, JobStatus } from "../models/service-job.model"
import { Vehicle } from "../models/vehicle.model"
import { UserModel, UserRole } from "../models/user.model"
import { isMailConfigured, sendMail } from "./mail.service"
import { buildInvoiceEmail } from "./invoice.service"
import { Actor, HttpError, isAdmin } from "../util/http"

// ---------- Business rules ----------
export const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.PENDING]: [JobStatus.APPROVED, JobStatus.CANCELLED],
  [JobStatus.APPROVED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]: [
    JobStatus.WAITING_PARTS,
    JobStatus.COMPLETED,
    JobStatus.CANCELLED
  ],
  [JobStatus.WAITING_PARTS]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: []
}

const CLOSED = [JobStatus.COMPLETED, JobStatus.CANCELLED]

const canAccess = (user: Actor, job: any) => {
  if (isAdmin(user)) return true
  const customerId = (job.customer?._id ?? job.customer).toString()
  const mechanicId = job.mechanic ? (job.mechanic._id ?? job.mechanic).toString() : null
  return customerId === user.sub || mechanicId === user.sub
}

// Only the assigned mechanic may work on a job
const assertAssignedMechanic = (user: Actor, job: any) => {
  if (!isAdmin(user) && job.mechanic?.toString() !== user.sub)
    throw new HttpError(403, "This job is not assigned to you")
}

const populateJob = (q: any) =>
  q
    .populate("vehicle", "make vehicleModel year plateNumber imageURL mileage")
    .populate("customer", "name email phone")
    .populate("mechanic", "name email")

const findJobOrFail = async (id: string) => {
  const job = await ServiceJob.findById(id)
  if (!job) throw new HttpError(404, "Job not found")
  return job
}

const pushHistory = (job: any, user: Actor, status: JobStatus, note: string) => {
  job.statusHistory.push({ status, changedBy: user.sub as any, note, at: new Date() })
}

// ---------- Listing ----------
export interface ListQuery {
  page?: string
  limit?: string
  status?: string
}

const paginate = async (query: ListQuery, filter: any) => {
  const page = parseInt(query.page as string) || 1
  const limit = parseInt(query.limit as string) || 10

  if (query.status && Object.values(JobStatus).includes(query.status as JobStatus))
    filter.status = query.status

  const jobs = await populateJob(
    ServiceJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
  )
  const total = await ServiceJob.countDocuments(filter)

  return { data: jobs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
}

export const listMyJobs = (user: Actor, query: ListQuery) =>
  paginate(query, { customer: user.sub })

export const listAssignedJobs = (user: Actor, query: ListQuery) =>
  paginate(query, { mechanic: user.sub })

export const listAllJobs = (query: ListQuery & { search?: string }) => {
  const filter: any = {}
  const search = query.search?.trim()
  if (search) filter.jobNumber = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
  return paginate(query, filter)
}

export const getJob = async (user: Actor, id: string) => {
  const job = await populateJob(ServiceJob.findById(id)).populate(
    "statusHistory.changedBy",
    "name"
  )
  if (!job) throw new HttpError(404, "Job not found")
  if (!canAccess(user, job)) throw new HttpError(403, "Forbidden")
  return job
}




// ---------- Customer ----------
export interface CreateJobInput {
  vehicleId: string
  serviceType: string
  title: string
  description?: string
  priority?: "LOW" | "NORMAL" | "URGENT"
  scheduledDate?: string
  aiDiagnosis?: string
}


// create job
export const createJob = async (user: Actor, input: CreateJobInput) => {
  const vehicle = await Vehicle.findById(input.vehicleId)
  if (!vehicle) throw new HttpError(404, "Vehicle not found")

  if (!isAdmin(user) && vehicle.owner.toString() !== user.sub)
    throw new HttpError(403, "You can only book service for your own vehicle")

  return ServiceJob.create({
    vehicle: vehicle._id,
    customer: vehicle.owner,
    serviceType: input.serviceType,
    title: input.title,
    description: input.description,
    priority: input.priority,
    scheduledDate: input.scheduledDate || undefined,
    aiDiagnosis: input.aiDiagnosis || "",
    statusHistory: [{ status: JobStatus.PENDING, changedBy: user.sub, note: "Job created" }]
  })
}


// cancel jobs
export const cancelJob = async (user: Actor, id: string, note?: string) => {
  const job = await findJobOrFail(id)

  if (!isAdmin(user) && job.customer.toString() !== user.sub)
    throw new HttpError(403, "Forbidden")
  if (![JobStatus.PENDING, JobStatus.APPROVED].includes(job.status) && !isAdmin(user))
    throw new HttpError(400, "Job can no longer be cancelled")
  if (!TRANSITIONS[job.status].includes(JobStatus.CANCELLED))
    throw new HttpError(400, "Job cannot be cancelled")

  job.status = JobStatus.CANCELLED
  pushHistory(job, user, JobStatus.CANCELLED, note || "Cancelled")
  await job.save()
  return job
}



// ---------- Mechanic ----------
export const changeJobStatus = async (
  user: Actor,
  id: string,
  status: JobStatus,
  note?: string,
  mileage?: number
) => {
  const job = await findJobOrFail(id)
  assertAssignedMechanic(user, job)

  if (!TRANSITIONS[job.status].includes(status))
    throw new HttpError(400, `Cannot change status from ${job.status} to ${status}`)
  if (status === JobStatus.IN_PROGRESS && !job.mechanic)
    throw new HttpError(400, "Assign a mechanic first")

  job.status = status
  if (status === JobStatus.COMPLETED) {
    job.completedAt = new Date()
    if (mileage) await Vehicle.findByIdAndUpdate(job.vehicle, { mileage })
  }
  pushHistory(job, user, status, note || "")
  await job.save()
  return job
}

export interface CostingInput {
  parts?: any
  laborCost?: any
  mechanicNotes?: string
}

// cost pars and etc
export const updateJobCosting = async (user: Actor, id: string, input: CostingInput) => {
  const job = await findJobOrFail(id)
  assertAssignedMechanic(user, job)
  if (CLOSED.includes(job.status)) throw new HttpError(400, "Closed jobs cannot be edited")

  if (Array.isArray(input.parts)) job.parts = input.parts
  if (input.laborCost !== undefined) job.laborCost = Number(input.laborCost) || 0
  if (input.mechanicNotes !== undefined) job.mechanicNotes = input.mechanicNotes

  await job.save() // pre-save hook recalculates totalCost
  return job
}



// ---------- Admin ----------
export const assignMechanicToJob = async (user: Actor, id: string, mechanicId: string) => {
  const mechanic = await UserModel.findById(mechanicId)
  if (!mechanic || !mechanic.roles.includes(UserRole.MECHANIC))
    throw new HttpError(400, "Selected user is not a mechanic")

  const job = await findJobOrFail(id)
  if (CLOSED.includes(job.status)) throw new HttpError(400, "Closed jobs cannot be reassigned")

  job.mechanic = mechanic._id as any
  if (job.status === JobStatus.PENDING) {
    job.status = JobStatus.APPROVED
    pushHistory(job, user, JobStatus.APPROVED, `Assigned to ${mechanic.name}`)
  }
  await job.save()
  return populateJob(ServiceJob.findById(id))
}



// ---------- Invoice & payment e-mails  ----------
const loadForEmail = (id: string) =>
  ServiceJob.findById(id)
    .populate("vehicle")
    .populate("customer", "name email phone")
    .populate("mechanic", "name email")

const deliver = async (user: Actor, job: any, opts: { note?: string; receipt?: boolean }) => {
  const admin = await UserModel.findById(user.sub)
  const { subject, html } = buildInvoiceEmail(job, {
    adminName: admin?.name || "AutoCare",
    adminEmail: admin?.email || "",
    note: opts.note,
    receipt: opts.receipt
  })

  if (isMailConfigured()) {
    // Sent through the service centre's mailbox; replies go to the admin who sent it
    await sendMail(job.customer.email, subject, html, admin?.email)
    return { sent: true as const }
  }

  console.log(`[invoice-email] (SMTP not configured) To: ${job.customer.email}\nSubject: ${subject}`)
  return {
    sent: false as const,
    devPreview: process.env.NODE_ENV !== "production" ? html : undefined
  }
}


// sent job invoice
export const sendJobInvoice = async (user: Actor, id: string, note?: string) => {
  const job: any = await loadForEmail(id)
  if (!job) throw new HttpError(404, "Job not found")
  if (!job.customer?.email) throw new HttpError(400, "Customer has no email")
  if (job.status === JobStatus.CANCELLED)
    throw new HttpError(400, "Cancelled jobs cannot be invoiced")

  const result = await deliver(user, job, { note })
  if (result.sent) {
    job.invoiceSentAt = new Date()
    await job.save()
  }
  return {
    message: result.sent
      ? `Invoice emailed to ${job.customer.email}`
      : "SMTP not configured – email printed in the API console",
    sent: result.sent,
    devPreview: result.devPreview,
    invoiceSentAt: job.invoiceSentAt
  }
}


// job payment
export const setJobPayment = async (
  user: Actor,
  id: string,
  input: { paymentStatus: string; paymentMethod?: string; sendReceipt?: boolean }
) => {
  const { paymentStatus, paymentMethod, sendReceipt } = input
  if (!["PAID", "UNPAID"].includes(paymentStatus))
    throw new HttpError(400, "paymentStatus must be PAID or UNPAID")
  if (
    paymentStatus === "PAID" &&
    !["CASH", "CARD", "BANK_TRANSFER", "ONLINE"].includes(paymentMethod as string)
  )
    throw new HttpError(400, "Select a payment method")

  const job: any = await loadForEmail(id)
  if (!job) throw new HttpError(404, "Job not found")
  if (job.status === JobStatus.CANCELLED)
    throw new HttpError(400, "Cancelled jobs have no payment")

  job.paymentStatus = paymentStatus
  job.paymentMethod = paymentStatus === "PAID" ? paymentMethod : ""
  job.paidAt = paymentStatus === "PAID" ? new Date() : undefined
  await job.save()

  let emailNote = ""
  if (paymentStatus === "PAID" && sendReceipt && job.customer?.email) {
    try {
      const r = await deliver(user, job, { receipt: true })
      emailNote = r.sent
        ? " Receipt emailed."
        : " (SMTP not configured – receipt printed in API console.)"
    } catch {
      emailNote = " Payment saved but the receipt email failed."
    }
  }
  return {
    message: `Payment marked ${paymentStatus}.${emailNote}`,
    paymentStatus: job.paymentStatus,
    paymentMethod: job.paymentMethod,
    paidAt: job.paidAt
  }
}