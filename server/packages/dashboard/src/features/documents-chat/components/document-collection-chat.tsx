import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import {
	Bot,
	Loader2,
	MessageSquare,
	RefreshCcw,
	SendHorizonal,
	Sparkles,
	X,
} from "lucide-react";
import {
	type FormEvent,
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocumentChatCitation } from "@/features/documents-chat/types";
import { assistantSourcesEventSchema } from "@/features/documents-chat/types";
import { cn } from "@/lib/utils";

const starterPrompts = [
	"What themes show up across the recent documents?",
	"Do any documents mention serial numbers or IDs?",
	"Which documents look most relevant to onboarding or instructions?",
];

function messageText(parts: Array<{ type: string; content?: string }>) {
	return parts
		.filter((part) => part.type === "text" && typeof part.content === "string")
		.map((part) => part.content)
		.join("");
}

function CitationCard({ citation }: { citation: DocumentChatCitation }) {
	return (
		<div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 shadow-sm">
			<div className="flex flex-wrap items-center gap-2">
				<p className="text-sm font-semibold text-slate-900">{citation.label}</p>
				<Badge variant="secondary" className="rounded-full text-[11px]">
					{citation.projectName}
				</Badge>
				{citation.apiKeyName ? (
					<Badge variant="outline" className="rounded-full text-[11px]">
						{citation.apiKeyName}
					</Badge>
				) : null}
			</div>
			<p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
				Matched in {citation.matchReason}
			</p>
			<p className="mt-2 text-sm leading-relaxed text-slate-600">
				{citation.excerpt}
			</p>
		</div>
	);
}

