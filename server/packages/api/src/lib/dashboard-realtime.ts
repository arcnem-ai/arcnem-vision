import {
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
