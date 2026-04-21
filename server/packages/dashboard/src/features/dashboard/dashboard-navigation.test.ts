import { describe, expect, test } from "bun:test";
import {
	DEFAULT_DASHBOARD_TAB,
	parseDashboardSearch,
} from "./dashboard-navigation";

describe("parseDashboardSearch", () => {
	test("defaults missing values for dashboard navigation", () => {
		expect(parseDashboardSearch({})).toEqual({
			showArchived: false,
			tab: DEFAULT_DASHBOARD_TAB,
		});
	});

	test("accepts supported tab values and archived flag strings", () => {
		expect(
			parseDashboardSearch({
				showArchived: "true",
				tab: "documents-view",
			}),
		).toEqual({
			showArchived: true,
			tab: "documents-view",
		});
	});

	test("falls back to the default tab for invalid values", () => {
		expect(
			parseDashboardSearch({
				showArchived: true,
				tab: "settings-view",
			}),
		).toEqual({
			showArchived: true,
			tab: DEFAULT_DASHBOARD_TAB,
		});
	});
});