export function DocumentCollectionChat({
	organizationId,
	organizationName,
	isLauncherHidden,
}: {
	organizationId: string;
	organizationName: string;
	isLauncherHidden: boolean;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [draft, setDraft] = useState("");
	const [conversationId] = useState(() => crypto.randomUUID());
	const [citationsByMessageId, setCitationsByMessageId] = useState<
		Record<string, DocumentChatCitation[]>
	>({});
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	const scope = useMemo(
		() => ({
			kind: "organization" as const,
			organizationId,
		}),
		[organizationId],
	);

	const { messages, sendMessage, isLoading, error, setMessages } = useChat({
		connection: fetchServerSentEvents("/api/documents/chat", {
			credentials: "include",
		}),
		body: {
			conversationId,
			scope,
		},
		onCustomEvent: (eventType, data) => {
			if (eventType !== "assistant_sources") {
				return;
			}

			const parsed = assistantSourcesEventSchema.safeParse(data);
			if (!parsed.success) {
				return;
			}

			setCitationsByMessageId((current) => ({
				...current,
				[parsed.data.messageId]: parsed.data.citations,
			}));
		},
	});
	const latestMessageId = messages[messages.length - 1]?.id;

	useEffect(() => {
		if (isLauncherHidden) {
			setIsOpen(false);
		}
	}, [isLauncherHidden]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		textareaRef.current?.focus();
	}, [isOpen]);

	useEffect(() => {
		if (!scrollRef.current) {
			return;
		}
		if (!latestMessageId && !isLoading) {
			return;
		}

		scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
	}, [isLoading, latestMessageId]);

	const submitDraft = async (event?: FormEvent) => {
		event?.preventDefault();
		const trimmed = draft.trim();
		if (!trimmed || isLoading) {
			return;
		}

		setDraft("");
		await sendMessage(trimmed);
	};

	const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== "Enter" || event.shiftKey) {
			return;
		}

		event.preventDefault();
		void submitDraft();
	};

	const resetConversation = () => {
		setMessages([]);
		setCitationsByMessageId({});
		setDraft("");
	};

	return (
		<>
			{!isLauncherHidden ? (
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full border border-slate-900/10 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(255,255,255,0.98))] px-4 py-3 text-left shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-transform hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.2)] sm:bottom-6 sm:right-6"
				>
					<span className="flex size-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm">
						<MessageSquare className="size-5" />
					</span>
					<span className="hidden sm:block">
						<span className="block text-sm font-semibold text-slate-900">
							Ask The Collection
						</span>
						<span className="block text-xs text-slate-500">
							Search OCR, descriptions, and context
						</span>
					</span>
				</button>
			) : null}

			{isOpen ? (
				<div className="fixed inset-x-3 bottom-3 z-40 top-auto h-[72vh] rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] shadow-[0_28px_90px_rgba(15,23,42,0.24)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(720px,calc(100vh-7rem))] sm:w-107.5">
					<div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.15),transparent_30%),linear-gradient(rgba(30,41,59,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(30,41,59,0.04)_1px,transparent_1px)] bg-size-[auto,auto,22px_22px,22px_22px]" />
					<div className="relative flex h-full flex-col overflow-hidden rounded-[28px]">
						<div className="border-b border-slate-200/80 px-4 py-4 sm:px-5">
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-3">
									<div className="flex items-center gap-3">
										<div className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
											<Bot className="size-5" />
										</div>
										<div>
											<p className="text-sm font-semibold text-slate-900">
												Document collection chat
											</p>
											<p className="text-xs text-slate-500">
												Ephemeral session with grounded answers
											</p>
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<Badge className="rounded-full bg-slate-900 text-white">
											<Sparkles className="mr-1.5 size-3.5" />
											Org scope
										</Badge>
										<Badge variant="secondary" className="rounded-full">
											{organizationName}
										</Badge>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={resetConversation}
										className="rounded-full border-slate-300 bg-white/80"
									>
										<RefreshCcw className="mr-2 size-4" />
										New chat
									</Button>
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={() => setIsOpen(false)}
										className="rounded-full border-slate-300 bg-white/80"
									>
										<X className="size-4" />
									</Button>
								</div>
							</div>
						</div>

						<div
							ref={scrollRef}
							className="relative flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5"
						>
							{messages.length === 0 ? (
								<div className="space-y-4">
									<div className="rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
										<p className="text-sm font-medium text-slate-900">
											Ask about the documents in this organization.
										</p>
										<p className="mt-2 text-sm leading-relaxed text-slate-600">
											I can search document descriptions, OCR text, and related
											segmentation context, then answer with grounded evidence.
										</p>
									</div>
									<div className="grid gap-3">
										{starterPrompts.map((prompt) => (
											<button
												key={prompt}
												type="button"
												onClick={() => {
													setIsOpen(true);
													setDraft(prompt);
													queueMicrotask(() => {
														textareaRef.current?.focus();
													});
												}}
												className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-left text-sm leading-relaxed text-slate-600 shadow-sm transition-transform hover:-translate-y-0.5 hover:text-slate-900"
											>
												{prompt}
											</button>
										))}
									</div>
								</div>
							) : null}

							{messages.map((message) => {
								const text = messageText(message.parts);
								const citations = citationsByMessageId[message.id] ?? [];
								const isAssistant = message.role === "assistant";

								return (
									<div key={message.id} className="space-y-2">
										<div
											className={cn(
												"max-w-[92%] rounded-3xl px-4 py-3 shadow-sm",
												isAssistant
													? "rounded-tl-md border border-slate-200/80 bg-white/90 text-slate-700"
													: "ml-auto rounded-tr-md bg-slate-900 text-white",
											)}
										>
											<p className="whitespace-pre-wrap text-sm leading-relaxed">
												{text}
											</p>
										</div>
										{isAssistant && citations.length > 0 ? (
											<div className="space-y-2">
												<p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
													Sources
												</p>
												<div className="space-y-2">
													{citations.map((citation) => (
														<CitationCard
															key={citation.documentId}
															citation={citation}
														/>
													))}
												</div>
											</div>
										) : null}
									</div>
								);
							})}

							{isLoading ? (
								<div className="flex max-w-[92%] items-center gap-3 rounded-3xl rounded-tl-md border border-slate-200/80 bg-white/90 px-4 py-3 text-sm text-slate-500 shadow-sm">
									<Loader2 className="size-4 animate-spin" />
									Searching the document collection...
								</div>
							) : null}
						</div>

						<div className="border-t border-slate-200/80 px-4 py-4 sm:px-5">
							{error ? (
								<p className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
									{error.message}
								</p>
							) : null}
							<form className="space-y-3" onSubmit={submitDraft}>
								<textarea
									ref={textareaRef}
									value={draft}
									onChange={(event) => setDraft(event.target.value)}
									onKeyDown={handleComposerKeyDown}
									placeholder="Ask about instructions, identifiers, repeated themes, missing context, or anything else in the document set..."
									className="min-h-28 w-full resize-none rounded-3xl border border-slate-300/80 bg-white/90 px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-slate-900/30"
								/>
								<div className="flex items-center justify-between gap-3">
									<p className="text-xs leading-relaxed text-slate-500">
										Enter sends. Shift+Enter adds a new line. Answers stay
										grounded to this organization only.
									</p>
									<Button
										type="submit"
										disabled={!draft.trim() || isLoading}
										className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
									>
										{isLoading ? (
											<>
												<Loader2 className="mr-2 size-4 animate-spin" />
												Thinking
											</>
										) : (
											<>
												<SendHorizonal className="mr-2 size-4" />
												Send
											</>
										)}
									</Button>
								</div>
							</form>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
