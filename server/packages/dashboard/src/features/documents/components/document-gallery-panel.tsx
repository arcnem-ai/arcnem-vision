import {
	DASHBOARD_REALTIME_REASON,
	DASHBOARD_REALTIME_SCOPE,
} from "@arcnem-vision/shared";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Loader2, Play, Search, Upload, X } from "lucide-react";
import {
	type ChangeEvent,
	type FormEvent,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardData, StatusMessage } from "@/features/dashboard/types";
import { chunkOCRText } from "@/features/documents/ocr-text";
import {
	acknowledgeDocumentUpload,
	createDocumentUpload,
	runDocumentWorkflow,
} from "@/features/documents/server/document-mutations";
import {
	getDocument,
	getDocumentOCRResults,
	getDocumentSegmentations,
	getDocuments,
} from "@/features/documents/server/documents-data";
import type {
	DocumentItem,
	DocumentsResponse,
	OCRResultItem,
	SegmentedResultItem,
} from "@/features/documents/types";
import { DocumentCollectionChat } from "@/features/documents-chat/components/document-collection-chat";
import { useDashboardRealtime } from "@/features/realtime/dashboard-realtime-provider";
import { cn } from "@/lib/utils";

const ALL_PROJECTS_FILTER = "all-projects";
const ALL_SOURCES_FILTER = "all-sources";
const DASHBOARD_UPLOADS_FILTER = "dashboard-uploads";
const DEVICE_SOURCE_FILTER_PREFIX = "device:";

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSemanticMatch(distance: number): string {
	const similarity = Math.max(0, Math.min(1, 1 - distance));
	return `${Math.round(similarity * 100)}% match`;
}

