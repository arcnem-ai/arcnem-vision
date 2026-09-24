"use client";

import type {
	WebhookDelivery,
	WebhookEndpoint,
	WebhookEndpointCreated,
} from "@arcnem-vision/shared";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Copy, RefreshCw, Send, Webhook } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	createWebhookEndpoint,
	listWebhookDeliveries,
	listWebhookEndpoints,
	resendWebhookDelivery,
	revokeWebhookEndpoint,
} from "@/features/dashboard/server-fns";
import type { StatusMessage } from "@/features/dashboard/types";
import { cn } from "@/lib/utils";

const DELIVERY_PAGE_SIZE = 10;

const deliveryStatusStyles: Record<WebhookDelivery["status"], string> = {
	pending: "bg-amber-100 text-amber-800 hover:bg-amber-100",
	delivered: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
	failed: "bg-rose-100 text-rose-800 hover:bg-rose-100",
	cancelled: "bg-slate-200 text-slate-700 hover:bg-slate-200",
};

function errorText(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}

function formatWhen(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function lastAttemptSummary(delivery: WebhookDelivery) {
	const last = delivery.attempts.at(-1);
	if (!last) return "Not attempted yet";
	const result = last.httpStatus
		? `HTTP ${last.httpStatus}`
		: last.errorCategory
			? last.errorCategory.replaceAll("_", " ")
			: last.outcome;
	const count = delivery.attempts.length;
	return `${count} ${count === 1 ? "attempt" : "attempts"} · last ${result}`;
}

function SigningSecretNotice({
	created,
	onDismiss,
}: {
	created: WebhookEndpointCreated;
	onDismiss: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(created.signingSecret);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	};
	return (
		<div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700/80">
						Signing secret
					</p>
					<p className="text-xs text-slate-600">
						Give this to the receiver for {created.endpoint.url}. It is only
						shown once.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => void copy()}
						className="rounded-full border-emerald-300 bg-white"
					>
						<Copy className="mr-2 size-4" />
						{copied ? "Copied" : "Copy secret"}
					</Button>
					<Button type="button" size="sm" onClick={onDismiss}>
						Done
					</Button>
				</div>
			</div>
			<code className="block overflow-x-auto rounded-2xl bg-slate-950 px-3 py-3 text-sm text-slate-50">
				{created.signingSecret}
			</code>
		</div>
	);
}

