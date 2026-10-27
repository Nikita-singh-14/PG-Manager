# PG Manager (MERN)

Management app for a PG / hostel: rooms and beds, tenant check-in/check-out, pro-rated monthly rent,
part payments, maintenance complaints, tenant logins, owner dashboard, printable receipts and
security-deposit tracking.

**Stack:** MongoDB + Mongoose · Express (Node.js) · React 18 (Vite, React Router) · JWT auth (bcryptjs, jsonwebtoken)

```
.
├── server/   Express API + Mongoose models, services, tests, seed script
├── client/   React app (Vite)
└── .env.example
```

## Run it

Requires **Node 20+** and a **MongoDB** (local `mongod`, Docker, or a free MongoDB Atlas cluster).

```bash
cp .env.example .env            # set MONGODB_URI (and JWT_SECRET for anything but local dev)
npm run install:all             # installs root, server and client dependencies
npm run seed                    # wipes the database and loads demo data
npm run dev                     # API on :5000, React on http://localhost:5173
```

Local MongoDB with Docker, if you don't have one: `docker run -d -p 27017:27017 --name pg-mongo mongo:7`

Production-style single server: `npm run build && npm start` (Express serves the built React app on `PORT`).

Tests: `npm test`. By default this downloads an in-memory MongoDB once (`mongodb-memory-server`);
to use your own instance set `MONGODB_URI_TEST` in `.env` (use a throwaway database: tests empty its collections).

### Demo logins (created by `npm run seed`)

| Role   | Email                                 | Password     |
|--------|---------------------------------------|--------------|
| Owner  | `owner@pg.test`                       | `Owner@123`  |
| Tenant | `tenant1@pg.test` … `tenant7@pg.test` | `Tenant@123` |

`tenant1` has a part payment · `tenant2` moved in mid-month (pro-rated first month) · `tenant6` is two months overdue ·
`tenant5` has checked out (deposit deductions on their page) · `tenant7` has no bed, so check them in live from **Rooms**.
The seed uses dates relative to today, so the demo always shows a realistic mix of Paid / Due / Overdue.

All settings are in `.env.example` (Mongo URIs, port, `JWT_SECRET`, token lifetime, client origin, rent due day, timezone).
In production the server refuses to start without a real `JWT_SECRET`.

## Data model (MongoDB collections)

| Collection | Key fields |
|---|---|
| `users` | email, passwordHash, role (`owner`/`tenant`), tenant → `tenants` |
| `tenants` | name, email, phone, **bookings[]** (claimed date ranges) |
| `rooms` | name (unique, case-insensitive), floor, notes |
| `beds` | room → `rooms`, label, monthlyRent, **bookings[]** |
| `stays` | tenant, bed, checkIn, checkOut (null = still here), `open`, monthlyRent (snapshot), deposit, depositRefund, deductions[] |
| `rentrecords` | stay, tenant, month `YYYY-MM`, daysOccupied, daysInMonth, amountDue, **paid** (running total), dueDate · unique (stay, month) |
| `payments` | rent → `rentrecords`, amount, paidOn, method, note, recordedBy |
| `complaints` | tenant, category, title, description, status (`open`/`in_progress`/`resolved`), ownerNote |

- Dates are `YYYY-MM-DD` strings (they sort correctly and avoid timezone bugs). Money is whole rupees (integers).
- A stay's `checkOut` is the **last day occupied** (inclusive).
- **Due / Paid / Overdue is never stored.** It is derived from `amountDue`, `paid` and today's date, so it can't go stale.
- The rent price is copied onto the stay at check-in, so changing a bed's price later doesn't alter existing tenants.

## Main design decisions

**1. No double-booking, enforced on the server, without transactions** (`server/src/services/stays.js`)

MongoDB has no triggers or exclusion constraints, and multi-document transactions need a replica set, so I used what Mongo
*does* guarantee: **a single-document update is atomic.** Every Bed (and Tenant) holds a `bookings[]` list of claimed date ranges, and
claiming a range is one `findOneAndUpdate`:

```js
Bed.findOneAndUpdate(
  { _id, bookings: { $not: { $elemMatch: { from: { $lte: newTo }, to: { $gte: newFrom } } } } },  // "no overlap"
  { $push: { bookings: { stay, from: newFrom, to: newTo } } })                                     // "and claim it"
```

