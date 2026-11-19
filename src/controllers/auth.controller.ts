import { Request, Response } from "express"
import { AuthRequest } from "../middleware/auth"
import * as authService from "../services/auth.service"
import { fail } from "../util/http"



const failMsg = (res: Response, error: unknown, fallback: string) =>
  fail(res, error, fallback, "message")

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password } = req.body
    if (!name || !email || !password)
      return res.status(400).json({ message: "Name, email and password required" })

    await authService.registerUser({ name, email, phone, password })
    res.status(201).json({ message: "User registered successfully" })
  } catch (err) {
    failMsg(res, err, "Registration failed")
  }
}

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: "Missing credentials" })

    const data = await authService.loginUser(email, password)
    res.status(200).json({ message: "OK", data })
  } catch (err) {
    failMsg(res, err, "Internal server error")
  }
}

export const getMyDetails = async (req: AuthRequest, res: Response) => {
  if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" })

  try {
    const data = await authService.getProfile(req.user.sub)
    res.status(200).json({ message: "ok", data })
  } catch (err) {
    failMsg(res, err, "Internal server error")
  }
}

export const getRefreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ message: "Token required" })

    const data = await authService.refreshAccessToken(refreshToken)
    res.status(200).json({ data })
  } catch (err) {
    failMsg(res, err, "Invalid or expired token")
  }
}

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim()
    if (!email) return res.status(400).json({ message: "Email required" })

    res.status(200).json(await authService.requestPasswordReset(email))
  } catch (err) {
    failMsg(res, err, "Could not process request")
  }
}

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body
    if (!token || !password)
      return res.status(400).json({ message: "Token and new password required" })

    await authService.resetPassword(token, password)
    res.status(200).json({ message: "Password updated. You can now sign in." })
  } catch (err) {
    failMsg(res, err, "Could not reset password")
  }
}

export const updateMyProfile = async (req: AuthRequest, res: Response) => {
  if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" })

  try {
    const data = await authService.updateProfile(req.user.sub, req.body)
    res.status(200).json({ message: "Profile updated", data })
  } catch (err) {
    failMsg(res, err, "Internal server error")
  }
}