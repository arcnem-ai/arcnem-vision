import { getDashboardRealtimeChannel } from "@arcnem-vision/shared";
import { RedisClient } from "bun";
import { Hono } from "hono";
import { API_ENV_VAR } from "@/env/apiEnvVar";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import type { HonoServerContext } from "@/types/serverContext";

// Bun's default idle timeout is shorter than 15s in local dev, so SSE needs
// a more frequent heartbeat to keep the connection alive consistently.
const HEARTBEAT_INTERVAL_MS = 5_000;

export const dashboardRealtimeRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardRealtimeRouter.get("/dashboard/realtime", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) {
		return access.response;
	}

	const subscriber = new RedisClient(getAPIEnvVar(API_ENV_VAR.REDIS_URL));
	await subscriber.connect();

	const encoder = new TextEncoder();
	const channel = getDashboardRealtimeChannel(access.context.organizationId);
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let closed = false;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const write = (chunk: string) => {
				if (!closed) {
					controller.enqueue(encoder.encode(chunk));
				}
			};

			const cleanup = async () => {
				if (closed) {
					return;
				}
				closed = true;
				if (heartbeatTimer) {
					clearInterval(heartbeatTimer);
					heartbeatTimer = null;
				}
				try {
					await subscriber.unsubscribe(channel);
				} catch {
					// best effort cleanup
				}
				subscriber.close();
				try {
					controller.close();
				} catch {
					// stream already closed
				}
			};

			c.req.raw.signal.addEventListener("abort", () => void cleanup(), {
				once: true,
			});

			write(": connected\n\n");
			heartbeatTimer = setInterval(
				() => write(": ping\n\n"),
				HEARTBEAT_INTERVAL_MS,
			);

			void subscriber
				.subscribe(channel, (message) => {
					write(`event: dashboard-event\ndata: ${message}\n\n`);
				})
				.catch(() => {
					void cleanup();
				});
		},
		cancel() {
			if (heartbeatTimer) {
				clearInterval(heartbeatTimer);
			}
			closed = true;
			try {
				subscriber.close();
			} catch {
				// best effort cleanup
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"Content-Type": "text/event-stream",
			"X-Accel-Buffering": "no",
		},
	});
});