The overlap check and the claim happen as one atomic operation, so two simultaneous requests can never both win.
Check-in is then a small saga: claim the bed → claim the tenant (a tenant can't hold two beds either) → create the `Stay`.
If a later step fails, earlier claims are released. If the *process* dies mid-way, `releaseOrphanBookings()` clears dangling
claims at startup. As a final backstop, partial unique indexes (`{bed}` / `{tenant}` where `open: true`) make MongoDB itself reject a second open stay.

**2. Pro-rating** (`server/src/lib/proration.js`, pure function, 7 tests)
- Both check-in and check-out days are charged. `amount = round(monthlyRate × daysOccupied ÷ daysInThatMonth)`, half-up, integer maths.
  A full month is always exactly the monthly rate; February / leap years use the real month length.
- `syncStayRent` is idempotent and safe to run concurrently (each month is an upsert on the unique `(stay, month)` index).
  It runs on check-in, on server start, hourly, and when the owner opens the dashboard/rent page. On **check-out** it re-prorates the final
  month and removes later months (or zeroes them if already paid). An overpayment becomes a visible **credit**, never a negative balance.
- A tenant who moves in on the 20th isn't overdue on the 21st: due date = the later of the due day and the check-in date.

**3. Payments** (`services/payments.js`): part payments allowed; over-paying, paying a settled month or future-dating is rejected.
`paid` is incremented with a guarded atomic update (`$expr: paid + amount <= amountDue`), so two simultaneous payments can't together exceed the rent.

**4. Security & validation:** every input goes through `server/src/validate.js` and failures return `400` with per-field messages the UI shows
under each input. Passwords are bcrypt-hashed, JWTs expire, failed logins are rate-limited, `helmet` sets security headers, tenants can only
read their own rent, complaints and receipts (tested), and React escapes all rendered text. Mongo queries only receive validated values.

## What is finished
- Rooms/beds, check-in / check-out with dates, server-side double-booking protection
- Monthly rent records, pro-rating, Due/Paid/Overdue, part payments, per-tenant outstanding balance and credit
- Tenant login: rent history with payments, raise complaints · owner updates status + note
- Dashboard: beds filled, rent collected this month, outstanding, overdue tenants, open complaints
- **Stretch:** printable receipts (print → "Save as PDF"), security deposit with deductions at check-out and refund calculation
- Responsive UI (bottom tab bar on phones), seed data, `.env.example`, 30+ automated tests

## What isn't finished, and what I'd do next
- Receipts are a print-friendly page, not a server-generated PDF.
- No password reset / change-password; no refresh tokens.
- A saved check-out can't be edited or reverted; no tenant edit/delete or bed delete screen.
- The check-in "saga" is not a database transaction. A crash is repaired at the next startup rather than instantly.
  With a replica set I would use `session.withTransaction` instead.
- Login rate limiting is in-memory per process. Rent sync loads all stays; fine for one PG, would need batching for hundreds.
- No late fees, utility billing, or SMS/WhatsApp reminders.
- No React component tests or end-to-end tests yet.

## Tests (`npm test`)
- **Pure logic (no database):** pro-rating (7), date helpers and validator.
- **Integration (real MongoDB):** overlap rules, back-to-back stays, a tenant with two beds, partial-index backstop,
  3 simultaneous check-ins for one bed (exactly one wins), same tenant into 2 beds at once, orphan cleanup, check-out validation and deposit refund,
  rent re-calculation on check-out, credit, status transitions, over/duplicate/future payments, concurrent payments, idempotent concurrent rent
  generation, API validation, role-based access and tenant data isolation, complaints workflow, dashboard.

## AI tools used
> Edit this so it is accurate for you before submitting.
- **Claude (Anthropic):** generated the project structure, backend, React client, tests and this README from the assignment brief.
- I reviewed the code and can explain it (see the walkthrough below).

## Suggested video walkthrough (3–5 min)
1. **Demo (~1.5 min):** owner → Dashboard → Rooms → check in `tenant7` → show the double-booking error (two tabs) → Rent → record a *part* payment → open the receipt. Then tenant1 in a phone-sized window → rent history → raise a complaint → owner updates its status.
2. **Code (~1.5 min):** `proration.js`, `syncStayRent` (`services/rent.js`), `claim()` and `checkIn` (`services/stays.js`), `models.js`.
3. **Hard problem (~1 min):** double-booking without triggers or transactions: atomic conditional update on the bed document, the saga with compensation, orphan cleanup, and the concurrent-requests test.
