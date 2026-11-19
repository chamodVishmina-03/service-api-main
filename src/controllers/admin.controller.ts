import { Response } from "express"
import { AuthRequest } from "../middleware/auth"
import * as adminService from "../services/admin.service"
import { Actor, badId, fail } from "../util/http"



export const getStats = async (_req: AuthRequest, res: Response) => {
  try {
    res.status(200).json(await adminService.getDashboardStats())
  } catch (error) {
    fail(res, error)
  }
}


export const listUsers = async (req: AuthRequest, res: Response) => {
  try {
    res.status(200).json(await adminService.listUsers(req.query.role as string))
  } catch (error) {
    fail(res, error)
  }
}


export const updateUserRoles = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (badId(res, [id])) return

    const user = await adminService.changeUserRoles(req.user as Actor, String(id), req.body.roles)
    res.status(200).json(user)
  } catch (error) {
    fail(res, error)
  }
}