import { Response } from "express"
import mongoose from "mongoose"
import { UserRole } from "../models/user.model"

// The logged-in user .Services never see req / res.
export interface Actor {
  sub: string
  roles?: string[]
}

export const isAdmin = (user: Actor) => !!user.roles?.includes(UserRole.ADMIN)

// Thrown by services
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}




export const fail = (
  res: Response,
  error: unknown,
  fallback = "Internal Server Error",
  errorKey: "error" | "message" = "error"
) => {
  if (error instanceof HttpError)
    return res.status(error.status).json({ [errorKey]: error.message })
  res.status(500).json({ [errorKey]: fallback })
}

// Controller helper: sends 400 and returns true when any id is not a valid ObjectId.
export const badId = (res: Response, ids: unknown[], message = "Invalid ID") => {
  if (ids.every((id) => mongoose.isValidObjectId(id))) return false
  res.status(400).json({ error: message })
  return true
}