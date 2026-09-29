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

- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLOUD_STORAGE_BUCKET`
- `GOOGLE_CLOUD_CLIENT_EMAIL`
- `GOOGLE_CLOUD_PRIVATE_KEY`

Photos are accepted only as JPG, PNG, or WebP, compressed server-side, and stored in a private bucket. The Gmail address used to create the Google Cloud project is not itself a storage credential.

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
8. Configure a private Google Cloud Storage bucket only if photos are needed.
9. Attach the school domain in Vercel.

Vercel Cron calls attendance cleanup daily and fee generation monthly. Configure `CRON_SECRET` in Vercel; never expose it as a `NEXT_PUBLIC_` variable.

## Validation

```powershell
npm run lint
npm run build
```

## Backups

Use MongoDB Atlas backup or scheduled `mongodump` backups. Keep Vercel environment variables, storage configuration, and database backups in separate secure locations. The `test` database should not be used by a deployment.
