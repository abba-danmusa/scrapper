# Scrapper

This project ingests news from Nigerian outlets and reputable international sources and provides a dashboard to review and assemble reports.

Quick start (development):

1. From workspace root, start the scraper server:

```bash
cd server
node index.js
```

2. In another terminal, start the frontend:

```bash
npm run dev
```

By default the scheduler is disabled. To enable periodic ingestion set:

```bash
export ENABLE_SCHEDULER=true
export INGEST_INTERVAL_MINUTES=60
node server/index.js
```

### ACLED authentication

This project supports ACLED OAuth authentication for programmatic ingestion.

Set these environment variables before starting the server:

```bash
export ACLED_USERNAME="your-email@example.com"
export ACLED_PASSWORD="your-acled-password"
```

The pipeline will automatically request an access token from `https://acleddata.com/oauth/token`, store it in `server/data/acled-token.json`, and refresh it as needed.

If you prefer a direct browser or Postman login flow, ACLED also supports session login via:

```bash
POST https://acleddata.com/user/login?_format=json
Content-Type: application/json

{
  "name": "your-email@example.com",
  "pass": "your-password"
}
```

For script-based access, OAuth is recommended:

```bash
curl -X POST "https://acleddata.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=EMAIL@DOMAIN.COM" \
  -d "password=YOUR_PASSWORD" \
  -d "grant_type=password" \
  -d "client_id=acled" \
  -d "scope=authenticated"
```

Then use the returned bearer token:

```bash
curl -H "Authorization: Bearer ACCESS-TOKEN-HERE" \
  -X GET \
  "https://acleddata.com/api/acled/read?limit=10"
```

This repository uses OAuth for your server-side ingestion, so you don’t need to manually paste tokens into code.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
