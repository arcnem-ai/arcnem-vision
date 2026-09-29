# Railway template

`railway.ts` describes the Railway project that the public template is generated from, using Railway's infrastructure-as-code SDK (the `railway` dev dependency at the repository root). Users deploy the template. They never need this file. The user guide is `server/packages/site/src/content/docs/guides/deploy-railway.md`.

## Updating the template

1. Change `railway.ts` and check it with `railway config plan` from the repository root.
2. Create a **new, empty** Railway project, link it, and run `railway config apply`. Inputs stay empty, so no secrets end up in the template.
3. Give the API and dashboard generated Railway domains: `railway domain --service vision-api --port 3000` and `railway domain --service vision-dashboard --port 3001`. The SDK can only declare fixed domain names, and the template gives each deployment its own generated domains on these ports.
4. Generate the template from that project with `railway templates create --project <project> --environment production`, and publish the new version from Railway's template page. Generation needs Railway's GitHub app to have access to the repository, even though the repository is public.
5. Deploy the template into another new project and follow the user guide end to end: sign in, upload through the dashboard and with a workflow key, and check that the run completes.

Never apply `railway.ts` to a project that is already running. Applying it generates fresh `secret()` values, which replaces the database password, auth secret, webhook encryption key and Inngest keys of the running deployment.

## Notes

- The agents register their functions with Inngest when they start, so the Inngest server lists only the API in `--sdk-url`. Polling re-syncs the API after it deploys new functions.
- `INNGEST_DEV` stays unset on every service. The Go SDK reads any value, even `0`, as dev mode.
- `vision-api` runs `deploy:prepare` before each deploy. It waits for the database, runs migrations, then runs the idempotent production bootstrap. Keep it one package script: Railway's pre-deploy command does not run shell chains reliably.
- Object storage stays outside the template. Railway buckets can't serve the public URLs that published documents use.
