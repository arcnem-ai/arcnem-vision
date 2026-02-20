import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Search, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getDocuments } from "@/features/documents/server/documents-data";
import type {
	DocumentItem,
	DocumentsResponse,
} from "@/features/documents/types";

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSemanticMatch(distance: number): string {
	const similarity = Math.max(0, Math.min(1, 1 - distance));
	return `${Math.round(similarity * 100)}% match`;
}

function DocumentCard({ doc }: { doc: DocumentItem }) {
	const [imgError, setImgError] = useState(false);

	return (
		<Card className="group overflow-hidden border-slate-200/60 bg-white/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
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
			</div>
			<CardContent className="space-y-2 pt-4">
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
				{doc.description ? (
					<p className="line-clamp-2 text-sm leading-relaxed text-slate-600">
						{doc.description}
					</p>
				) : (
					<p className="text-sm italic text-slate-400">No description</p>
				)}
			</CardContent>
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
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

export function DocumentGalleryPanel({
	initialData,
	organizationId,
}: {
	initialData: DocumentsResponse;
	organizationId: string;
}) {
	const fetchDocuments = useServerFn(getDocuments);
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

	const isFiltering = activeQuery.length > 0;

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
			setDocuments((prev) => [...prev, ...result.documents]);
			setNextCursor(result.nextCursor);
		} catch {
			// silently fail, user can retry
		} finally {
			setLoadingMore(false);
		}
	};

	return (
		<div className="space-y-4">
			<Card className="border-slate-200/60 bg-white/85 shadow-sm">
				<CardContent className="space-y-3 py-4">
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
					{isFiltering ? (
						<p className="text-xs text-slate-500">
							Showing semantic matches for{" "}
							<span className="font-medium text-slate-700">
								"{activeQuery}"
							</span>
						</p>
					) : null}
					{searchError ? (
						<p className="text-xs text-rose-600">{searchError}</p>
					) : null}
				</CardContent>
			</Card>

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
										: "Documents will appear here once devices upload images."}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{documents.map((doc) => (
						<DocumentCard key={doc.id} doc={doc} />
					))}
				</div>
			)}

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
		</div>
	);
}

export { LoadingSkeleton as DocumentGallerySkeleton };
