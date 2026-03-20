import {
	type DashboardRealtimeEvent,
	parseDashboardRealtimeEvent,
} from "@arcnem-vision/shared";
import {
	createContext,
	type PropsWithChildren,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

type DashboardRealtimeConnectionState =
	| "disabled"
	| "connecting"
	| "open"
	| "error";

type DashboardRealtimeContextValue = {
	connectionState: DashboardRealtimeConnectionState;
	lastEvent: DashboardRealtimeEvent | null;
	reconnectCount: number;
};

const DashboardRealtimeContext = createContext<DashboardRealtimeContextValue>({
	connectionState: "disabled",
	lastEvent: null,
	reconnectCount: 0,
});

export function DashboardRealtimeProvider({
	children,
	organizationId,
}: PropsWithChildren<{ organizationId: string | null }>) {
	const [connectionState, setConnectionState] =
		useState<DashboardRealtimeConnectionState>(
			organizationId ? "connecting" : "disabled",
		);
	const [lastEvent, setLastEvent] = useState<DashboardRealtimeEvent | null>(
		null,
	);
	const [reconnectCount, setReconnectCount] = useState(0);
	const hasOpenedRef = useRef(false);

	useEffect(() => {
		setLastEvent(null);
		setReconnectCount(0);
		hasOpenedRef.current = false;

		if (!organizationId) {
			setConnectionState("disabled");
			return;
		}

		setConnectionState("connecting");
		const eventSource = new EventSource("/api/realtime/dashboard");

		eventSource.onopen = () => {
			setConnectionState("open");
			if (hasOpenedRef.current) {
				setReconnectCount((count) => count + 1);
				return;
			}
			hasOpenedRef.current = true;
		};

		eventSource.onerror = () => {
			setConnectionState("error");
		};

		const handleDashboardEvent = (event: Event) => {
			const message = event as MessageEvent<string>;
			const parsed = parseDashboardRealtimeEvent(message.data);
			if (!parsed || parsed.organizationId !== organizationId) {
				return;
			}
			setLastEvent(parsed);
		};

		eventSource.addEventListener("dashboard-event", handleDashboardEvent);

		return () => {
			eventSource.removeEventListener("dashboard-event", handleDashboardEvent);
			eventSource.close();
		};
	}, [organizationId]);

	return (
		<DashboardRealtimeContext.Provider
			value={{ connectionState, lastEvent, reconnectCount }}
		>
			{children}
		</DashboardRealtimeContext.Provider>
	);
}

export function useDashboardRealtime() {
	return useContext(DashboardRealtimeContext);
}
