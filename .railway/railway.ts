import {
	defineRailway,
	github,
	image,
	postgres,
	project,
	redis,
	service,
	volume,
} from "railway/iac";

// One-click deployment of Arcnem Vision on Railway. This project definition is
// what the Railway template is generated from (see .railway/README.md).
//
// Object storage is not part of the template: bring any S3-compatible bucket,
// such as Cloudflare R2, with a public base URL for published documents.

const REPO = "arcnem-ai/arcnem-vision";
const BRANCH = "main";

// Values filled in when the template is deployed.
const input = (description: string, value = "") => ({
	value,
	description,
});

export default defineRailway(() => {
	const pgvector = service("pgvector", {
		source: image("pgvector/pgvector:0.8.6-pg18"),
		env: {
			POSTGRES_USER: "postgres",
			POSTGRES_DB: "vision",
			POSTGRES_PASSWORD: "${{secret(32)}}",
			PGDATA: "/var/lib/postgresql/data/pgdata",
		},
		volumeMounts: {
			"/var/lib/postgresql/data": volume("pgvector-data"),
		},
	});
	const cache = redis("redis");

	const inngestPostgres = postgres("inngest-postgres");
	const inngestRedis = redis("inngest-redis");
	const inngest = service("inngest", {
		source: image("inngest/inngest:v1.44.0"),
		// The agents register themselves at startup, so only the API is listed.
		// Polling re-syncs the API after it deploys new functions.
		start:
			"/bin/sh -c 'exec inngest start --poll-interval 60 --sdk-url \"$API_SDK_URL\"'",
		healthcheck: "/health",
		env: {
			PORT: "8288",
			INNGEST_EVENT_KEY: '${{secret(64, "abcdef0123456789")}}',
			INNGEST_SIGNING_KEY: '${{secret(64, "abcdef0123456789")}}',
			INNGEST_POSTGRES_URI: inngestPostgres.env.DATABASE_URL,
			INNGEST_REDIS_URI: inngestRedis.env.REDIS_URL,
			API_SDK_URL:
				"http://${{vision-api.RAILWAY_PRIVATE_DOMAIN}}:3000/api/inngest",
		},
	});

	const databaseURL =
		"postgresql://postgres:${{pgvector.POSTGRES_PASSWORD}}@${{pgvector.RAILWAY_PRIVATE_DOMAIN}}:5432/vision";
	const inngestBaseURL = "http://${{inngest.RAILWAY_PRIVATE_DOMAIN}}:8288";

	const api = service("vision-api", {
		source: github(REPO, { branch: BRANCH, rootDirectory: "/server" }),
		build: {
			builder: "DOCKERFILE",
			dockerfilePath: "/server/packages/api/Dockerfile",
		},
		// Waits for the database, migrates, then bootstraps (idempotent).
		preDeploy: "bun run --cwd /app/packages/api deploy:prepare",
		healthcheck: "/health",
		env: {
			PORT: "3000",
			BETTER_AUTH_BASE_URL: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
			BETTER_AUTH_SECRET: "${{secret(48)}}",
			DASHBOARD_ORIGIN: "https://${{vision-dashboard.RAILWAY_PUBLIC_DOMAIN}}",
			AUTH_ENABLE_SIGN_UP: "false",
			AUTH_ENABLE_ORGANIZATION_CREATION: "false",
			AUTH_EMAIL_DELIVERY: input(
				'How sign-in codes are delivered: "log" writes them to this service\'s deploy logs, "resend" emails them (set RESEND_API_KEY and TRANSACTIONAL_EMAIL_ADDRESS).',
				"log",
			),
			RESEND_API_KEY: {
				value: "",
				description:
					'Resend API key, needed when AUTH_EMAIL_DELIVERY is "resend".',
				isOptional: true,
			},
			TRANSACTIONAL_EMAIL_ADDRESS: {
				value: "",
				description:
					'Sender address for sign-in emails, needed when AUTH_EMAIL_DELIVERY is "resend".',
				isOptional: true,
			},
			BOOTSTRAP_OWNER_EMAIL: input(
				"Email of the first owner. They sign in with a one-time code.",
			),
			BOOTSTRAP_ORGANIZATION_NAME: input(
				"Name of the first organization.",
				"My Organization",
			),
			DATABASE_URL: databaseURL,
			REDIS_URL: cache.env.REDIS_URL,
			S3_ENDPOINT: input(
				"S3-compatible endpoint, such as https://<account-id>.r2.cloudflarestorage.com",
			),
			S3_REGION: input("Bucket region (auto for R2).", "auto"),
			S3_BUCKET: input("Bucket name."),
			S3_ACCESS_KEY_ID: input("Access key ID for the bucket."),
			S3_SECRET_ACCESS_KEY: input("Secret access key for the bucket."),
			S3_USE_PATH_STYLE: input("Use path-style bucket URLs.", "true"),
			S3_PUBLIC_BASE_URL: input(
				"Public base URL of the bucket, used for documents you publish.",
			),
			INNGEST_APP_ID: "arcnem-vision-api",
			INNGEST_BASE_URL: inngestBaseURL,
			INNGEST_EVENT_KEY: inngest.env.INNGEST_EVENT_KEY,
			INNGEST_SIGNING_KEY: inngest.env.INNGEST_SIGNING_KEY,
			INNGEST_SERVE_ORIGIN: "http://${{RAILWAY_PRIVATE_DOMAIN}}:3000",
			MCP_SERVER_URL: "http://${{vision-mcp.RAILWAY_PRIVATE_DOMAIN}}:3021",
			OPENAI_API_KEY: input(
				"OpenAI API key, used for descriptions, chat and workflow drafting.",
			),
			OPENAI_MODEL: "gpt-4.1-mini",
			WEBHOOK_SECRET_ENCRYPTION_KEY:
				'${{secret(43, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/")}}=',
		},
	});

	const dashboard = service("vision-dashboard", {
		source: github(REPO, { branch: BRANCH, rootDirectory: "/server" }),
		build: {
			builder: "DOCKERFILE",
			dockerfilePath: "/server/packages/dashboard/Dockerfile",
		},
		env: {
			PORT: "3001",
			API_URL: "http://${{vision-api.RAILWAY_PRIVATE_DOMAIN}}:3000",
		},
	});

	const shared = {
		ENVIRONMENT: "production",
		DATABASE_URL: databaseURL,
		REDIS_URL: cache.env.REDIS_URL,
		S3_ENDPOINT: api.env.S3_ENDPOINT,
		S3_REGION: api.env.S3_REGION,
		S3_BUCKET: api.env.S3_BUCKET,
		S3_ACCESS_KEY_ID: api.env.S3_ACCESS_KEY_ID,
		S3_SECRET_ACCESS_KEY: api.env.S3_SECRET_ACCESS_KEY,
		S3_USE_PATH_STYLE: api.env.S3_USE_PATH_STYLE,
		OPENAI_API_KEY: api.env.OPENAI_API_KEY,
	};

	const agents = service("vision-agents", {
		source: github(REPO, { branch: BRANCH, rootDirectory: "/models" }),
		build: {
			builder: "DOCKERFILE",
			dockerfilePath: "/models/agents/Dockerfile",
		},
		healthcheck: "/health",
		env: {
			...shared,
			PORT: "3020",
			INNGEST_APP_ID: "arcnem-vision-agents",
			// INNGEST_DEV stays unset in deployments. The Go SDK treats any
			// value, even "0", as dev mode.
			INNGEST_BASE_URL: inngestBaseURL,
			INNGEST_SERVE_ORIGIN: "http://${{RAILWAY_PRIVATE_DOMAIN}}:3020",
			INNGEST_EVENT_KEY: inngest.env.INNGEST_EVENT_KEY,
			INNGEST_SIGNING_KEY: inngest.env.INNGEST_SIGNING_KEY,
			MCP_SERVER_URL: "http://${{vision-mcp.RAILWAY_PRIVATE_DOMAIN}}:3021",
		},
	});

	const mcp = service("vision-mcp", {
		source: github(REPO, { branch: BRANCH, rootDirectory: "/models" }),
		build: {
			builder: "DOCKERFILE",
			dockerfilePath: "/models/mcp/Dockerfile",
		},
		healthcheck: "/health",
		env: {
			...shared,
			PORT: "3021",
			REPLICATE_API_TOKEN: input(
				"Replicate API token, used for embeddings, OCR and segmentation models.",
			),
		},
	});

	return project("arcnem-vision", {
		resources: [
			pgvector,
			cache,
			inngestPostgres,
			inngestRedis,
			inngest,
			api,
			dashboard,
			agents,
			mcp,
		],
	});
});
