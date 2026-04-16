import {
	createDashboardRealtimeEvent,
	DASHBOARD_REALTIME_REASON,
	type DashboardRealtimeEventInput,
	getDashboardRealtimeChannel,
	serializeDashboardRealtimeEvent,
} from "@arcnem-vision/shared";
import { getRedisClient } from "@/clients/redis";

export async function publishDashboardRealtimeEvent(
	input: DashboardRealtimeEventInput,
): Promise<void> {
	try {
		await getRedisClient().publish(
			getDashboardRealtimeChannel(input.organizationId),
			serializeDashboardRealtimeEvent(input),
		);
	} catch (error) {
		console.error("Failed to publish dashboard realtime event", error);
	}
}

export function publishAPIKeyUsedRealtimeEvent(input: {
	apiKeyId: string;
	organizationId: string;
}): void {
	void publishDashboardRealtimeEvent(
		createDashboardRealtimeEvent({
			reason: DASHBOARD_REALTIME_REASON.apiKeyUsed,
			organizationId: input.organizationId,
			apiKeyId: input.apiKeyId,
		}),
	);
}
