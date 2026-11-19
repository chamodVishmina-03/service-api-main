import { Vehicle } from "../models/vehicle.model"
import { ServiceJob, JobStatus } from "../models/service-job.model"
import { UserRole } from "../models/user.model"
import { uploadImage } from "./storage.service"
import { isStorageConfigured } from "../config/supabase"
import { Actor, HttpError, isAdmin } from "../util/http"

const ACTIVE_STATUSES = [
  JobStatus.PENDING,
  JobStatus.APPROVED,
  JobStatus.IN_PROGRESS,
  JobStatus.WAITING_PARTS
]

// Fields a vehicle owner 
const UPDATABLE_FIELDS = ["make", "vehicleModel", "year", "color", "fuelType", "mileage", "vin"]

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const assertStorageForPhoto = (file?: Express.Multer.File) => {
  if (file && !isStorageConfigured())
    throw new HttpError(
      503,
      "Photo upload is not set up on the server. Save the vehicle without a photo."
    )
}

// Customers only ever touch their own vehicles
const assertOwnerOrAdmin = (user: Actor, vehicle: any) => {
  if (!isAdmin(user) && vehicle.owner.toString() !== user.sub)
    throw new HttpError(404, "Vehicle not found")
}

const findVehicleOrFail = async (id: string) => {
  const vehicle = await Vehicle.findById(id)
  if (!vehicle) throw new HttpError(404, "Vehicle not found")
  return vehicle
}




export interface CreateVehicleInput {
  make: string
  vehicleModel: string
  year: number | string
  plateNumber: string
  vin?: string
  color?: string
  fuelType?: string
  mileage?: number | string
  ownerId?: string
}


// add vehicle
export const createVehicle = async (
  user: Actor,
  input: CreateVehicleInput,
  file?: Express.Multer.File
) => {
  const exists = await Vehicle.findOne({
    plateNumber: String(input.plateNumber).toUpperCase().trim()
  })
  if (exists) throw new HttpError(400, "Plate number already registered")

  assertStorageForPhoto(file)
  const imageURL = file ? await uploadImage(file, "vehicles") : ""

  // Admin may register on behalf of a customer
  const owner = isAdmin(user) && input.ownerId ? input.ownerId : user.sub

  return Vehicle.create({
    owner,
    make: input.make,
    vehicleModel: input.vehicleModel,
    year: Number(input.year),
    plateNumber: input.plateNumber,
    vin: input.vin,
    color: input.color,
    fuelType: input.fuelType,
    mileage: Number(input.mileage) || 0,
    imageURL
  })
}


// update vehicle
export const updateVehicle = async (
  user: Actor,
  id: string,
  body: Record<string, any>,
  file?: Express.Multer.File
) => {
  const vehicle = await findVehicleOrFail(id)
  assertOwnerOrAdmin(user, vehicle)

  UPDATABLE_FIELDS.forEach((f) => {
    if (body[f] !== undefined) (vehicle as any)[f] = body[f]
  })

  assertStorageForPhoto(file)
  if (file) vehicle.imageURL = await uploadImage(file, "vehicles")

  await vehicle.save()
  return vehicle
}


// delete vehicle
export const deleteVehicle = async (user: Actor, id: string) => {
  const vehicle = await findVehicleOrFail(id)
  assertOwnerOrAdmin(user, vehicle)

  const active = await ServiceJob.countDocuments({
    vehicle: id,
    status: { $in: ACTIVE_STATUSES }
  })
  if (active > 0)
    throw new HttpError(400, "Vehicle has active service jobs and cannot be deleted")

  await vehicle.deleteOne()
}





// ---------- Reading ----------
export const listMyVehicles = (user: Actor) =>
  Vehicle.find({ owner: user.sub }).sort({ createdAt: -1 })




export const listAllVehicles = async (query: { page?: string; limit?: string; search?: string }) => {
  const page = parseInt(query.page as string) || 1
  const limit = parseInt(query.limit as string) || 10
  const search = query.search?.trim()

  const filter: any = {}
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i")
    filter.$or = [{ plateNumber: rx }, { make: rx }, { vehicleModel: rx }]
  }

  const vehicles = await Vehicle.find(filter)
    .populate("owner", "name email phone")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
  const total = await Vehicle.countDocuments(filter)

  return { data: vehicles, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
}



// get vehicle details
export const getVehicleDetails = async (user: Actor, id: string) => {
  const vehicle = await Vehicle.findById(id).populate("owner", "name email phone")
  if (!vehicle) throw new HttpError(404, "Vehicle not found")

  const ownerId = (vehicle.owner as any)._id.toString()
  if (!isAdmin(user) && ownerId !== user.sub) {
    // Mechanics may only see vehicles of jobs assigned to them.
    const assigned =
      user.roles?.includes(UserRole.MECHANIC) &&
      (await ServiceJob.exists({ vehicle: id, mechanic: user.sub }))
    if (!assigned) throw new HttpError(404, "Vehicle not found")
  }

  const history = await ServiceJob.find({ vehicle: id })
    .populate("mechanic", "name")
    .sort({ createdAt: -1 })

  return { vehicle, history }
}