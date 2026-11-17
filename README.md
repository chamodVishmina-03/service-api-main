# AutoCare API – Vehicle Service & Repair Management (Express + MongoDB)

```bash
cp .example.env .env     # set SUPABASE_*, GEMINI_API_KEY (optional for basic demo)
docker compose up -d     # MongoDB
npm install
npm run seed             # admin@vsrms.com / mechanic@vsrms.com / customer@vsrms.com  -> Password@123
npm run dev              # http://localhost:5000
```
Supabase: create a public bucket named `vehicles` for vehicle photos.

Roles: CUSTOMER, MECHANIC, ADMIN.
Job flow: PENDING → APPROVED → IN_PROGRESS ⇄ WAITING_PARTS → COMPLETED (or CANCELLED).

Endpoints (/api/v1): `/auth/*`, `/vehicles/*`, `/jobs/*` (my, assigned, admin/all, :id, assign, status, costing, cancel, generate-diagnosis), `/admin/stats`, `/admin/users`.
