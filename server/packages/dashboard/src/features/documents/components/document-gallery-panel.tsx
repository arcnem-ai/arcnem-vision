import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Loader2, Play, Search, Upload, X } from "lucide-react";
import {
	type ChangeEvent,
	type FormEvent,
	useEffect,
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
import {
	acknowledgeDocumentUpload,
	createDocumentUpload,
	runDocumentWorkflow,
} from "@/features/documents/server/document-mutations";
import {
	getDocumentSegmentations,
	getDocuments,
} from "@/features/documents/server/documents-data";
import type {
	DocumentItem,
	DocumentsResponse,
	SegmentedResultItem,
} from "@/features/documents/types";
import { cn } from "@/lib/utils";

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

function getDocumentSourceLabel(deviceName: string | null | undefined) {
	return deviceName ?? "Dashboard Upload";
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
				<div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
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
					<Skeleton className="aspect-[4/3] w-full rounded-none" />
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
			<div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
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

export function DocumentGalleryPanel({
	initialData,
	organizationId,
	projects,
	devices,
	workflows,
}: {
	initialData: DocumentsResponse;
	organizationId: string;
	projects: DashboardData["projects"];
	devices: DashboardData["devices"];
	workflows: DashboardData["workflows"];
}) {
	const router = useRouter();
	const fetchDocuments = useServerFn(getDocuments);
	const fetchDocumentSegmentations = useServerFn(getDocumentSegmentations);
	const requestUpload = useServerFn(createDocumentUpload);
	const finalizeUpload = useServerFn(acknowledgeDocumentUpload);
	const queueWorkflowRun = useServerFn(runDocumentWorkflow);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const segmentationRequestIdRef = useRef(0);

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
	const [selectedProjectId, setSelectedProjectId] = useState(
		projects[0]?.id ?? "",
	);
	const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
		null,
	);
	const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
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
	const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
		null,
	);
	const [uploading, setUploading] = useState(false);
	const [runningDocumentId, setRunningDocumentId] = useState<string | null>(
		null,
	);

	const isFiltering = activeQuery.length > 0;

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

	useEffect(() => {
		setDocuments(initialData.documents);
		setNextCursor(initialData.nextCursor);
	}, [initialData.documents, initialData.nextCursor]);

	useEffect(() => {
		if (!projects.some((project) => project.id === selectedProjectId)) {
			setSelectedProjectId(projects[0]?.id ?? "");
		}
	}, [projects, selectedProjectId]);

	const defaultWorkflowIdForDocument = (document: DocumentItem) => {
		const assignedWorkflowId = document.deviceId
			? (devicesById.get(document.deviceId)?.agentGraphId ?? "")
			: "";
		if (assignedWorkflowId && workflowNameById.has(assignedWorkflowId)) {
			return assignedWorkflowId;
		}
		return workflows[0]?.id ?? "";
	};

	const loadSegmentedResults = async (documentId: string) => {
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
	};

	const selectDocument = (document: DocumentItem) => {
		setSelectedDocumentId(document.id);
		setSelectedWorkflowId(defaultWorkflowIdForDocument(document));
		setStatusMessage(null);
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
	const selectedDocumentSegmentedResultsError =
		selectedDocument && segmentedResultsDocumentId === selectedDocument.id
			? segmentedResultsError
			: null;
	const isLoadingSelectedDocumentSegmentedResults =
		Boolean(selectedDocument) &&
		segmentedResultsDocumentId === selectedDocument?.id &&
		loadingSegmentedResults;

	const resetToRecentDocuments = async () => {
		setSearching(true);
		setSearchError(null);
		try {
			const result = await fetchDocuments({
				data: { organizationId },
			});
			setDocuments(result.documents);
			setNextCursor(result.nextCursor);
			setActiveQuery("");
		} catch {
			setSearchError("Unable to refresh documents.");
		} finally {
			setSearching(false);
		}
	};

	const runSearch = async (nextQuery: string) => {
		const normalized = nextQuery.trim();
		if (normalized.length === 0) {
			await resetToRecentDocuments();
			return;
		}

		setSearching(true);
		setSearchError(null);
		try {
			const result = await fetchDocuments({
				data: { organizationId, query: normalized, limit: 36 },
			});
			setDocuments(result.documents);
			setNextCursor(result.nextCursor);
			setActiveQuery(normalized);
		} catch {
			setSearchError("Search failed. Please try again.");
		} finally {
			setSearching(false);
		}
	};

	const onSubmitSearch = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		await runSearch(query);
	};

	const clearSearch = async () => {
		setQuery("");
		await resetToRecentDocuments();
	};

	const loadMore = async () => {
		if (!nextCursor || loadingMore || isFiltering) return;
		setLoadingMore(true);
		try {
			const result = await fetchDocuments({
				data: { organizationId, cursor: nextCursor },
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

		if (!selectedProjectId) {
			setStatusMessage({
				tone: "error",
				text: "Choose a project before uploading.",
			});
			return;
		}

		setUploading(true);
		setStatusMessage(null);
		try {
			const presignedUpload = await requestUpload({
				data: {
					projectId: selectedProjectId,
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
					data: { organizationId },
				});
				refreshedDocuments = mergeDocuments(
					[acknowledgedUpload.document],
					latest.documents,
				);
				refreshedCursor = latest.nextCursor;
			} catch {
				// Keep the optimistic document list when refresh fails.
			}

			setDocuments(refreshedDocuments);
			setNextCursor(refreshedCursor);
			setActiveQuery("");
			setQuery("");
			setSearchError(null);
			selectDocument(acknowledgedUpload.document);
			setStatusMessage({
				tone: "success",
				text: "Image uploaded. Select a workflow below to run it against this document.",
			});
		} catch (error) {
			setStatusMessage({
				tone: "error",
				text: error instanceof Error ? error.message : "Image upload failed.",
			});
		} finally {
			setUploading(false);
		}
	};

	const onRunSelectedWorkflow = async () => {
		if (!selectedDocument) {
			setStatusMessage({
				tone: "error",
				text: "Select a document first.",
			});
			return;
		}
		if (!selectedWorkflowId) {
			setStatusMessage({
				tone: "error",
				text: "Choose a workflow before running.",
			});
			return;
		}

		setRunningDocumentId(selectedDocument.id);
		setStatusMessage(null);
		try {
			const result = await queueWorkflowRun({
				data: {
					documentId: selectedDocument.id,
					workflowId: selectedWorkflowId,
				},
			});
			setStatusMessage({
				tone: "success",
				text: `${result.workflowName} queued. Check the Runs tab for progress.`,
			});
			await router.invalidate();
		} catch (error) {
			setStatusMessage({
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

	return (
		<div className="space-y-4">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
				<Card className="border-slate-200/60 bg-white/88 shadow-sm">
					<CardHeader className="pb-3">
						<CardTitle className="text-lg">Find Images</CardTitle>
						<CardDescription>
							Search the document library by meaning and then click an image to
							open its workflow controls.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<form
							className="flex flex-col gap-2 sm:flex-row"
							onSubmit={onSubmitSearch}
						>
							<div className="relative flex-1">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
								<Input
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search by meaning — e.g. red bike by a window"
									className="border-slate-300 bg-white pl-9"
								/>
								{query.length > 0 ? (
									<button
										type="button"
										onClick={() => setQuery("")}
										className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
									>
										<X className="size-3.5" />
									</button>
								) : null}
							</div>
							<Button type="submit" disabled={searching} className="shrink-0">
								{searching ? "Searching..." : "Search"}
							</Button>
							{isFiltering ? (
								<Button
									type="button"
									variant="outline"
									onClick={clearSearch}
									disabled={searching}
									className="shrink-0"
								>
									Clear
								</Button>
							) : null}
						</form>

						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-xs text-slate-500">
								Search stays focused on discovery. Upload is handled separately
								in the intake panel.
							</p>
							{isFiltering ? (
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

						{searchError ? (
							<p className="text-xs text-rose-600">{searchError}</p>
						) : null}
					</CardContent>
				</Card>

				<Card className="relative overflow-hidden border-amber-300/70 bg-[linear-gradient(145deg,rgba(255,251,235,0.98),rgba(255,245,225,0.96))] shadow-sm">
					<div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_55%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_48%)]" />
					<CardHeader className="relative pb-3">
						<div className="flex items-center gap-3">
							<div className="rounded-2xl border border-amber-300/60 bg-white/70 p-2 shadow-sm">
								<Upload className="size-5 text-amber-700" />
							</div>
							<div>
								<CardTitle className="text-lg text-slate-900">
									Add From Dashboard
								</CardTitle>
								<CardDescription className="text-slate-600">
									Upload a one-off image directly into a project without binding
									it to a device.
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="relative space-y-4">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/jpeg,image/png,image/webp"
							className="hidden"
							onChange={onFileSelected}
						/>
						<div className="space-y-1.5">
							<p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-700/80">
								Project Destination
							</p>
							<Select
								value={selectedProjectId}
								onValueChange={setSelectedProjectId}
								disabled={projects.length === 0}
							>
								<SelectTrigger className="border-amber-200 bg-white/85">
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

						<div className="rounded-2xl border border-dashed border-amber-300/80 bg-white/65 p-4">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="space-y-1">
									<p className="text-sm font-medium text-slate-800">
										Drop in a reference image, sample photo, or manual capture.
									</p>
									<p className="text-sm text-slate-600">
										Supported formats: JPG, PNG, and WebP up to 10MB.
									</p>
								</div>
								<Button
									type="button"
									onClick={onUploadRequested}
									disabled={!selectedProjectId || uploading}
									className="min-w-40 bg-slate-900 text-white hover:bg-slate-800"
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

						<p className="text-xs leading-relaxed text-slate-500">
							New dashboard uploads appear in the gallery as independent project
							assets. Click the image afterward to run any workflow you want.
						</p>
					</CardContent>
				</Card>
			</div>

			{statusMessage ? (
				<div
					className={cn(
						"rounded-lg px-3 py-2 text-sm",
						statusMessage.tone === "success"
							? "border border-emerald-200 bg-emerald-50 text-emerald-800"
							: "border border-rose-200 bg-rose-50 text-rose-800",
					)}
				>
					{statusMessage.text}
				</div>
			) : null}

			{selectedDocument ? (
				<Card className="overflow-hidden border-slate-200/60 bg-white/85 shadow-sm">
					<CardHeader className="pb-3">
						<CardTitle className="text-lg">Selected Document</CardTitle>
						<CardDescription>
							Run a workflow against this image{" "}
							{selectedDocument.deviceId
								? "without changing the source device's saved workflow assignment."
								: "as a standalone dashboard upload."}
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
						<div className="space-y-4">
							<div className="overflow-hidden rounded-2xl bg-slate-100">
								<img
									src={selectedDocument.thumbnailUrl}
									alt={selectedDocument.description ?? "Selected document"}
									className="aspect-[4/3] w-full object-cover"
								/>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="secondary">{selectedDocumentProjectName}</Badge>
								<Badge variant="secondary">{selectedDocumentSourceLabel}</Badge>
								<Badge variant="outline">
									{selectedDocument.contentType
										.split("/")
										.pop()
										?.toUpperCase() ?? "FILE"}
								</Badge>
								<Badge variant="outline">
									{formatBytes(selectedDocument.sizeBytes)}
								</Badge>
							</div>
							<div className="space-y-1">
								<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
									Description
								</p>
								<p className="text-sm leading-relaxed text-slate-600">
									{selectedDocument.description ??
										"No description generated yet."}
								</p>
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
												<Skeleton className="aspect-[4/3] w-full rounded-none" />
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

						<div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
							<div className="space-y-1.5">
								<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
									Workflow
								</p>
								<Select
									value={selectedWorkflowId}
									onValueChange={setSelectedWorkflowId}
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
							</div>

							<div className="space-y-1 text-sm text-slate-500">
								{selectedDocument.deviceId ? (
									<p>
										Source device workflow:{" "}
										<span className="font-medium text-slate-700">
											{selectedDocumentDevice?.workflowName ?? "Not assigned"}
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
					</CardContent>
				</Card>
			) : documents.length > 0 ? (
				<Card className="border-dashed border-slate-300/80 bg-white/70 shadow-sm">
					<CardContent className="flex flex-col items-center gap-3 py-8 text-center">
						<div className="rounded-2xl bg-slate-100 p-4">
							<ImageIcon className="size-8 text-slate-300" />
						</div>
						<div>
							<p className="text-sm font-medium text-slate-500">
								Select an image to inspect it
							</p>
							<p className="mt-1 text-sm text-slate-400">
								Click any document card below to choose a workflow and run it.
							</p>
						</div>
					</CardContent>
				</Card>
			) : null}

			{documents.length === 0 ? (
				<Card className="border-slate-200/60 bg-white/80 py-16 text-center shadow-sm">
					<CardContent>
						<div className="flex flex-col items-center gap-3">
							<div className="rounded-2xl bg-slate-100 p-4">
								<ImageIcon className="size-8 text-slate-300" />
							</div>
							<div>
								<p className="text-lg font-medium text-slate-500">
									{isFiltering
										? "No semantic matches found"
										: "No documents uploaded yet"}
								</p>
								<p className="mt-1 text-sm text-slate-400">
									{isFiltering
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

					{nextCursor && !isFiltering ? (
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
		</div>
	);
}
