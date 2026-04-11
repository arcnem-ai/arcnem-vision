import { Hono } from "hono";
import type { HonoServerContext } from "@/types/serverContext";
import { dashboardDeviceAPIKeysRouter } from "./dashboardDevices/apiKeys";
import { dashboardDeviceRecordsRouter } from "./dashboardDevices/deviceRecords";

export const dashboardDevicesRouter = new Hono<HonoServerContext>({
	strict: false,
});

[dashboardDeviceRecordsRouter, dashboardDeviceAPIKeysRouter].forEach(
	(route) => {
		dashboardDevicesRouter.route("/", route);
	},
);
