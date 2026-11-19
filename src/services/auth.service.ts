import bcrypt from "bcryptjs"
import crypto from "crypto"
import { UserModel, UserRole } from "../models/user.model"
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../util/jwt"
import { isMailConfigured, sendMail } from "./mail.service"
import { HttpError } from "../util/http"

const MIN_PASSWORD_LENGTH = 6
const RESET_TOKEN_MINUTES = 30

// The raw token goes in the e-mail link; only its hash is stored in the DB.
const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex")

const assertPasswordLength = (password: unknown) => {
  if (String(password).length < MIN_PASSWORD_LENGTH)
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
}

const toProfile = (user: any) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  roles: user.roles
})

// ---------- Register / login ----------
export const registerUser = async (input: {
  name: string
  email: string
  phone?: string
  password: string
}) => {
  const existing = await UserModel.findOne({ email: input.email.toLowerCase() })
  if (existing) throw new HttpError(400, "User already exists")

  const hashedPassword = await bcrypt.hash(input.password, 10)

  // Public registration always creates a CUSTOMER.
  // ADMIN promotes users to MECHANIC / ADMIN later.
  await UserModel.create({
    name: input.name,
    email: input.email,
    phone: input.phone || "",
    password: hashedPassword,
    roles: [UserRole.CUSTOMER],
    approve: true
  })
}

export const loginUser = async (email: string, password: string) => {
  const user = await UserModel.findOne({ email: email.toLowerCase() })
  if (!user) throw new HttpError(401, "Invalid credentials")

  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) throw new HttpError(401, "Invalid credentials")

  return {
    email: user.email,
    roles: user.roles,
    access_token: signAccessToken(user),
    refresh_token: signRefreshToken(user)
  }
}

// ---------- Profile ----------
export const getProfile = async (userId: string) => {
  const user = await UserModel.findById(userId).select("-password")
  if (!user) throw new HttpError(404, "User not found")
  return toProfile(user)
}

export interface ProfileInput {
  name?: string
  phone?: string
  email?: string
  currentPassword?: string
  newPassword?: string
}




// update profile name ,phone , password 
export const updateProfile = async (userId: string, input: ProfileInput) => {
  const user = await UserModel.findById(userId)
  if (!user) throw new HttpError(404, "User not found")

  const { name, phone, email, currentPassword, newPassword } = input
  const newEmail = email ? String(email).trim().toLowerCase() : user.email
  const emailChanged = newEmail !== user.email

  if (emailChanged && !/^\S+@\S+\.\S+$/.test(newEmail))
    throw new HttpError(400, "Enter a valid email address")

  // Changing the email or password needs the current password
  if (emailChanged || newPassword) {
    if (!currentPassword) throw new HttpError(400, "Current password is required")
    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) throw new HttpError(401, "Current password is incorrect")
  }

  if (emailChanged) {
    const taken = await UserModel.findOne({ email: newEmail, _id: { $ne: user._id } })
    if (taken) throw new HttpError(400, "That email is already in use")
    user.email = newEmail
  }

  if (newPassword) {
    assertPasswordLength(newPassword)
    user.password = await bcrypt.hash(newPassword, 10)
  }

  if (name !== undefined) {
    if (!String(name).trim()) throw new HttpError(400, "Name cannot be empty")
    user.name = String(name).trim()
  }
  if (phone !== undefined) user.phone = String(phone).trim()

  await user.save()
  return toProfile(user)
}




// ---------- Tokens ----------
export const refreshAccessToken = async (refreshToken: string) => {
  try {
    const payload = verifyRefreshToken(refreshToken)
    const user = await UserModel.findById(payload.sub)
    if (!user) throw new HttpError(403, "Invalid token")
    return { accessToken: signAccessToken(user) }
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(403, "Invalid or expired token")
  }
}





// ---------- Password reset ----------
export const requestPasswordReset = async (email: string) => {
  // Same response whether or not the account exists (prevents user enumeration)
  const generic = {
    message: "If an account exists for that email, a reset link has been sent."
  }

  const user = await UserModel.findOne({ email })
  if (!user) return generic

  const token = crypto.randomBytes(32).toString("hex")
  user.resetPasswordToken = hashToken(token)
  user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000)
  await user.save()

  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
  const link = `${clientUrl}/reset-password?token=${token}`

  if (isMailConfigured()) {
    await sendMail(
      user.email,
      "Reset your AutoCare password",
      `<p>Hi ${user.name},</p>
         <p>We received a request to reset your password. This link is valid for ${RESET_TOKEN_MINUTES} minutes:</p>
         <p><a href="${link}">Reset password</a></p>
         <p>If you didn't request this, you can ignore this email.</p>`
    )
    return generic
  }

  // No SMTP configured: log the link, and expose it ONLY outside production (dev/demo).
  console.log(`[forgot-password] Reset link for ${user.email}: ${link}`)
  if (process.env.NODE_ENV !== "production") return { ...generic, devResetLink: link }
  return generic
}

export const resetPassword = async (token: string, password: string) => {
  assertPasswordLength(password)

  const user = await UserModel.findOne({
    resetPasswordToken: hashToken(String(token)),
    resetPasswordExpires: { $gt: new Date() }
  }).select("+resetPasswordToken +resetPasswordExpires")

  if (!user) throw new HttpError(400, "Reset link is invalid or has expired")

  user.password = await bcrypt.hash(password, 10)
  user.resetPasswordToken = undefined
  user.resetPasswordExpires = undefined
  await user.save()
}