function formatShortDate(value: string): string {
	return new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function mergeDocuments(
	primary: DocumentItem[],
	secondary: DocumentItem[],
): DocumentItem[] {
	const seen = new Set<string>();
	return [...primary, ...secondary].filter((document) => {
		if (seen.has(document.id)) {
			return false;
		}
		seen.add(document.id);
		return true;
	});
}

function replaceDocument(
	items: DocumentItem[],
	nextDocument: DocumentItem,
): DocumentItem[] {
	let replaced = false;
	const nextItems = items.map((document) => {
		if (document.id !== nextDocument.id) {
			return document;
		}
		replaced = true;
		return nextDocument;
	});

	return replaced ? nextItems : items;
}

function getDocumentSourceLabel(deviceName: string | null | undefined) {
	return deviceName ?? "Dashboard Upload";
}

function getDeviceSourceFilterValue(deviceId: string) {
	return `${DEVICE_SOURCE_FILTER_PREFIX}${deviceId}`;
}

function getDeviceIdFromSourceFilterValue(value: string) {
	return value.startsWith(DEVICE_SOURCE_FILTER_PREFIX)
		? value.slice(DEVICE_SOURCE_FILTER_PREFIX.length)
		: null;
}

function StatusNotice({
	message,
	className,
}: {
	message: StatusMessage;
	className?: string;
}) {
	return (
		<div
			role={message.tone === "error" ? "alert" : "status"}
			className={cn(
				"rounded-lg border px-3 py-2 text-sm",
				message.tone === "success"
					? "border-emerald-200 bg-emerald-50 text-emerald-800"
					: "border-rose-200 bg-rose-50 text-rose-800",
				className,
			)}
		>
			{message.text}
		</div>
	);
}

function DocumentCard({
	doc,
	isSelected,
	onSelect,
	projectName,
	sourceLabel,
}: {
	doc: DocumentItem;
	isSelected: boolean;
	onSelect: () => void;
	projectName: string;
	sourceLabel: string;
}) {
	const [imgError, setImgError] = useState(false);

	return (
		<Card
			className={cn(
				"group overflow-hidden border-slate-200/60 bg-white/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
				isSelected && "ring-2 ring-slate-900/10 shadow-lg",
			)}
		>
			<button type="button" className="w-full text-left" onClick={onSelect}>
				<div className="relative aspect-4/3 w-full overflow-hidden bg-slate-100">
					{imgError ? (
						<div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-300">
							<ImageIcon className="size-8" />
							<span className="text-xs">Unable to load</span>
						</div>
					) : (
						<img
							src={doc.thumbnailUrl}
							alt={doc.description ?? "Document image"}
							className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							onError={() => setImgError(true)}
						/>
					)}
					{doc.distance != null ? (
						<Badge
							variant="secondary"
							className="absolute right-2 top-2 rounded-full bg-white/90 text-[11px] font-semibold shadow-sm backdrop-blur-sm"
						>
							{formatSemanticMatch(doc.distance)}
						</Badge>
					) : null}
					{isSelected ? (
						<Badge className="absolute left-2 top-2 rounded-full bg-slate-900 text-[11px] text-white">
							Selected
						</Badge>
					) : null}
				</div>
				<CardContent className="space-y-3 pt-4">
					<div className="flex items-center gap-2">
						<Badge variant="secondary" className="rounded-full text-[11px]">
							{doc.contentType.split("/").pop()?.toUpperCase() ?? "FILE"}
						</Badge>
						<span className="text-xs text-slate-400">
							{formatBytes(doc.sizeBytes)}
						</span>
						<span className="ml-auto text-xs text-slate-400">
							{new Date(doc.createdAt).toLocaleDateString(undefined, {
								month: "short",
								day: "numeric",
							})}
						</span>
					</div>
					<div className="space-y-1">
						<p className="truncate text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
							{projectName}
						</p>
						<p className="truncate text-sm text-slate-500">{sourceLabel}</p>
					</div>
					{doc.description ? (
						<p className="line-clamp-2 text-sm leading-relaxed text-slate-600">
							{doc.description}
						</p>
					) : (
						<p className="text-sm italic text-slate-400">No description yet</p>
					)}
				</CardContent>
			</button>
		</Card>
	);
}

function LoadingSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{["a", "b", "c", "d", "e", "f"].map((key) => (
				<Card
					key={key}
					className="overflow-hidden border-slate-200/60 bg-white/80"
				>
					<Skeleton className="aspect-4/3 w-full rounded-none" />
					<CardContent className="space-y-2 pt-4">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function SegmentedResultCard({ result }: { result: SegmentedResultItem }) {
	const [imgError, setImgError] = useState(false);

	return (
		<div className="min-w-60 max-w-60 shrink-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
			<div className="relative aspect-4/3 overflow-hidden bg-slate-100">
				{imgError ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-300">
						<ImageIcon className="size-7" />
						<span className="text-xs">Unable to load</span>
					</div>
				) : (
					<img
						src={result.document.thumbnailUrl}
						alt={result.document.description ?? "Segmented result"}
						className="h-full w-full object-cover"
						onError={() => setImgError(true)}
					/>
				)}
			</div>
			<div className="space-y-2 p-3">
				<div className="flex items-center gap-2">
					<Badge
						variant="secondary"
						className="max-w-40 truncate rounded-full text-[11px]"
						title={result.modelLabel}
					>
						{result.modelLabel}
					</Badge>
					<span className="ml-auto text-[11px] text-slate-400">
						{formatShortDate(result.segmentationCreatedAt)}
					</span>
				</div>
				{result.prompt ? (
					<p
						className="line-clamp-1 text-xs font-medium uppercase tracking-[0.14em] text-amber-700"
						title={result.prompt}
					>
						{result.prompt}
					</p>
				) : null}
				<p className="line-clamp-2 text-sm leading-relaxed text-slate-600">
					{result.document.description ??
						"Segmented output with no description yet."}
				</p>
			</div>
		</div>
	);
}

function OCRResultCard({ result }: { result: OCRResultItem }) {
	const chunks = useMemo(() => chunkOCRText(result.text), [result.text]);
	const [chunkIndex, setChunkIndex] = useState(0);

	const currentChunk = chunks[chunkIndex] ?? "";
	const hasMultipleChunks = chunks.length > 1;

	return (
		<div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
			<div className="flex flex-wrap items-center gap-2">
				<Badge
					variant="secondary"
					className="max-w-56 truncate rounded-full text-[11px]"
					title={result.modelLabel}
				>
					{result.modelLabel}
				</Badge>
				{result.avgConfidence != null ? (
					<Badge variant="outline" className="rounded-full text-[11px]">
						Confidence {result.avgConfidence}%
					</Badge>
				) : null}
				<span className="ml-auto text-[11px] text-slate-400">
					{formatShortDate(result.ocrCreatedAt)}
				</span>
			</div>

			<div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
				<p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
					{currentChunk}
				</p>
			</div>

			{hasMultipleChunks ? (
				<div className="flex items-center justify-between gap-3">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setChunkIndex((index) => Math.max(0, index - 1))}
						disabled={chunkIndex === 0}
					>
						Previous
					</Button>
					<p className="text-xs text-slate-500">
						Chunk {chunkIndex + 1} of {chunks.length}
					</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							setChunkIndex((index) => Math.min(chunks.length - 1, index + 1))
						}
						disabled={chunkIndex >= chunks.length - 1}
					>
						Next
					</Button>
				</div>
			) : null}

			<details className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
				<summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
					Raw JSON
				</summary>
				<pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-white p-3 text-[11px] text-slate-700">
					{JSON.stringify(result.result ?? {}, null, 2)}
				</pre>
			</details>
		</div>
	);
}

function DocumentDetailModal({
	selectedDocument,
	selectedDocumentProjectName,
	selectedDocumentSourceLabel,
	selectedDocumentDevice,
	selectedWorkflowId,
	selectedWorkflowName,
	workflows,
	runningDocumentId,
	selectedDocumentOCRResults,
	selectedDocumentOCRResultsError,
	isLoadingSelectedDocumentOCRResults,
	selectedDocumentSegmentedResults,
	selectedDocumentSegmentedResultsError,
	isLoadingSelectedDocumentSegmentedResults,
	statusMessage,
	onWorkflowChange,
	onRunSelectedWorkflow,
	onClose,
}: {
	selectedDocument: DocumentItem;
	selectedDocumentProjectName: string;
	selectedDocumentSourceLabel: string;
	selectedDocumentDevice: DashboardData["devices"][number] | null;
	selectedWorkflowId: string;
	selectedWorkflowName: string | null;
	workflows: DashboardData["workflows"];
	runningDocumentId: string | null;
	selectedDocumentOCRResults: OCRResultItem[];
	selectedDocumentOCRResultsError: string | null;
	isLoadingSelectedDocumentOCRResults: boolean;
	selectedDocumentSegmentedResults: SegmentedResultItem[];
	selectedDocumentSegmentedResultsError: string | null;
	isLoadingSelectedDocumentSegmentedResults: boolean;
	statusMessage: StatusMessage | null;
	onWorkflowChange: (workflowId: string) => void;
	onRunSelectedWorkflow: () => void;
	onClose: () => void;
}) {
	const closeButtonRef = useRef<HTMLButtonElement | null>(null);
	const titleId = `selected-document-title-${selectedDocument.id}`;
	const descriptionId = `selected-document-description-${selectedDocument.id}`;

	useEffect(() => {
		closeButtonRef.current?.focus();
	}, []);

	useEffect(() => {
		const previousOverflow = window.document.body.style.overflow;
		const previousPaddingRight = window.document.body.style.paddingRight;
		const scrollbarWidth =
			window.innerWidth - window.document.documentElement.clientWidth;

		window.document.body.style.overflow = "hidden";
		if (scrollbarWidth > 0) {
			window.document.body.style.paddingRight = `${scrollbarWidth}px`;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.document.body.style.overflow = previousOverflow;
			window.document.body.style.paddingRight = previousPaddingRight;
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-50">
			<button
				type="button"
				aria-label="Close image details"
				className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
				onClick={onClose}
			/>

			<div className="relative flex min-h-full items-end justify-center p-3 sm:items-center sm:p-6">
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby={titleId}
					aria-describedby={descriptionId}
					className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] shadow-[0_32px_90px_rgba(15,23,42,0.26)] sm:max-h-[calc(100vh-3rem)]"
				>
					<div className="border-b border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,255,255,0.88))] px-4 py-4 sm:px-6">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div className="space-y-3">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="secondary" className="rounded-full">
										{selectedDocumentProjectName}
									</Badge>
									<Badge variant="secondary" className="rounded-full">
										{selectedDocumentSourceLabel}
									</Badge>
									<Badge variant="outline" className="rounded-full">
										{formatShortDate(selectedDocument.createdAt)}
									</Badge>
								</div>
								<div className="space-y-1">
									<h2
										id={titleId}
										className="text-xl font-semibold tracking-tight text-slate-950"
									>
										Image detail workspace
									</h2>
									<p
										id={descriptionId}
										className="max-w-3xl text-sm leading-relaxed text-slate-600"
									>
										Run a workflow against this image, inspect OCR output, and
										review derived segments without losing your place in the
										gallery.
									</p>
								</div>
							</div>

							<Button
								ref={closeButtonRef}
								type="button"
								variant="outline"
								onClick={onClose}
								className="shrink-0 rounded-full border-slate-300 bg-white/85 text-slate-600 hover:bg-white"
							>
								<X className="mr-2 size-4" />
								Close
							</Button>
						</div>
					</div>

					<div className="overflow-y-auto">
						<div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
							<div className="space-y-5">
								<div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-100 shadow-sm">
									<img
										src={selectedDocument.thumbnailUrl}
										alt={selectedDocument.description ?? "Selected document"}
										className="aspect-4/3 w-full object-cover"
									/>
								</div>

								<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="outline" className="rounded-full">
											{selectedDocument.contentType
												.split("/")
												.pop()
												?.toUpperCase() ?? "FILE"}
										</Badge>
										<Badge variant="outline" className="rounded-full">
											{formatBytes(selectedDocument.sizeBytes)}
										</Badge>
										<Badge variant="outline" className="rounded-full">
											ID {selectedDocument.id.slice(0, 8)}
										</Badge>
									</div>
									<div className="mt-4 space-y-1">
										<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
											Description
										</p>
										<p className="text-sm leading-relaxed text-slate-600">
											{selectedDocument.description ??
												"No description generated yet."}
										</p>
									</div>
								</div>

								<div className="space-y-2">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
											Related OCR Results
										</p>
										<p className="text-xs text-slate-400">
											Workflow-generated text extraction appears here.
										</p>
									</div>

									{isLoadingSelectedDocumentOCRResults ? (
										<div className="space-y-3">
											{["ocr-a", "ocr-b"].map((key) => (
												<div
													key={key}
													className="rounded-2xl border border-slate-200/80 bg-white p-4"
												>
													<div className="flex items-center gap-2">
														<Skeleton className="h-5 w-32" />
														<Skeleton className="h-5 w-20" />
													</div>
													<div className="mt-3 space-y-2">
														<Skeleton className="h-4 w-full" />
														<Skeleton className="h-4 w-full" />
														<Skeleton className="h-4 w-2/3" />
													</div>
												</div>
											))}
										</div>
									) : selectedDocumentOCRResultsError ? (
										<p className="text-sm text-rose-600">
											{selectedDocumentOCRResultsError}
										</p>
									) : selectedDocumentOCRResults.length > 0 ? (
										<div className="space-y-3">
											{selectedDocumentOCRResults.map((result) => (
												<OCRResultCard
													key={result.ocrResultId}
													result={result}
												/>
											))}
										</div>
									) : (
										<div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-3">
											<p className="text-sm text-slate-500">
												No OCR results yet for this image.
											</p>
											<p className="mt-1 text-xs text-slate-400">
												Run an OCR workflow to capture extracted text here.
											</p>
										</div>
									)}
								</div>

								<div className="space-y-2">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
											Related Segmented Results
										</p>
										<p className="text-xs text-slate-400">
											Derived outputs stay nested under this source image.
										</p>
									</div>

									{isLoadingSelectedDocumentSegmentedResults ? (
										<div className="flex gap-3 overflow-x-auto pb-2">
											{["seg-a", "seg-b", "seg-c"].map((key) => (
												<div
													key={key}
													className="min-w-60 shrink-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white"
												>
													<Skeleton className="aspect-4/3 w-full rounded-none" />
													<div className="space-y-2 p-3">
														<Skeleton className="h-4 w-24" />
														<Skeleton className="h-4 w-32" />
														<Skeleton className="h-4 w-full" />
													</div>
												</div>
											))}
										</div>
									) : selectedDocumentSegmentedResultsError ? (
										<p className="text-sm text-rose-600">
											{selectedDocumentSegmentedResultsError}
										</p>
									) : selectedDocumentSegmentedResults.length > 0 ? (
										<div className="flex gap-3 overflow-x-auto pb-2">
											{selectedDocumentSegmentedResults.map((result) => (
												<SegmentedResultCard
													key={result.segmentationId}
													result={result}
												/>
											))}
										</div>
									) : (
										<div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-3">
											<p className="text-sm text-slate-500">
												No segmented results yet for this image.
											</p>
											<p className="mt-1 text-xs text-slate-400">
												When a segmentation workflow creates derived images,
												they&apos;ll appear here instead of the main gallery.
											</p>
										</div>
									)}
								</div>
							</div>

							<div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
								<div className="rounded-3xl border border-slate-200/80 bg-slate-50/85 p-4 shadow-sm">
									<div className="space-y-1">
										<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
											Workflow
										</p>
										<p className="text-sm leading-relaxed text-slate-500">
											Choose which workflow to run against the selected image.
										</p>
									</div>

									<div className="mt-4 space-y-4">
										{statusMessage ? (
											<StatusNotice message={statusMessage} />
										) : null}

										<Select
											value={selectedWorkflowId}
											onValueChange={onWorkflowChange}
											disabled={workflows.length === 0}
										>
											<SelectTrigger className="border-slate-300 bg-white">
												<SelectValue placeholder="Choose a workflow" />
											</SelectTrigger>
											<SelectContent>
												{workflows.map((workflow) => (
													<SelectItem key={workflow.id} value={workflow.id}>
														{workflow.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<div className="space-y-1 text-sm text-slate-500">
											{selectedDocument.deviceId ? (
												<p>
													Source device workflow:{" "}
													<span className="font-medium text-slate-700">
														{selectedDocumentDevice?.workflowName ??
															"Not assigned"}
													</span>
												</p>
											) : (
												<p>
													Source:{" "}
													<span className="font-medium text-slate-700">
														Dashboard upload with no device binding
													</span>
												</p>
											)}
											<p>
												Queued workflow:{" "}
												<span className="font-medium text-slate-700">
													{selectedWorkflowName ?? "Choose one above"}
												</span>
											</p>
										</div>

										<Button
											type="button"
											onClick={onRunSelectedWorkflow}
											disabled={
												workflows.length === 0 ||
												!selectedWorkflowId ||
												runningDocumentId === selectedDocument.id
											}
											className="w-full"
										>
											{runningDocumentId === selectedDocument.id ? (
												<>
													<Loader2 className="mr-2 size-4 animate-spin" />
													Queueing workflow...
												</>
											) : (
												<>
													<Play className="mr-2 size-4" />
													Run Workflow
												</>
											)}
										</Button>

										{workflows.length === 0 ? (
											<p className="text-sm text-slate-500">
												Create a workflow in the Workflow Library tab first.
											</p>
										) : null}
									</div>
								</div>

								<div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
									<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
										Context
									</p>
									<div className="mt-3 space-y-3 text-sm text-slate-500">
										<div>
											<p className="text-xs uppercase tracking-[0.16em] text-slate-400">
												Project
											</p>
											<p className="mt-1 font-medium text-slate-700">
												{selectedDocumentProjectName}
											</p>
										</div>
										<div>
											<p className="text-xs uppercase tracking-[0.16em] text-slate-400">
												Source
											</p>
											<p className="mt-1 font-medium text-slate-700">
												{selectedDocumentSourceLabel}
											</p>
										</div>
										<div>
											<p className="text-xs uppercase tracking-[0.16em] text-slate-400">
												Created
											</p>
											<p className="mt-1 font-medium text-slate-700">
												{new Date(selectedDocument.createdAt).toLocaleString()}
											</p>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export function DocumentGalleryPanel({
	initialData,
	organizationId,
	organizationName,
	projects,
	devices,
	workflows,
}: {
	initialData: DocumentsResponse;
	organizationId: string;
	organizationName: string;
	projects: DashboardData["projects"];
	devices: DashboardData["devices"];
	workflows: DashboardData["workflows"];
}) {
	const { lastEvent, reconnectCount } = useDashboardRealtime();
	const fetchDocuments = useServerFn(getDocuments);
	const fetchDocument = useServerFn(getDocument);
	const fetchDocumentOCRResults = useServerFn(getDocumentOCRResults);
	const fetchDocumentSegmentations = useServerFn(getDocumentSegmentations);
	const requestUpload = useServerFn(createDocumentUpload);
	const finalizeUpload = useServerFn(acknowledgeDocumentUpload);
	const queueWorkflowRun = useServerFn(runDocumentWorkflow);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const ocrRequestIdRef = useRef(0);
	const segmentationRequestIdRef = useRef(0);
	const hasAppliedInitialScopeRef = useRef(false);

	const [documents, setDocuments] = useState<DocumentItem[]>(
		initialData.documents,
	);
	const [nextCursor, setNextCursor] = useState<string | null>(
		initialData.nextCursor,
	);
	const [loadingMore, setLoadingMore] = useState(false);
	const [query, setQuery] = useState("");
	const [activeQuery, setActiveQuery] = useState("");
	const [searchError, setSearchError] = useState<string | null>(null);
	const [searching, setSearching] = useState(false);
	const [uploadProjectId, setUploadProjectId] = useState(projects[0]?.id ?? "");
	const [selectedProjectFilterId, setSelectedProjectFilterId] =
		useState(ALL_PROJECTS_FILTER);
	const [selectedSourceFilterValue, setSelectedSourceFilterValue] =
		useState(ALL_SOURCES_FILTER);
	const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
		null,
	);
	const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
	const [ocrResults, setOCRResults] = useState<OCRResultItem[]>([]);
	const [ocrResultsDocumentId, setOCRResultsDocumentId] = useState<
		string | null
	>(null);
	const [ocrResultsError, setOCRResultsError] = useState<string | null>(null);
	const [loadingOCRResults, setLoadingOCRResults] = useState(false);
	const [segmentedResults, setSegmentedResults] = useState<
		SegmentedResultItem[]
	>([]);
	const [segmentedResultsDocumentId, setSegmentedResultsDocumentId] = useState<
		string | null
	>(null);
	const [segmentedResultsError, setSegmentedResultsError] = useState<
		string | null
	>(null);
	const [loadingSegmentedResults, setLoadingSegmentedResults] = useState(false);
	const [uploadStatusMessage, setUploadStatusMessage] =
		useState<StatusMessage | null>(null);
	const [workflowStatusMessage, setWorkflowStatusMessage] =
		useState<StatusMessage | null>(null);
	const [uploading, setUploading] = useState(false);
	const [runningDocumentId, setRunningDocumentId] = useState<string | null>(
		null,
	);

	const isSearching = activeQuery.length > 0;

	const projectNameById = useMemo(
		() => new Map(projects.map((project) => [project.id, project.name])),
		[projects],
	);
	const devicesById = useMemo(
		() => new Map(devices.map((device) => [device.id, device])),
		[devices],
	);
	const workflowNameById = useMemo(
		() => new Map(workflows.map((workflow) => [workflow.id, workflow.name])),
		[workflows],
	);
	const filteredDevices = useMemo(() => {
		if (selectedProjectFilterId === ALL_PROJECTS_FILTER) {
			return devices;
		}
		return devices.filter(
			(device) => device.projectId === selectedProjectFilterId,
		);
	}, [devices, selectedProjectFilterId]);

	useEffect(() => {
		setDocuments(initialData.documents);
		setNextCursor(initialData.nextCursor);
	}, [initialData.documents, initialData.nextCursor]);

	useEffect(() => {
		if (!projects.some((project) => project.id === uploadProjectId)) {
			setUploadProjectId(projects[0]?.id ?? "");
		}
	}, [projects, uploadProjectId]);

	useEffect(() => {
		if (
			selectedProjectFilterId !== ALL_PROJECTS_FILTER &&
			!projects.some((project) => project.id === selectedProjectFilterId)
		) {
			setSelectedProjectFilterId(ALL_PROJECTS_FILTER);
		}
	}, [projects, selectedProjectFilterId]);

	useEffect(() => {
		const selectedDeviceId = getDeviceIdFromSourceFilterValue(
			selectedSourceFilterValue,
		);
		if (
			selectedDeviceId &&
			!filteredDevices.some((device) => device.id === selectedDeviceId)
		) {
			setSelectedSourceFilterValue(ALL_SOURCES_FILTER);
		}
	}, [filteredDevices, selectedSourceFilterValue]);

	const onProjectFilterChange = (projectFilterId: string) => {
		setSelectedProjectFilterId(projectFilterId);

		const selectedDeviceId = getDeviceIdFromSourceFilterValue(
			selectedSourceFilterValue,
		);
		if (!selectedDeviceId) {
			return;
		}

		const deviceStillAvailable = devices.some(
			(device) =>
				device.id === selectedDeviceId &&
				(projectFilterId === ALL_PROJECTS_FILTER ||
					device.projectId === projectFilterId),
		);
		if (!deviceStillAvailable) {
			setSelectedSourceFilterValue(ALL_SOURCES_FILTER);
		}
	};

	const buildDocumentsRequestData = ({
		cursor,
		limit,
		projectFilterId = selectedProjectFilterId,
		query: nextQuery,
		sourceFilterValue = selectedSourceFilterValue,
	}: {
		cursor?: string;
		limit?: number;
		projectFilterId?: string;
		query?: string;
		sourceFilterValue?: string;
	}) => {
		const deviceId = getDeviceIdFromSourceFilterValue(sourceFilterValue);

		return {
			organizationId,
			...(cursor ? { cursor } : {}),
			...(limit ? { limit } : {}),
			...(nextQuery?.trim() ? { query: nextQuery.trim() } : {}),
			...(projectFilterId !== ALL_PROJECTS_FILTER
				? { projectId: projectFilterId }
				: {}),
			...(deviceId ? { deviceId } : {}),
			...(sourceFilterValue === DASHBOARD_UPLOADS_FILTER
				? { dashboardUploadsOnly: true }
				: {}),
		};
	};

	const loadDocumentsForScope = useEffectEvent(
		async ({
			projectFilterId = selectedProjectFilterId,
			query: nextQuery = activeQuery,
			sourceFilterValue = selectedSourceFilterValue,
		}: {
			projectFilterId?: string;
			query?: string;
			sourceFilterValue?: string;
		} = {}) => {
			setSearching(true);
			setSearchError(null);
			try {
				const result = await fetchDocuments({
					data: buildDocumentsRequestData({
						projectFilterId,
						query: nextQuery,
						sourceFilterValue,
						limit: nextQuery?.trim() ? 36 : undefined,
					}),
				});
				setDocuments(result.documents);
				setNextCursor(result.nextCursor);
				if (
					selectedDocumentId &&
					!result.documents.some(
						(document) => document.id === selectedDocumentId,
					)
				) {
					closeSelectedDocument();
				}
				return result;
			} catch {
				setSearchError(
					nextQuery?.trim()
						? "Search failed. Please try again."
						: "Unable to refresh documents.",
				);
				return null;
			} finally {
				setSearching(false);
			}
		},
	);

	const refreshDocumentById = useEffectEvent(async (documentId: string) => {
		try {
			const nextDocument = await fetchDocument({ data: { documentId } });
			setDocuments((prev) => replaceDocument(prev, nextDocument));
			return nextDocument;
		} catch {
			return null;
		}
	});

	const refreshRecentDocuments = useEffectEvent(async () => {
		try {
			const result = await fetchDocuments({
				data: buildDocumentsRequestData({}),
			});
			setDocuments((prev) => mergeDocuments(result.documents, prev));
			setNextCursor(result.nextCursor);
			return result;
		} catch {
			return null;
		}
	});

	const defaultWorkflowIdForDocument = (document: DocumentItem) => {
		const assignedWorkflowId = document.deviceId
			? (devicesById.get(document.deviceId)?.agentGraphId ?? "")
			: "";
		if (assignedWorkflowId && workflowNameById.has(assignedWorkflowId)) {
			return assignedWorkflowId;
		}
		return workflows[0]?.id ?? "";
	};

	const loadSegmentedResults = useEffectEvent(async (documentId: string) => {
		const requestId = ++segmentationRequestIdRef.current;
		setSegmentedResultsDocumentId(documentId);
		setSegmentedResults([]);
		setSegmentedResultsError(null);
		setLoadingSegmentedResults(true);

		try {
			const result = await fetchDocumentSegmentations({
				data: { documentId },
			});
			if (segmentationRequestIdRef.current !== requestId) {
				return;
			}
			setSegmentedResults(result.segmentedResults);
		} catch {
			if (segmentationRequestIdRef.current !== requestId) {
				return;
			}
			setSegmentedResultsError("Unable to load segmented results.");
		} finally {
			if (segmentationRequestIdRef.current === requestId) {
				setLoadingSegmentedResults(false);
			}
		}
	});

	const loadOCRResults = useEffectEvent(async (documentId: string) => {
		const requestId = ++ocrRequestIdRef.current;
		setOCRResultsDocumentId(documentId);
		setOCRResults([]);
		setOCRResultsError(null);
		setLoadingOCRResults(true);

		try {
			const result = await fetchDocumentOCRResults({
				data: { documentId },
			});
			if (ocrRequestIdRef.current !== requestId) {
				return;
			}
			setOCRResults(result.ocrResults);
		} catch {
			if (ocrRequestIdRef.current !== requestId) {
				return;
			}
			setOCRResultsError("Unable to load OCR results.");
		} finally {
			if (ocrRequestIdRef.current === requestId) {
				setLoadingOCRResults(false);
			}
		}
	});

	const selectDocument = (document: DocumentItem) => {
		setSelectedDocumentId(document.id);
		setSelectedWorkflowId(defaultWorkflowIdForDocument(document));
		setWorkflowStatusMessage(null);
		void loadOCRResults(document.id);
		void loadSegmentedResults(document.id);
	};

	const selectedDocument = selectedDocumentId
		? (documents.find((document) => document.id === selectedDocumentId) ?? null)
		: null;
	const selectedDocumentDevice = selectedDocument
		? selectedDocument.deviceId
			? (devicesById.get(selectedDocument.deviceId) ?? null)
			: null
		: null;
	const selectedDocumentProjectName = selectedDocument
		? (projectNameById.get(selectedDocument.projectId) ?? "Unknown project")
		: null;
	const selectedDocumentSourceLabel = getDocumentSourceLabel(
		selectedDocumentDevice?.name,
	);
	const selectedWorkflowName = selectedWorkflowId
		? (workflowNameById.get(selectedWorkflowId) ?? null)
		: null;
	const selectedDocumentSegmentedResults =
		selectedDocument && segmentedResultsDocumentId === selectedDocument.id
			? segmentedResults
			: [];
	const selectedDocumentOCRResults =
		selectedDocument && ocrResultsDocumentId === selectedDocument.id
			? ocrResults
			: [];
	const selectedDocumentOCRResultsError =
		selectedDocument && ocrResultsDocumentId === selectedDocument.id
			? ocrResultsError
			: null;
	const isLoadingSelectedDocumentOCRResults =
		Boolean(selectedDocument) &&
		ocrResultsDocumentId === selectedDocument?.id &&
		loadingOCRResults;
	const selectedDocumentSegmentedResultsError =
		selectedDocument && segmentedResultsDocumentId === selectedDocument.id
			? segmentedResultsError
			: null;
	const isLoadingSelectedDocumentSegmentedResults =
		Boolean(selectedDocument) &&
		segmentedResultsDocumentId === selectedDocument?.id &&
		loadingSegmentedResults;

	useEffect(() => {
		if (!lastEvent || lastEvent.scope !== DASHBOARD_REALTIME_SCOPE.documents) {
			return;
		}

		void (async () => {
			if (lastEvent.documentId) {
				await refreshDocumentById(lastEvent.documentId);
			}

			if (
				!isSearching &&
				lastEvent.reason === DASHBOARD_REALTIME_REASON.documentCreated
			) {
				await refreshRecentDocuments();
			}

			if (!selectedDocumentId) {
				return;
			}

			const selectedDocumentWasUpdated =
				lastEvent.documentId === selectedDocumentId;
			const selectedDocumentSourceWasUpdated =
				lastEvent.sourceDocumentId === selectedDocumentId;
			const shouldRefreshSegmentedResults =
				(lastEvent.reason === DASHBOARD_REALTIME_REASON.segmentationCreated &&
					selectedDocumentSourceWasUpdated) ||
				(lastEvent.reason === DASHBOARD_REALTIME_REASON.descriptionUpserted &&
					selectedDocumentSourceWasUpdated &&
					lastEvent.documentId !== selectedDocumentId);
			const shouldRefreshOCRResults =
				lastEvent.reason === DASHBOARD_REALTIME_REASON.ocrCreated &&
				lastEvent.documentId === selectedDocumentId;

			if (selectedDocumentWasUpdated || shouldRefreshSegmentedResults) {
				await loadSegmentedResults(selectedDocumentId);
			}
			if (selectedDocumentWasUpdated || shouldRefreshOCRResults) {
				await loadOCRResults(selectedDocumentId);
			}
		})();
	}, [isSearching, lastEvent, selectedDocumentId]);

	useEffect(() => {
		if (reconnectCount === 0) {
			return;
		}

		void (async () => {
			if (!isSearching) {
				await refreshRecentDocuments();
			}

			if (selectedDocumentId) {
				await refreshDocumentById(selectedDocumentId);
				await loadOCRResults(selectedDocumentId);
				await loadSegmentedResults(selectedDocumentId);
			}
		})();
	}, [isSearching, reconnectCount, selectedDocumentId]);

	const resetToRecentDocuments = async () => {
		const result = await loadDocumentsForScope({ query: "" });
		if (result) {
			setActiveQuery("");
		}
	};

	const runSearch = async (nextQuery: string) => {
		const normalized = nextQuery.trim();
		if (normalized.length === 0) {
			await resetToRecentDocuments();
			return;
		}

		const result = await loadDocumentsForScope({ query: normalized });
		if (result) {
			setActiveQuery(normalized);
		}
	};

	const onSubmitSearch = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		await runSearch(query);
	};

	const clearSearch = async () => {
		setQuery("");
		if (!isSearching) return;
		await resetToRecentDocuments();
	};

	const loadMore = async () => {
		if (!nextCursor || loadingMore || isSearching) return;
		setLoadingMore(true);
		try {
			const result = await fetchDocuments({
				data: buildDocumentsRequestData({ cursor: nextCursor }),
			});
			setDocuments((prev) => mergeDocuments(prev, result.documents));
			setNextCursor(result.nextCursor);
		} catch {
			// silently fail, user can retry
		} finally {
			setLoadingMore(false);
		}
	};

	const onUploadRequested = () => {
		fileInputRef.current?.click();
	};

	const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		if (!uploadProjectId) {
			setUploadStatusMessage({
				tone: "error",
				text: "Choose a project before uploading.",
			});
			return;
		}

		setUploading(true);
		setUploadStatusMessage(null);
		try {
			const presignedUpload = await requestUpload({
				data: {
					projectId: uploadProjectId,
					contentType: file.type,
					size: file.size,
				},
			});
			const uploadResponse = await fetch(presignedUpload.uploadUrl, {
				method: "PUT",
				headers: {
					"Content-Type": presignedUpload.contentType,
				},
				body: file,
			});
			if (!(uploadResponse.status === 200 || uploadResponse.status === 201)) {
				throw new Error(
					`Image upload failed with status ${uploadResponse.status}.`,
				);
			}

			const acknowledgedUpload = await finalizeUpload({
				data: { objectKey: presignedUpload.objectKey },
			});

			let refreshedDocuments = mergeDocuments(
				[acknowledgedUpload.document],
				documents,
			);
			let refreshedCursor = nextCursor;
			try {
				const latest = await fetchDocuments({
					data: buildDocumentsRequestData({
						projectFilterId: acknowledgedUpload.document.projectId,
						sourceFilterValue: DASHBOARD_UPLOADS_FILTER,
					}),
				});
				refreshedDocuments = mergeDocuments(
					[acknowledgedUpload.document],
					latest.documents,
				);
				refreshedCursor = latest.nextCursor;
			} catch {
				// Keep the optimistic document list when refresh fails.
			}

			setSelectedProjectFilterId(acknowledgedUpload.document.projectId);
			setSelectedSourceFilterValue(DASHBOARD_UPLOADS_FILTER);
			setDocuments(refreshedDocuments);
			setNextCursor(refreshedCursor);
			setActiveQuery("");
			setQuery("");
			setSearchError(null);
			selectDocument(acknowledgedUpload.document);
			setWorkflowStatusMessage({
				tone: "success",
				text: "Image uploaded. Select a workflow below to run it against this document.",
			});
		} catch (error) {
			setUploadStatusMessage({
				tone: "error",
				text: error instanceof Error ? error.message : "Image upload failed.",
			});
		} finally {
			setUploading(false);
		}
	};

	const onRunSelectedWorkflow = async () => {
		if (!selectedDocument) {
			setWorkflowStatusMessage({
				tone: "error",
				text: "Select a document first.",
			});
			return;
		}
		if (!selectedWorkflowId) {
			setWorkflowStatusMessage({
				tone: "error",
				text: "Choose a workflow before running.",
			});
			return;
		}

		setRunningDocumentId(selectedDocument.id);
		setWorkflowStatusMessage(null);
		try {
			const result = await queueWorkflowRun({
				data: {
					documentId: selectedDocument.id,
					workflowId: selectedWorkflowId,
				},
			});
			setWorkflowStatusMessage({
				tone: "success",
				text: `${result.workflowName} queued. Check the Runs tab for progress.`,
			});
		} catch (error) {
			setWorkflowStatusMessage({
				tone: "error",
				text:
					error instanceof Error
						? error.message
						: "Failed to enqueue workflow.",
			});
		} finally {
			setRunningDocumentId(null);
		}
	};

	const closeSelectedDocument = () => {
		setSelectedDocumentId(null);
		setSelectedWorkflowId("");
		setWorkflowStatusMessage(null);
	};

	useEffect(() => {
		if (
			selectedDocumentId &&
			!documents.some((doc) => doc.id === selectedDocumentId)
		) {
			setSelectedDocumentId(null);
			setSelectedWorkflowId("");
			setWorkflowStatusMessage(null);
		}
	}, [documents, selectedDocumentId]);

	useEffect(() => {
		if (!hasAppliedInitialScopeRef.current) {
			hasAppliedInitialScopeRef.current = true;
			return;
		}
		void loadDocumentsForScope({
			projectFilterId: selectedProjectFilterId,
			sourceFilterValue: selectedSourceFilterValue,
		});
	}, [selectedProjectFilterId, selectedSourceFilterValue]);

	return (
		<div className="space-y-4">
			<div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
				<Card className="self-start border-slate-200/60 bg-white/88 py-5 shadow-sm">
					<CardHeader className="px-5 pb-2.5">
						<CardTitle className="text-base sm:text-lg">Find Images</CardTitle>
						<CardDescription>
							Search the document library by meaning and then click an image to
							open its workflow controls.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3 px-5 pt-0">
						<form
							className="flex flex-col gap-2 sm:flex-row sm:items-center"
							onSubmit={onSubmitSearch}
						>
							<div className="relative flex-1">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
								<Input
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search by meaning — e.g. red bike by a window"
									className="border-slate-300 bg-white pl-9 pr-9"
								/>
								{query.length > 0 ? (
									<button
										type="button"
										onClick={clearSearch}
										className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
									>
										<X className="size-3.5" />
									</button>
								) : null}
							</div>
							<Button
								type="submit"
								size="sm"
								disabled={searching}
								className="shrink-0 sm:min-w-24"
							>
								{searching ? "Searching..." : "Search"}
							</Button>
						</form>

						<div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-xs text-slate-500">
								Search stays focused on discovery. Upload is handled separately
								in the intake panel.
							</p>
							{isSearching ? (
								<p className="text-xs text-slate-500">
									Showing semantic matches for{" "}
									<span className="font-medium text-slate-700">
										"{activeQuery}"
									</span>
								</p>
							) : (
								<p className="text-xs text-slate-500">
									Browse recent images or search by description.
								</p>
							)}
						</div>

						<div className="grid gap-3 md:grid-cols-2">
							<div className="space-y-1.5">
								<p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
									Project Filter
								</p>
								<Select
									value={selectedProjectFilterId}
									onValueChange={onProjectFilterChange}
								>
									<SelectTrigger className="border-slate-300 bg-white">
										<SelectValue placeholder="All projects" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL_PROJECTS_FILTER}>
											All projects
										</SelectItem>
										{projects.map((project) => (
											<SelectItem key={project.id} value={project.id}>
												{project.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-1.5">
								<p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
									Source Filter
								</p>
								<Select
									value={selectedSourceFilterValue}
									onValueChange={setSelectedSourceFilterValue}
								>
									<SelectTrigger className="border-slate-300 bg-white">
										<SelectValue placeholder="All sources" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL_SOURCES_FILTER}>
											All sources
										</SelectItem>
										<SelectItem value={DASHBOARD_UPLOADS_FILTER}>
											Dashboard uploads
										</SelectItem>
										{filteredDevices.map((device) => (
											<SelectItem
												key={device.id}
												value={getDeviceSourceFilterValue(device.id)}
											>
												{selectedProjectFilterId === ALL_PROJECTS_FILTER
													? `${device.name} · ${projectNameById.get(device.projectId) ?? "Unknown project"}`
													: device.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						{searchError ? (
							<p className="text-xs text-rose-600">{searchError}</p>
						) : null}
					</CardContent>
				</Card>

				<Card className="relative self-start gap-3 overflow-hidden border-amber-300/70 bg-[linear-gradient(145deg,rgba(255,251,235,0.98),rgba(255,245,225,0.96))] py-4 shadow-sm">
					<div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_55%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_48%)]" />
					<CardHeader className="relative gap-2 px-5 pb-0">
						<div className="flex items-center gap-3">
							<div className="rounded-xl border border-amber-300/60 bg-white/70 p-1.5 shadow-sm">
								<Upload className="size-4 text-amber-700" />
							</div>
							<div>
								<CardTitle className="text-base text-slate-900 sm:text-lg">
									Add From Dashboard
								</CardTitle>
								<CardDescription className="text-slate-600">
									Upload a one-off image directly into a project without binding
									it to a device.
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="relative space-y-2.5 px-5 pt-0">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/jpeg,image/png,image/webp"
							className="hidden"
							onChange={onFileSelected}
						/>
						<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700/80 sm:whitespace-nowrap">
								Project Destination
							</p>
							<Select
								value={uploadProjectId}
								onValueChange={setUploadProjectId}
								disabled={projects.length === 0}
							>
								<SelectTrigger
									size="sm"
									className="w-full border-amber-200 bg-white/85 sm:min-w-52"
								>
									<SelectValue placeholder="Choose a project" />
								</SelectTrigger>
								<SelectContent>
									{projects.map((project) => (
										<SelectItem key={project.id} value={project.id}>
											{project.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="rounded-xl border border-dashed border-amber-300/80 bg-white/65 p-3">
							<div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
								<div className="space-y-1">
									<p className="text-sm font-medium text-slate-800">
										Drop in a reference image, sample photo, or manual capture.
									</p>
									<p className="text-xs text-slate-600">
										Supported formats: JPG, PNG, and WebP up to 10MB.
									</p>
								</div>
								<Button
									type="button"
									onClick={onUploadRequested}
									disabled={!uploadProjectId || uploading}
									size="sm"
									className="min-w-36 bg-slate-900 text-white hover:bg-slate-800"
								>
									{uploading ? (
										<>
											<Loader2 className="mr-2 size-4 animate-spin" />
											Uploading...
										</>
									) : (
										<>
											<Upload className="mr-2 size-4" />
											Choose Image
										</>
									)}
								</Button>
							</div>
						</div>

						<p className="text-[11px] leading-relaxed text-slate-500">
							New dashboard uploads appear in the gallery as independent project
							assets. Click the image afterward to run any workflow you want.
						</p>

						{uploadStatusMessage ? (
							<StatusNotice message={uploadStatusMessage} />
						) : null}
					</CardContent>
				</Card>
			</div>

			{documents.length === 0 ? (
				<Card className="border-slate-200/60 bg-white/80 py-16 text-center shadow-sm">
					<CardContent>
						<div className="flex flex-col items-center gap-3">
							<div className="rounded-2xl bg-slate-100 p-4">
								<ImageIcon className="size-8 text-slate-300" />
							</div>
							<div>
								<p className="text-lg font-medium text-slate-500">
									{isSearching
										? "No semantic matches found"
										: "No documents uploaded yet"}
								</p>
								<p className="mt-1 text-sm text-slate-400">
									{isSearching
										? "Try a different phrase or clear the search."
										: "Upload an image here or wait for device uploads to appear."}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			) : searching ? (
				<LoadingSkeleton />
			) : (
				<>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{documents.map((doc) => (
							<DocumentCard
								key={doc.id}
								doc={doc}
								isSelected={doc.id === selectedDocumentId}
								onSelect={() => selectDocument(doc)}
								projectName={
									projectNameById.get(doc.projectId) ?? "Unknown project"
								}
								sourceLabel={getDocumentSourceLabel(
									doc.deviceId ? devicesById.get(doc.deviceId)?.name : null,
								)}
							/>
						))}
					</div>

					{nextCursor && !isSearching ? (
						<div className="flex justify-center pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={loadMore}
								disabled={loadingMore}
								className="rounded-full border-slate-300 text-slate-600"
							>
								{loadingMore ? "Loading..." : "Load more"}
							</Button>
						</div>
					) : null}
				</>
			)}

			{selectedDocument && selectedDocumentProjectName ? (
				<DocumentDetailModal
					selectedDocument={selectedDocument}
					selectedDocumentProjectName={selectedDocumentProjectName}
					selectedDocumentSourceLabel={selectedDocumentSourceLabel}
					selectedDocumentDevice={selectedDocumentDevice}
					selectedWorkflowId={selectedWorkflowId}
					selectedWorkflowName={selectedWorkflowName}
					workflows={workflows}
					runningDocumentId={runningDocumentId}
					selectedDocumentOCRResults={selectedDocumentOCRResults}
					selectedDocumentOCRResultsError={selectedDocumentOCRResultsError}
					isLoadingSelectedDocumentOCRResults={
						isLoadingSelectedDocumentOCRResults
					}
					selectedDocumentSegmentedResults={selectedDocumentSegmentedResults}
					selectedDocumentSegmentedResultsError={
						selectedDocumentSegmentedResultsError
					}
					isLoadingSelectedDocumentSegmentedResults={
						isLoadingSelectedDocumentSegmentedResults
					}
					statusMessage={workflowStatusMessage}
					onWorkflowChange={(workflowId) => {
						setSelectedWorkflowId(workflowId);
						setWorkflowStatusMessage(null);
					}}
					onRunSelectedWorkflow={onRunSelectedWorkflow}
					onClose={closeSelectedDocument}
				/>
			) : null}

			<DocumentCollectionChat
				organizationId={organizationId}
				organizationName={organizationName}
				isLauncherHidden={Boolean(selectedDocument)}
			/>
		</div>
	);
}
