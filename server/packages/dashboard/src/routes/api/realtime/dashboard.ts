import { getDashboardRealtimeChannel } from "@arcnem-vision/shared";
import { createFileRoute } from "@tanstack/react-router";
import { RedisClient } from "bun";
import { DASHBOARD_ENV_VAR } from "@/env/dashboardEnvVar";
import { getDashboardEnvVar } from "@/env/getDashboardEnvVar";
import { getSessionContext } from "@/features/dashboard/server/session-context";

const HEARTBEAT_INTERVAL_MS = 15_000;

export const Route = createFileRoute("/api/realtime/dashboard")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const sessionContext = await getSessionContext();
				if (!sessionContext.session) {
					return new Response("Unauthorized", { status: 401 });
				}
				if (!sessionContext.organizationId) {
					return new Response("No organization context", { status: 403 });
				}

				const subscriber = new RedisClient(
					getDashboardEnvVar(DASHBOARD_ENV_VAR.REDIS_URL),
				);
				await subscriber.connect();

				const encoder = new TextEncoder();
				const channel = getDashboardRealtimeChannel(
					sessionContext.organizationId,
				);

				let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
				let closed = false;

				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						const write = (chunk: string) => {
							if (closed) {
								return;
							}
							controller.enqueue(encoder.encode(chunk));
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

						request.signal.addEventListener(
							"abort",
							() => {
								void cleanup();
							},
							{ once: true },
						);

						write(": connected\n\n");
						heartbeatTimer = setInterval(() => {
							write(": ping\n\n");
						}, HEARTBEAT_INTERVAL_MS);

						void subscriber
							.subscribe(channel, (message) => {
								write(`event: dashboard-event\ndata: ${message}\n\n`);
							})
							.catch((error) => {
								console.error(
									"Failed to subscribe to dashboard realtime channel",
									error,
								);
								void cleanup();
							});
					},
					cancel() {
						if (heartbeatTimer) {
							clearInterval(heartbeatTimer);
							heartbeatTimer = null;
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
			},
		},
	},
});
