// biome-ignore lint/suspicious/noExplicitAny: JSON state blobs from the database
type JsonValue = any;

export type RunItem = {
	id: string;
	agentGraphId: string;
	workflowName: string;
	status: string;
	error: string | null;
	startedAt: string;
	finishedAt: string | null;
};

export type RunStep = {
	id: string;
	nodeKey: string;
	stepOrder: number;
	stateDelta: JsonValue;
	startedAt: string;
	finishedAt: string | null;
};

export type RunsResponse = {
	runs: RunItem[];
	nextCursor: string | null;
};

export type RunStepsResponse = {
	steps: RunStep[];
	initialState: JsonValue;
	finalState: JsonValue;
	error: string | null;
};
