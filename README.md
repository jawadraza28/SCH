# School OS

A reusable school management application for one school per deployment. Each school should have its own Vercel project, MongoDB database, environment variables, and storage bucket.

## Local setup

Requirements: Node.js 20+, MongoDB Atlas (or local MongoDB), and npm.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:3000/setup` and create the first school administrator. Never commit `.env` or service-account keys.

## Environment variables

Required:

- `MONGODB_URI`: private MongoDB connection string. Include `/school-management` or another database name.
- `JWT_SECRET`: long random signing secret.
- `CRON_SECRET`: long random secret used by Vercel Cron routes.
- `STUDENT_DEFAULT_PASSWORD`: default password assigned when an approved student account is created. It is hashed before storage.

Optional student photos:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

Photos are accepted only as JPG, PNG, or WebP, compressed server-side, and stored in a private Cloudflare R2 bucket. The browser receives a short-lived signed URL, so the bucket does not need to be public.

## Roles

- **Admin**: school setup, students, teachers, assignments, classes, approvals, attendance review, fees, notices, and audit history.
- **Teacher**: assigned-class students, attendance, text homework, and results. Server-side checks prevent access to unrelated classes.
- **Student**: own profile, attendance, homework, results, fees, notices, and printable profile card.

## Production deployment

1. Create a separate MongoDB database for the school.
2. Create a separate Vercel project from this repository.
3. Add the variables from `.env.example` in Vercel Project Settings.
4. Use a unique `JWT_SECRET` and `CRON_SECRET` for every school deployment.
5. Deploy and open `/setup` once to create the administrator.
6. Create classes and teachers, then assign teachers to classes.
7. Add or approve students.
8. Configure a private Cloudflare R2 bucket and API token if photos are needed.
9. Attach the school domain in Vercel.

Vercel Cron calls attendance cleanup daily, fee generation monthly, and finance maintenance monthly. Configure `CRON_SECRET` in Vercel; never expose it as a `NEXT_PUBLIC_` variable.

## Finance

`/dashboard/finance` holds four tabs over a single ledger (`FinanceEntry`):

- **Overview** — balance, income-vs-expense chart (Daily / Weekly / Monthly / Yearly) and category donuts.
- **Income** / **Expenses** — filterable, paginated lists with add forms.
- **Teacher salaries** — per-month paid/unpaid list.

The ledger is not typed in twice. Marking a student fee **paid** writes one income row carrying that class and date; marking a teacher salary **paid** writes one expense row. Reversing either deletes its row, so the totals always match the fees and salary screens. Only manually added rows can be deleted directly.

In the expense list, a row written by a salary payment is labelled **Salary paid** and a row written by a fee is labelled **Fee paid**, so it is obvious at a glance which records came from which screen. A **Manage salaries** button on that tab jumps straight to the salary tab, and the salaries tab's month-by-month payroll table links each month into the expense list already filtered to it.

The income and expense tabs both take a **Month** filter (the last twelve months) alongside the category, class, source and date-range filters. A month selection always wins over the from/to boxes, so the two controls can never disagree.

### Analytics

The attendance trend chart on `/dashboard/analytics` has a **Daily / Weekly / Monthly / Yearly** toggle and a **month picker**. Both are plain links (`?range=&month=`), so the chart stays server-rendered and the selection is shareable. Every range ends at the selected month — choose March and each range reads "up to and including March" — and weekly buckets are Monday-keyed. The calendar maths lives in `attendanceBucketKeys` (`src/lib/analytics.ts`), which is pure and therefore testable without a database.

Each class section can carry its own monthly fee (`ClassSection.fee`); a fee of `0` falls back to the school-wide fee in school settings, so existing schools are unaffected. Each teacher carries a monthly `salary`.

Finance rows and salary records are kept for **one rolling year**. `/api/maintenance/finance` opens each month by creating unpaid salary rows for the whole staff, then deletes anything older than a year. It also runs opportunistically when the finance or salary screens are opened, so no cron configuration is required.

## Fee vouchers

Every student carries a `voucherNo` (for example `VCH-2026-0001`), minted on create when the admin leaves the field blank, and editable afterwards. It is `unique + sparse`, so students created before the field existed never collide.

The fees screen shows the voucher number and a **Send voucher** button on every row. Clicking it opens WhatsApp with the voucher already typed, addressed to the student's parent phone (falling back to the emergency contact, then the mother's number). The message carries the student name, class and section, roll number, voucher number, period, the amount due — which is that class's own fee — and a due date ten days after sending.

Pakistani numbers are stored as `0300…` and are converted to the international `92300…` form WhatsApp expects. When a student has no usable number the button is disabled and explains what to add, rather than opening an empty WhatsApp chat.

## Validation

```powershell
npm run lint
npm run build
```

## Backups

Use MongoDB Atlas backup or scheduled `mongodump` backups. Keep Vercel environment variables, storage configuration, and database backups in separate secure locations. The `test` database should not be used by a deployment.