export function ServiceKeyWebhooks({
	apiKeyId,
	readOnly,
}: {
	apiKeyId: string;
	readOnly: boolean;
}) {
	const listEndpointsFn = useServerFn(listWebhookEndpoints);
	const createEndpointFn = useServerFn(createWebhookEndpoint);
	const revokeEndpointFn = useServerFn(revokeWebhookEndpoint);
	const listDeliveriesFn = useServerFn(listWebhookDeliveries);
	const resendDeliveryFn = useServerFn(resendWebhookDelivery);

	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
	const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [newUrl, setNewUrl] = useState("");
	const [adding, setAdding] = useState(false);
	const [created, setCreated] = useState<WebhookEndpointCreated | null>(null);
	const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [message, setMessage] = useState<StatusMessage | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [endpointResult, deliveryResult] = await Promise.all([
				listEndpointsFn({ data: { apiKeyId } }),
				listDeliveriesFn({ data: { apiKeyId, limit: DELIVERY_PAGE_SIZE } }),
			]);
			setEndpoints(endpointResult.endpoints);
			setDeliveries(deliveryResult.deliveries);
			setNextCursor(deliveryResult.nextCursor);
		} catch (error) {
			setMessage({
				tone: "error",
				text: errorText(error, "Failed to load webhooks."),
			});
		} finally {
			setLoading(false);
		}
	}, [apiKeyId, listDeliveriesFn, listEndpointsFn]);

	useEffect(() => {
		if (open) void load();
	}, [open, load]);

	const loadMore = async () => {
		if (!nextCursor) return;
		setBusyId("more");
		try {
			const result = await listDeliveriesFn({
				data: { apiKeyId, limit: DELIVERY_PAGE_SIZE, cursor: nextCursor },
			});
			setDeliveries((current) => [...current, ...result.deliveries]);
			setNextCursor(result.nextCursor);
		} catch (error) {
			setMessage({
				tone: "error",
				text: errorText(error, "Failed to load more deliveries."),
			});
		} finally {
			setBusyId(null);
		}
	};

	// Each signing secret is shown once, so a new endpoint waits until the current
	// secret has been dismissed.
	const addLocked = readOnly || adding || created !== null;

	const addEndpoint = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (addLocked) return;
		setAdding(true);
		setMessage(null);
		try {
			const result = await createEndpointFn({
				data: { apiKeyId, url: newUrl.trim() },
			});
			setCreated(result);
			setNewUrl("");
			setEndpoints((current) => [result.endpoint, ...current]);
		} catch (error) {
			setMessage({
				tone: "error",
				text: errorText(error, "Failed to add webhook endpoint."),
			});
		} finally {
			setAdding(false);
		}
	};

	const revoke = async (endpointId: string) => {
		setBusyId(endpointId);
		setMessage(null);
		try {
			const revoked = await revokeEndpointFn({
				data: { apiKeyId, endpointId },
			});
			setEndpoints((current) =>
				current.map((endpoint) =>
					endpoint.id === revoked.id ? revoked : endpoint,
				),
			);
			setConfirmRevokeId(null);
			setMessage({ tone: "success", text: "Endpoint revoked." });
		} catch (error) {
			setMessage({
				tone: "error",
				text: errorText(error, "Failed to revoke webhook endpoint."),
			});
		} finally {
			setBusyId(null);
		}
	};

	const resend = async (deliveryId: string) => {
		setBusyId(deliveryId);
		setMessage(null);
		try {
			const queued = await resendDeliveryFn({
				data: { apiKeyId, deliveryId },
			});
			setDeliveries((current) =>
				current.map((delivery) =>
					delivery.id === queued.id ? queued : delivery,
				),
			);
			setMessage({ tone: "success", text: "Delivery queued to resend." });
		} catch (error) {
			setMessage({
				tone: "error",
				text: errorText(error, "Failed to resend webhook delivery."),
			});
		} finally {
			setBusyId(null);
		}
	};

	const enabledEndpointIds = new Set(
		endpoints
			.filter((endpoint) => endpoint.status === "enabled")
			.map((endpoint) => endpoint.id),
	);
	const endpointUrlById = new Map(
		endpoints.map((endpoint) => [endpoint.id, endpoint.url]),
	);

	return (
		<div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/60">
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				aria-expanded={open}
				className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-violet-500"
			>
				<span className="flex items-center gap-2 text-sm font-medium text-slate-800">
					<Webhook className="size-4 text-violet-700" />
					Webhooks
				</span>
				<ChevronDown
					className={cn(
						"size-4 text-slate-500 transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>

			{open ? (
				<div className="space-y-4 border-t border-slate-200/80 px-4 py-4">
					<p className="text-xs text-slate-500">
						Endpoints receive signed workflow.completed and workflow.failed
						events for executions started with this key.
					</p>

					{message ? (
						<div
							role={message.tone === "error" ? "alert" : "status"}
							className={cn(
								"rounded-xl border px-3 py-2 text-sm",
								message.tone === "success"
									? "border-emerald-200 bg-emerald-50 text-emerald-800"
									: "border-rose-200 bg-rose-50 text-rose-800",
							)}
						>
							{message.text}
						</div>
					) : null}

					{created ? (
						<SigningSecretNotice
							created={created}
							onDismiss={() => setCreated(null)}
						/>
					) : null}

					<form
						className="flex flex-col gap-2 sm:flex-row"
						onSubmit={(event) => void addEndpoint(event)}
					>
						<Input
							id={`webhook-url-${apiKeyId}`}
							aria-label="Webhook endpoint URL"
							type="url"
							value={newUrl}
							onChange={(event) => setNewUrl(event.target.value)}
							placeholder="https://example.com/webhooks/vision"
							className="border-slate-300 bg-white"
							disabled={addLocked}
						/>
						<Button
							type="submit"
							disabled={addLocked || newUrl.trim().length === 0}
						>
							{adding ? "Adding..." : "Add endpoint"}
						</Button>
					</form>
					{created ? (
						<p className="text-xs text-slate-500">
							Store the signing secret above and click Done before adding
							another endpoint.
						</p>
					) : null}

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
								Endpoints
							</p>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => void load()}
								disabled={loading}
							>
								<RefreshCw
									className={cn("mr-2 size-4", loading && "animate-spin")}
								/>
								Refresh
							</Button>
						</div>
						{endpoints.length === 0 ? (
							<p className="rounded-xl border border-dashed border-slate-300/80 bg-white/70 px-3 py-3 text-sm text-slate-500">
								{loading ? "Loading..." : "No endpoints yet."}
							</p>
						) : (
							<ul className="space-y-2">
								{endpoints.map((endpoint) => (
									<li
										key={endpoint.id}
										className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2"
									>
										<div className="min-w-0 space-y-0.5">
											<p className="truncate font-mono text-sm text-slate-900">
												{endpoint.url}
											</p>
											<p className="text-xs text-slate-500">
												Added {formatWhen(endpoint.createdAt)}
												{endpoint.revokedAt
													? ` · revoked ${formatWhen(endpoint.revokedAt)}`
													: ""}
											</p>
										</div>
										<div className="flex items-center gap-2">
											<Badge
												className={cn(
													"rounded-full",
													endpoint.status === "enabled"
														? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
														: "bg-slate-200 text-slate-700 hover:bg-slate-200",
												)}
											>
												{endpoint.status === "enabled" ? "Enabled" : "Revoked"}
											</Badge>
											{endpoint.status === "enabled" && !readOnly ? (
												confirmRevokeId === endpoint.id ? (
													<>
														<Button
															type="button"
															size="sm"
															variant="destructive"
															onClick={() => void revoke(endpoint.id)}
															disabled={busyId === endpoint.id}
														>
															{busyId === endpoint.id
																? "Revoking..."
																: "Confirm revoke"}
														</Button>
														<Button
															type="button"
															size="sm"
															variant="ghost"
															onClick={() => setConfirmRevokeId(null)}
														>
															Keep
														</Button>
													</>
												) : (
													<Button
														type="button"
														size="sm"
														variant="outline"
														onClick={() => setConfirmRevokeId(endpoint.id)}
													>
														Revoke
													</Button>
												)
											) : null}
										</div>
									</li>
								))}
							</ul>
						)}
					</div>

					<div className="space-y-2">
						<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
							Recent deliveries
						</p>
						{deliveries.length === 0 ? (
							<p className="rounded-xl border border-dashed border-slate-300/80 bg-white/70 px-3 py-3 text-sm text-slate-500">
								{loading
									? "Loading..."
									: "No deliveries yet. They appear when an execution started with this key finishes."}
							</p>
						) : (
							<ul className="space-y-2">
								{deliveries.map((delivery) => {
									// A resend supersedes any earlier request, so it is always safe.
									const canResend =
										!readOnly && enabledEndpointIds.has(delivery.endpointId);
									return (
										<li
											key={delivery.id}
											className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2"
										>
											<div className="min-w-0 space-y-0.5">
												<div className="flex flex-wrap items-center gap-2">
													<Badge
														className={cn(
															"rounded-full capitalize",
															deliveryStatusStyles[delivery.status],
														)}
													>
														{delivery.status}
													</Badge>
													<span className="font-mono text-xs text-slate-700">
														{delivery.eventType}
													</span>
												</div>
												<p className="text-xs text-slate-500 wrap-anywhere">
													Execution {delivery.executionId} ·{" "}
													{lastAttemptSummary(delivery)} ·{" "}
													{formatWhen(delivery.createdAt)}
												</p>
												<p className="truncate font-mono text-xs text-slate-400">
													{endpointUrlById.get(delivery.endpointId) ??
														delivery.endpointId}
												</p>
											</div>
											{canResend ? (
												<Button
													type="button"
													size="sm"
													variant="outline"
													onClick={() => void resend(delivery.id)}
													disabled={busyId === delivery.id}
												>
													<Send className="mr-2 size-4" />
													{busyId === delivery.id ? "Resending..." : "Resend"}
												</Button>
											) : null}
										</li>
									);
								})}
							</ul>
						)}
						{nextCursor ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => void loadMore()}
								disabled={busyId === "more"}
							>
								{busyId === "more" ? "Loading..." : "Show older deliveries"}
							</Button>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
