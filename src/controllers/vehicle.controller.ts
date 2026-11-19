import { Response } from "express"
import { AuthRequest } from "../middleware/auth"
import * as vehicleService from "../services/vehicle.service"
import { Actor, badId, fail } from "../util/http"



const user = (req: AuthRequest) => req.user as Actor
const INVALID_ID = "Invalid Vehicle ID"



// add vehicles
export const createVehicle = async (req: AuthRequest, res: Response) => {
  try {
    const { make, vehicleModel, year, plateNumber } = req.body
    if (!make || !vehicleModel || !year || !plateNumber)
      return res
        .status(400)
        .json({ error: "make, vehicleModel, year and plateNumber are required" })

    const vehicle = await vehicleService.createVehicle(user(req), req.body, req.file)
    res.status(201).json(vehicle)
  } catch (error) {
    fail(res, error)
  }
}

// get owner vehicles 

export const getMyVehicles = async (req: AuthRequest, res: Response) => {
  try {
    res.status(200).json(await vehicleService.listMyVehicles(user(req)))
  } catch (error) {
    fail(res, error)
  }
}

// get all 
export const getAllVehicles = async (req: AuthRequest, res: Response) => {
  try {
    res.status(200).json(await vehicleService.listAllVehicles(req.query as any))
  } catch (error) {
    fail(res, error)
  }
}


//get  vehicle by id 
export const getVehicleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (badId(res, [id], INVALID_ID)) return

    res.status(200).json(await vehicleService.getVehicleDetails(user(req), String(id)))
  } catch (error) {
    fail(res, error)
  }
}



//update vehicle
export const updateVehicle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (badId(res, [id], INVALID_ID)) return

    const vehicle = await vehicleService.updateVehicle(user(req), String(id), req.body, req.file)
    res.status(200).json(vehicle)
  } catch (error) {
    fail(res, error)
  }
}


// delete vehicle
export const deleteVehicle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (badId(res, [id], INVALID_ID)) return

    await vehicleService.deleteVehicle(user(req), String(id))
    res.status(200).json({ message: "Vehicle deleted" })
  } catch (error) {
    fail(res, error)
  }
}