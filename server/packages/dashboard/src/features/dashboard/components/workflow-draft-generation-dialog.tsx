import { Loader2, Sparkles, WandSparkles, Workflow, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const MIN_WORKFLOW_DESCRIPTION_LENGTH = 10;

function WorkflowDraftGenerationLoadingState() {
	return (
		<div className="overflow-hidden rounded-3xl border border-slate-900/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(244,250,255,0.95),rgba(241,253,247,0.98))] shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
			<div className="border-b border-slate-900/8 px-5 py-4">
				<div className="flex items-center gap-3">
					<div className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
						<WandSparkles className="size-5 animate-pulse" />
					</div>
					<div>
						<p className="font-display text-xl text-slate-900">
							Drafting your workflow graph
						</p>
						<p className="text-sm text-slate-600">
							Planning nodes, checking the live catalog, and laying out the
							canvas.
						</p>
					</div>
				</div>
			</div>

			<div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.15fr_0.85fr]">
				<div className="space-y-3">
					{[
						"Interpreting the workflow brief",
						"Matching models and tools from your catalog",
						"Arranging a clean first-pass graph",
					].map((step) => (
						<div
							key={step}
							className="flex items-center gap-3 rounded-2xl border border-slate-900/8 bg-white/80 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
						>
							<div className="flex size-8 items-center justify-center rounded-full bg-sky-100 text-sky-700">
								<Loader2 className="size-4 animate-spin" />
							</div>
							<span className="text-sm font-medium text-slate-700">{step}</span>
						</div>
					))}
				</div>

				<div className="rounded-3xl border border-slate-900/8 bg-slate-950/3 p-4">
					<div className="relative h-44 overflow-hidden rounded-2xl border border-slate-900/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(247,250,252,0.94))]">
						<div className="absolute left-5 top-7 h-14 w-28 animate-pulse rounded-2xl border border-amber-200 bg-amber-50 shadow-[0_10px_24px_rgba(245,158,11,0.12)]" />
						<div className="absolute left-34 top-[3.6rem] h-px w-14 bg-linear-to-r from-amber-300 via-sky-300 to-transparent" />
						<div className="absolute left-52 top-4 h-14 w-28 animate-pulse rounded-2xl border border-sky-200 bg-sky-50 shadow-[0_10px_24px_rgba(14,165,233,0.12)]" />
						<div className="absolute left-52 top-[5.8rem] h-px w-14 bg-linear-to-r from-sky-300 via-emerald-300 to-transparent" />
						<div className="absolute right-5 top-[4.35rem] h-14 w-28 animate-pulse rounded-2xl border border-emerald-200 bg-emerald-50 shadow-[0_10px_24px_rgba(34,197,94,0.12)]" />
						<div className="absolute left-7 top-9 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
							<Workflow className="size-3.5" />
							worker
						</div>
						<div className="absolute left-[13.8rem] top-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
							<Sparkles className="size-3.5" />
							route
						</div>
						<div className="absolute right-9 top-[5.1rem] text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
							tool
						</div>
					</div>
					<p className="mt-3 text-xs leading-5 text-slate-500">
						You&apos;ll land in the editor with an unsaved draft so you can
						inspect and adjust the graph before saving it.
					</p>
				</div>
			</div>
		</div>
	);
}

export function WorkflowDraftGenerationDialog({
	isOpen,
	isGenerating,
	onClose,
	onGenerateDraft,
}: {
	isOpen: boolean;
	isGenerating: boolean;
	onClose: () => void;
	onGenerateDraft: (workflowDescription: string) => Promise<void>;
}) {
	const [workflowDescription, setWorkflowDescription] = useState("");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen) {
			setWorkflowDescription("");
			setErrorMessage(null);
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !isGenerating) {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isGenerating, isOpen, onClose]);

	if (!isOpen) {
		return null;
	}

	const submitDraftGeneration = () => {
		const trimmedDescription = workflowDescription.trim();
		if (trimmedDescription.length < MIN_WORKFLOW_DESCRIPTION_LENGTH) {
			setErrorMessage(
				"Describe the workflow in a little more detail so the graph can be generated reliably.",
			);
			return;
		}

		setErrorMessage(null);
		void onGenerateDraft(trimmedDescription)
			.then(() => {
				onClose();
			})
			.catch((error) => {
				setErrorMessage(
					error instanceof Error
						? error.message
						: "Failed to generate workflow draft.",
				);
			});
	};

	return (
		<div className="fixed inset-0 z-75 bg-slate-950/65 backdrop-blur-sm">
			<button
				type="button"
				className="absolute inset-0"
				aria-label="Close workflow draft generation dialog"
				onClick={() => {
					if (!isGenerating) {
						onClose();
					}
				}}
			/>
			<div className="absolute inset-x-4 top-8 mx-auto flex max-w-3xl flex-col overflow-hidden rounded-4xl border border-slate-200/70 bg-[linear-gradient(160deg,rgba(255,252,244,0.98),rgba(247,251,255,0.98),rgba(241,253,247,0.96))] shadow-[0_30px_120px_rgba(2,6,23,0.45)]">
				<div className="flex items-start justify-between gap-4 border-b border-slate-900/10 bg-white/75 px-5 py-5 backdrop-blur">
					<div className="space-y-2">
						<Badge className="w-fit rounded-full border border-slate-900/10 bg-white/90 text-slate-700 hover:bg-white">
							Generate With AI
						</Badge>
						<div>
							<h3 className="font-display text-2xl text-slate-900">
								Tell the agent what workflow you want
							</h3>
							<p className="max-w-2xl text-sm text-slate-600">
								The API will generate an unsaved draft graph using your live
								model and tool catalog, then open it in the editor for review.
							</p>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={onClose}
						disabled={isGenerating}
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="space-y-5 px-5 py-5">
					{errorMessage ? (
						<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
							{errorMessage}
						</div>
					) : null}

					{isGenerating ? (
						<WorkflowDraftGenerationLoadingState />
					) : (
						<>
							<div className="flex flex-wrap gap-2 text-xs">
								<Badge variant="outline">Workers</Badge>
								<Badge variant="outline">Tools</Badge>
								<Badge variant="outline">Conditions</Badge>
								<Badge variant="outline">Supervisors</Badge>
							</div>

							<div className="space-y-1.5">
								<label
									htmlFor="workflow-ai-description"
									className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
								>
									Workflow description
								</label>
								<textarea
									id="workflow-ai-description"
									value={workflowDescription}
									onChange={(event) =>
										setWorkflowDescription(event.target.value)
									}
									rows={8}
									placeholder="Example: Run OCR on the uploaded document. If the extracted text contains INVOICE, send it to a billing reviewer. Otherwise send it to an operations reviewer. Save the final summary at the end."
									className="w-full rounded-3xl border border-slate-900/15 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-900/40 focus:ring-2 focus:ring-sky-200"
								/>
								<p className="text-xs leading-5 text-slate-500">
									Be concrete about the steps, routing rules, and the outcome
									you want saved or returned. The generator will fail instead of
									opening a broken graph.
								</p>
							</div>
						</>
					)}

					<div className="flex items-center justify-end gap-2 pt-1">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={isGenerating}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={submitDraftGeneration}
							disabled={isGenerating}
							className="rounded-full border border-slate-900/20 bg-slate-900 px-5 text-white hover:bg-slate-800"
						>
							{isGenerating ? (
								<>
									<Loader2 className="mr-2 size-4 animate-spin" />
									Drafting graph...
								</>
							) : (
								<>
									<Sparkles className="mr-2 size-4" />
									Generate Draft
								</>
							)}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
