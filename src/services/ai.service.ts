import { GoogleGenAI } from "@google/genai"


// Tried in order. Set GEMINI_MODEL in .env to force a specific model.
const DEFAULT_MODELS = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite"]
const getModels = () =>
  process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...DEFAULT_MODELS] : DEFAULT_MODELS



const REQUEST_TIMEOUT_MS = 15000 // one Gemini call
const TOTAL_TIMEOUT_MS = 30000 // everything all models + retries


const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))


// Rejects if the promise does not settle in time, so a hung request can never block the UI
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })

let client: GoogleGenAI | null = null
const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  if (!client) client = new GoogleGenAI({ apiKey })
  return client
}




export const generateDiagnosis = async (
  vehicleInfo: string,
  symptoms: string
): Promise<string> => {
  const fallback = `Reported symptoms: ${symptoms.substring(0, 300)}`
  const ai = getClient()
  if (!ai) {
    console.warn("[AI] GEMINI_API_KEY is empty – add it to .env and restart the API.")
    return fallback
  }

  const prompt = `You are a senior automotive service advisor.
Vehicle: ${vehicleInfo}
Customer-reported symptoms: "${symptoms.substring(0, 2000)}"

Write a concise preliminary assessment (max 120 words) in plain prose:
1. The most likely causes (ranked).
2. Recommended inspection steps for the mechanic.
3. Whether the vehicle is safe to drive until inspected.
End with: "This is a preliminary AI suggestion; a physical inspection is required."`

  const deadline = Date.now() + TOTAL_TIMEOUT_MS

  for (const model of getModels()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (Date.now() > deadline) {
        console.warn("[AI] Gave up – total time limit reached.")
        return fallback
      }
      try {
        console.log(`[AI] Calling ${model} (attempt ${attempt})…`)
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: prompt,
            // Newer models spend part of this budget on internal reasoning, so keep it generous
            config: { temperature: 0.4, maxOutputTokens: 2000 }
          }),
          REQUEST_TIMEOUT_MS
        )
        const text = response.text?.trim()
        if (text) return text
        console.warn(`[AI] ${model} returned an empty response`)
        break
      } catch (error: any) {
        const code = error?.status || error?.error?.code
        const msg = String(error?.message || error).slice(0, 200)
        console.warn(`[AI] ${model} failed (${code ?? "no status"}): ${msg}`)
        if (code === 503 || code === 429) {
          await delay(attempt * 1000)
          continue
        }
        break 
      }
    }
  }
  console.warn("[AI] All models failed – returning the plain symptoms text.")
  return fallback
}