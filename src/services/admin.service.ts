import { UserModel, UserRole } from "../models/user.model"
import { ServiceJob, JobStatus } from "../models/service-job.model"
import { Vehicle } from "../models/vehicle.model"
import { Actor, HttpError } from "../util/http"




// ---------- Dashboard ----------
export const getDashboardStats = async () => {
  const [byStatus, byType, revenueAgg, vehicles, customers, mechanics, recent] =
    await Promise.all([
      ServiceJob.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      ServiceJob.aggregate([{ $group: { _id: "$serviceType", count: { $sum: 1 } } }]),
      ServiceJob.aggregate([
        { $match: { status: JobStatus.COMPLETED } },
        { $group: { _id: null, total: { $sum: "$totalCost" } } }
      ]),
      Vehicle.countDocuments(),
      UserModel.countDocuments({ roles: UserRole.CUSTOMER }),
      UserModel.countDocuments({ roles: UserRole.MECHANIC }),
      ServiceJob.find()
        .populate("vehicle", "make vehicleModel plateNumber")
        .populate("customer", "name")
        .sort({ createdAt: -1 })
        .limit(5)
    ])

  return {
    jobsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
    jobsByType: Object.fromEntries(byType.map((s) => [s._id, s.count])),
    revenue: revenueAgg[0]?.total || 0,
    vehicles,
    customers,
    mechanics,
    recentJobs: recent
  }
}




// ---------- Users ----------
export const listUsers = async (role?: string) => {
  const filter: any = {}
  if (role && Object.values(UserRole).includes(role as UserRole)) filter.roles = role
  return UserModel.find(filter).select("-password").sort({ createdAt: -1 })
}



// change use role
export const changeUserRoles = async (actor: Actor, userId: string, roles: unknown) => {
  if (
    !Array.isArray(roles) ||
    roles.length === 0 ||
    !roles.every((r) => Object.values(UserRole).includes(r))
  )
    throw new HttpError(400, "Invalid roles")

  // An admin must not lock themselves out
  if (userId === actor.sub && !roles.includes(UserRole.ADMIN))
    throw new HttpError(400, "You cannot remove your own ADMIN role")

  const user = await UserModel.findByIdAndUpdate(userId, { roles }, { new: true }).select(
    "-password"
  )
  if (!user) throw new HttpError(404, "User not found")
  return user
}