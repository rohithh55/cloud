# Deploy everything on Cloudflare (Worker + D1)

## 1. Create the D1 database (once)
On your computer, in the project folder:
```bash
npm install
npx wrangler login
npx wrangler d1 create portfolio-db
```
Copy the printed `database_id` into **wrangler.toml** (`database_id = "..."`), then commit and push.
(Or: dashboard → **Storage & Databases → D1 → Create** named `portfolio-db`, and copy its ID.)

## 2. Connect the repo (Workers & Pages → Create → Import a repository)
| Setting | Value |
|---|---|
| Project name | `rohith-portfolio` (matches `name` in wrangler.toml) |
| Build command | *(empty)* |
| Deploy command | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` |
| Root directory | *(empty)* |

The deploy command creates the tables and loads your content + resume on the first run, and only applies new migrations afterwards.

## 3. Set the admin key
Worker → **Settings → Variables and Secrets → Add** → type **Secret**, name `ADMIN_API_KEY`, value = a long random string (`openssl rand -hex 32`). Redeploy once.

## 4. Verify
- Open the site. DevTools → Network: `GET /api/profile` → **200**.
- **View Resume** loads the PDF from `/api/resume/download?inline=1`.
- `curl https://<your-worker>.workers.dev/api/admin/stats -H "x-admin-key: $KEY"`

## Day-to-day
| I want to… | Do this |
|---|---|
| Change the resume | `curl -X POST https://<site>/api/admin/files -H "x-admin-key: $KEY" -F kind=RESUME -F file=@Rohith_Reddy_Resume.pdf` (max 2 MB, live instantly) |
| Edit jobs/projects/skills | `POST/PUT/DELETE /api/admin/experiences`, `/projects`, `/skills`, `/education`, `/certifications`, `PUT /profile` |
| Read contact messages | `GET /api/admin/messages` |
| Run SQL on the live DB | `npx wrangler d1 execute DB --remote --command "SELECT * FROM messages"` |
| Change the schema | add `database/migrations/0003_xxx.sql`, push (deploy applies it) |
| Custom domain | Worker → **Settings → Domains & Routes** |

## API
Public: `GET /api/profile`, `/api/resume`, `/api/resume/download[?inline=1]`, `POST /api/messages`, `/api/visitors`, `/api/analytics/page-view`, `/api/analytics/download`.
Admin (`x-admin-key` header): `/api/admin/stats`, `/messages`, `/files`, `/profile`, `/experiences`, `/projects`, `/skills`, `/education`, `/certifications`.

## Notes
- Contact form is limited to 10 messages/hour/IP; a hidden `website` field acts as a honeypot.
- Files are stored in D1 (base64 chunks), so one D1 export contains everything. Free-plan D1 storage is 5 GB.
