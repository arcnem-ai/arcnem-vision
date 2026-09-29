# Railway template

The template is https://railway.com/deploy/uNnh3M, linked from both READMEs and the Deploy on Railway guide.

`railway.ts` describes the Railway project that the public template is generated from, using Railway's infrastructure-as-code SDK (the `railway` dev dependency at the repository root). Users deploy the template. They never need this file. The user guide is `server/packages/site/src/content/docs/guides/deploy-railway.md`.

## Updating the template

1. Change `railway.ts` and check it with `railway config plan` from the repository root.
2. Create a **new, empty** Railway project, link it, and run `railway config apply`. Inputs stay empty, so no secrets end up in the template.
3. Give the API and dashboard generated Railway domains: `railway domain --service vision-api --port 3000` and `railway domain --service vision-dashboard --port 3001`. The SDK can only declare fixed domain names, and the template gives each deployment its own generated domains on these ports.
4. Generate the template from that project with `railway templates create --project <project> --environment production`. Each generation creates a new template with its own code, so update the links afterwards. Generation needs Railway's GitHub app to have access to the repository, even though the repository is public.
5. In the template editor, restore what generation drops. Railway keeps only `${{...}}` references and generators, so every plain default in `railway.ts` (ports, `POSTGRES_USER`, the auth switches, `S3_REGION`, app IDs, and the databases' own settings) and every input description must be entered again. The app services also lose their Dockerfile setting: give each a `RAILWAY_DOCKERFILE_PATH` variable relative to its root directory (`packages/api/Dockerfile`, `packages/dashboard/Dockerfile`, `agents/Dockerfile`, `mcp/Dockerfile`). Railway has no public API for editing a template, so this is done in the browser.
6. Deploy the template into another new project and follow the user guide end to end: sign in, upload through the dashboard and with a workflow key, and check that the run completes.

Never apply `railway.ts` to a project that is already running. Applying it generates fresh `secret()` values, which replaces the database password, auth secret, webhook encryption key and Inngest keys of the running deployment.

## Notes

- The agents register their functions with Inngest when they start, so the Inngest server lists only the API in `--sdk-url`. Polling re-syncs the API after it deploys new functions.
- `INNGEST_DEV` stays unset on every service. The Go SDK reads any value, even `0`, as dev mode.
- `vision-api` runs `deploy:prepare` before each deploy. It waits for the database, runs migrations, then runs the idempotent production bootstrap. Keep it one package script: Railway's pre-deploy command does not run shell chains reliably.
- Object storage stays outside the template. Railway buckets can't serve the public URLs that published documents use.
